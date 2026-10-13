#!/usr/bin/env bun
// aipaylist-search CLI
// Copyright (c) 2026 AIPayList
//
// Commands, flags, JSON envelope, stderr errors, and unknown-flag rejection
// follow the portal-skill contract in Mads Lorentzen's ai-job-search
// (MIT, Copyright (c) 2026 Mads Lorentzen).

import { runSearch, type SearchOpts } from "./commands/search.ts";
import { runDetail, type DetailOpts } from "./commands/detail.ts";
import { baseUrl, writeError } from "./helpers.ts";

interface Flags {
  _: string[];
  [k: string]: string | boolean | string[];
}

const ALIAS: Record<string, string> = { q: "query", n: "limit", l: "location" };

export function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("-")) {
      (flags._ as string[]).push(a);
      continue;
    }
    const name = a.replace(/^-+/, "");
    const key = ALIAS[name] ?? name;
    const next = argv[i + 1];
    let value: string | boolean = true;
    if (next !== undefined && !next.startsWith("-")) {
      value = next;
      i++;
    }
    flags[key] = value;
  }
  return flags;
}

function stringFlag(raw: string | boolean | string[] | undefined): string | undefined {
  return typeof raw === "string" ? raw : undefined;
}

const HELP = `aipaylist-search-cli — search paid AI training / eval / annotation roles on AIPayList

USAGE
  bun run src/cli.ts search [-q "<keywords>"] [flags] [--format json|table|plain]
  bun run src/cli.ts detail <id|url> [--format json|plain]

SEARCH FLAGS
  --query, -q          Keywords (title / excerpt). Optional.
  --location, -l       Country name, ISO code, or "worldwide". Alias: --country.
  --category           AIPayList field: writing, coding, annotation, rlhf_eval, ...
  --min                Minimum advertised top hourly rate (USD). "Up to $X" roles can match.
  --platform           Platform id slug, e.g. mercor, dataannotation.
  --jobage             Posted / first-seen within N days.
  --page               1-indexed page. Default 1.
  --limit, -n          Results per page. Default 25 (API cap 50).
  --format             json (default) | table | plain.

DETAIL
  <id|url>             A job UUID from search, or https://aipaylist.com/jobs/<uuid>.

EXAMPLES
  bun run src/cli.ts search -q "writer" --min 30 --format table
  bun run src/cli.ts search --category coding --country US --jobage 14 --format table
  bun run src/cli.ts search --location worldwide -q "legal" --limit 10
  bun run src/cli.ts detail aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee --format plain

Listing URLs stay on aipaylist.com. Pay Index (/pay.json) is CC BY 4.0; this
feed is live listings, not that dataset. Source: ${baseUrl()}/jobs.json
Override the host with AIPAYLIST_API_URL.
`;

function parseIntFlag(name: string, raw: string | boolean | string[]): number | null {
  // Number(), not parseInt(): parseInt truncates, so "--jobage 0.5" became 0
  // and silently dropped the freshness filter in other portal CLIs.
  const val = typeof raw === "string" ? Number(raw.trim()) : NaN;
  if (!Number.isInteger(val) || val < 1) {
    writeError(`--${name} must be a whole number of at least 1, got "${raw}"`, "BAD_ARG");
    return null;
  }
  return val;
}

const KNOWN_FLAGS: Record<string, Set<string>> = {
  search: new Set([
    "query", "location", "country", "category", "min", "platform", "jobage",
    "page", "limit", "format", "help", "h",
  ]),
  detail: new Set(["format", "help", "h"]),
};

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const flags = parseFlags(argv);
  const cmd = (flags._ as string[])[0];

  if (!cmd || flags.help || flags.h) {
    process.stdout.write(HELP);
    return cmd ? 0 : 1;
  }

  const knownFlags = KNOWN_FLAGS[cmd];
  if (knownFlags) {
    for (const key of Object.keys(flags)) {
      if (key === "_" || knownFlags.has(key)) continue;
      writeError(
        `unknown flag --${key} for '${cmd}' - flags are never silently ignored, because a discarded filter changes what the search returns. See --help for the supported flags`,
        "UNKNOWN_FLAG",
      );
      return 1;
    }
  }

  if (cmd === "search") {
    const fmt = stringFlag(flags.format) || "json";
    if (!["json", "table", "plain"].includes(fmt)) {
      writeError(`--format must be json|table|plain, got "${fmt}"`, "BAD_ARG");
      return 1;
    }
    for (const name of ["jobage", "page", "limit"] as const) {
      if (flags[name] !== undefined) {
        const v = parseIntFlag(name, flags[name]);
        if (v === null) return 1;
        flags[name] = String(v);
      }
    }
    let min: number | undefined;
    if (flags.min !== undefined) {
      const raw = stringFlag(flags.min);
      const n = raw != null ? Number(raw) : NaN;
      if (!Number.isFinite(n) || n < 0) {
        writeError(`--min must be a number of at least 0, got "${flags.min}"`, "BAD_ARG");
        return 1;
      }
      if (n > 0) min = n;
    }
    const opts: SearchOpts = {
      query: stringFlag(flags.query),
      jobage: flags.jobage ? Number(flags.jobage) : undefined,
      page: flags.page ? Number(flags.page) : 1,
      limit: flags.limit ? Number(flags.limit) : 25,
      format: fmt as SearchOpts["format"],
      country: stringFlag(flags.country) ?? stringFlag(flags.location),
      category: stringFlag(flags.category),
      min,
      platform: stringFlag(flags.platform),
    };
    return runSearch(opts);
  }

  if (cmd === "detail") {
    const id = (flags._ as string[])[1];
    if (!id) {
      writeError("detail requires a <id|url>", "NO_ID");
      return 1;
    }
    const fmt = stringFlag(flags.format) || "json";
    const opts: DetailOpts = { id, format: fmt === "plain" ? "plain" : "json" };
    return runDetail(opts);
  }

  writeError(`Unknown command "${cmd}"`, "BAD_CMD");
  return 1;
}

function invokedAsCli(): boolean {
  if ("main" in import.meta && (import.meta as ImportMeta & { main?: boolean }).main) return true;
  const arg = (process.argv[1] ?? "").replace(/\\/g, "/");
  return /\/cli\.(ts|js)$/.test(arg);
}

if (invokedAsCli()) {
  main()
    .then((code) => process.exit(code))
    .catch((e) => {
      writeError(e instanceof Error ? e.message : String(e), "INTERNAL_ERROR");
      process.exit(1);
    });
}
