#!/usr/bin/env bun
// Self-contained CLI for searching European science/postdoc jobs on
// EuroScienceJobs.com. No external CLI framework, so it runs anywhere `bun`
// is available with zero install beyond the repo clone.

import { runSearch, type SearchOpts } from "./commands/search.js";
import { runDetail, type DetailOpts } from "./commands/detail.js";

interface Flags {
  _: string[];
  [k: string]: string | boolean | string[];
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [] };
  const alias: Record<string, string> = { q: "query", l: "location", n: "limit" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--") || a.startsWith("-")) {
      const key = alias[a.replace(/^-+/, "")] ?? a.replace(/^-+/, "");
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("-")) {
        flags[key] = true;
      } else {
        flags[key] = next;
        i++;
      }
    } else {
      (flags._ as string[]).push(a);
    }
  }
  return flags;
}

const HELP = `eurosciencejobs-cli — search European science/postdoc jobs on EuroScienceJobs.com

USAGE
  bun run src/cli.ts search --query "<text>" [flags]
  bun run src/cli.ts detail <id|url> [--format json|plain]

SEARCH FLAGS
  --query, -q <text>      Keywords (job title, skill, or role). REQUIRED.
  --location, -l <text>   Location filter, e.g. "Berlin", "Paris". Optional.
  --jobage <days>         Posted within N days (client-side filter). Default: all.
  --page <n>              1-indexed page (client-side slice, 20/page). Default 1.
  --limit, -n <n>         Cap results emitted (client-side).
  --format <fmt>          json (default) | table | plain.

EXAMPLES
  bun run src/cli.ts search -q "postdoc" --format table
  bun run src/cli.ts search -q "PhD candidate" -l "Berlin" --limit 5 --format table
  bun run src/cli.ts detail 297575 --format plain
`;

// Long-form flag names each command accepts (parseFlags resolves the short
// aliases q/l/n to these before validation). "help"/"h" pass so
// `search --help` still prints usage.
const KNOWN_FLAGS: Record<string, Set<string>> = {
  search: new Set([
    "query",
    "location",
    "jobage",
    "page",
    "limit",
    "format",
    "help",
    "h",
  ]),
  detail: new Set(["format", "help", "h"]),
};

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const flags = parseFlags(argv);
  const cmd = (flags._ as string[])[0];

  if (!cmd || flags.help || flags.h) {
    process.stdout.write(HELP);
    return cmd ? 0 : 1;
  }

  // Reject unknown flags instead of silently discarding them: a discarded
  // filter changes what the search returns with no error. add-portal.md's
  // contract requires a bogus flag to exit 1 with a JSON error on stderr.
  const knownFlags = KNOWN_FLAGS[cmd];
  if (knownFlags) {
    for (const key of Object.keys(flags)) {
      if (key === "_" || knownFlags.has(key)) continue;
      process.stderr.write(
        JSON.stringify({
          error: `unknown flag --${key} for '${cmd}' - flags are never silently ignored, because a discarded filter changes what the search returns; see --help for the supported flags`,
          code: "UNKNOWN_FLAG",
        }) + "\n",
      );
      return 1;
    }
  }

  if (cmd === "search") {
    const query =
      typeof flags.query === "string" ? flags.query : undefined;
    if (!query) {
      process.stderr.write(
        JSON.stringify({
          error:
            'the --query/-q flag is required (e.g. -q "postdoc", -q "PhD candidate")',
          code: "NO_QUERY",
        }) + "\n",
      );
      return 1;
    }
    const fmt = (flags.format as string) || "json";

    const parseIntFlag = (
      name: string,
      raw: string | boolean | string[],
    ): number | null => {
      // Number(), not parseInt(): parseInt truncates, so "--jobage 0.5"
      // became 0 and silently dropped the filter. Whole numbers >= 1 only.
      const val = typeof raw === "string" ? Number(raw.trim()) : NaN;
      if (!Number.isInteger(val) || val < 1) {
        process.stderr.write(
          JSON.stringify({
            error: `--${name} must be a whole number of at least 1, got "${raw}"`,
            code: "BAD_ARG",
          }) + "\n",
        );
        return null;
      }
      return val;
    };

    if (flags.jobage !== undefined) {
      const v = parseIntFlag("jobage", flags.jobage);
      if (v === null) return 1;
      flags.jobage = String(v);
    }
    if (flags.page !== undefined) {
      const v = parseIntFlag("page", flags.page);
      if (v === null) return 1;
      flags.page = String(v);
    }
    if (flags.limit !== undefined) {
      const v = parseIntFlag("limit", flags.limit);
      if (v === null) return 1;
      flags.limit = String(v);
    }

    const opts: SearchOpts = {
      query,
      location:
        typeof flags.location === "string" ? flags.location : undefined,
      jobage: flags.jobage ? parseInt(flags.jobage as string, 10) : undefined,
      page: flags.page ? Math.max(1, parseInt(flags.page as string, 10)) : 1,
      limit: flags.limit ? parseInt(flags.limit as string, 10) : undefined,
      format: (["json", "table", "plain"].includes(fmt) ? fmt : "json") as SearchOpts["format"],
    };
    return runSearch(opts);
  }

  if (cmd === "detail") {
    const id = (flags._ as string[])[1];
    if (!id) {
      process.stderr.write(
        JSON.stringify({ error: "detail requires an <id|url>", code: "NO_ID" }) +
          "\n",
      );
      return 1;
    }
    const fmt = (flags.format as string) || "json";
    const opts: DetailOpts = {
      id,
      format: (fmt === "plain" ? "plain" : "json") as DetailOpts["format"],
    };
    return runDetail(opts);
  }

  process.stderr.write(
    JSON.stringify({ error: `Unknown command "${cmd}"`, code: "BAD_CMD" }) +
      "\n",
  );
  return 1;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    process.stderr.write(
      JSON.stringify({
        error: e instanceof Error ? e.message : String(e),
        code: "INTERNAL_ERROR",
      }) + "\n",
    );
    process.exit(1);
  });
