#!/usr/bin/env bun
// Self-contained CLI for searching research jobs on EURAXESS
// (https://euraxess.ec.europa.eu — European Commission, EU/EEA research
// mobility). No authentication, zero external CLI framework, zero runtime
// dependencies — it runs anywhere `bun` is available.
//
// PERSONAL USE ONLY. robots.txt disallows parameterized URLs (`Disallow: /*?`)
// and detail pages (`Disallow: /jobs/*`); the user has accepted running this
// tool anyway at very low volume for personal job hunting. Do not use it
// commercially or for bulk data collection. Run it on your own responsibility.

import { runSearch, type SearchOpts } from "./commands/search.js"
import { runDetail, type DetailOpts } from "./commands/detail.js"

interface Flags {
  _: string[]
  [k: string]: string | boolean | string[]
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [] }
  const alias: Record<string, string> = { q: "query", n: "limit" }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith("--") || a.startsWith("-")) {
      const key = alias[a.replace(/^-+/, "")] ?? a.replace(/^-+/, "")
      const next = argv[i + 1]
      if (next === undefined || next.startsWith("-")) {
        flags[key] = true
      } else {
        flags[key] = next
        i++
      }
    } else {
      ;(flags._ as string[]).push(a)
    }
  }
  return flags
}

const HELP = `euraxess-cli — search research jobs on EURAXESS (EU/EEA research mobility)

USAGE
  bun run src/cli.ts search -q "<keywords>" [flags]
  bun run src/cli.ts detail <id|url> [--format json|plain]

SEARCH FLAGS
  --query, -q <text>      Keywords (job title, research field, role). REQUIRED.
                          Location and country can be included in the query
                          (EURAXESS has no keyword-URL location parameter).
  --page <n>              1-indexed page (10 results/page). Default 1.
  --limit, -n <n>         Cap results emitted (client-side).
  --format <fmt>          json (default) | table | plain.

NOT SUPPORTED
  --location / --jobage   EURAXESS's GET search URL has no location or posting-age
                          parameter; include the country in --query instead.

EXAMPLES
  bun run src/cli.ts search -q "PhD candidate Netherlands" --format table
  bun run src/cli.ts search -q "postdoctoral researcher" --page 2 --limit 5
  bun run src/cli.ts search -q "research fellow Germany" --format table
  bun run src/cli.ts detail 472465 --format plain

PERSONAL USE ONLY — robots.txt disallows the parameterized search URLs this CLI
requests (and detail pages); keep volume to a handful of requests per session.

EURAXESS serves job detail pages only intermittently to non-browser clients;
when it refuses, the "detail" command fails cleanly with code DETAIL_BLOCKED (see SKILL.md).
`

// Long-form flag names each command accepts (parseFlags resolves the short
// aliases q/n to these before validation). "help"/"h" pass so `search --help`
// still prints usage. Anything else is rejected: a discarded filter changes
// what the search returns with no error, and the contract requires a bogus
// flag to exit 1 with a JSON error on stderr.
const KNOWN_FLAGS: Record<string, Set<string>> = {
  search: new Set(["query", "page", "limit", "format", "help", "h"]),
  detail: new Set(["format", "help", "h"]),
}

function parseIntFlag(
  name: string,
  raw: string | boolean | string[],
): number | null {
  // Number(), not parseInt(): parseInt truncates, so "--page 1.5" would become
  // 1 and silently fetch the wrong page. Whole numbers >= 1 only.
  const val = typeof raw === "string" ? Number(raw.trim()) : NaN
  if (!Number.isInteger(val) || val < 1) {
    writeErrorSync(
      `--${name} must be a whole number of at least 1, got "${String(raw)}"`,
      "VALIDATION",
    )
    return null
  }
  return val
}

function writeErrorSync(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2)
  const flags = parseFlags(argv)
  const cmd = (flags._ as string[])[0]

  if (!cmd || flags.help || flags.h) {
    process.stdout.write(HELP)
    return cmd ? 0 : 1
  }

  const knownFlags = KNOWN_FLAGS[cmd]
  if (knownFlags) {
    for (const key of Object.keys(flags)) {
      if (key === "_" || knownFlags.has(key)) continue
      writeErrorSync(
        `unknown flag --${key} for '${cmd}' - flags are never silently ignored, because a discarded filter changes what the search returns; see --help for the supported flags`,
        "UNKNOWN_FLAG",
      )
      return 1
    }
  }

  if (cmd === "search") {
    const query = typeof flags.query === "string" ? flags.query.trim() : ""
    if (!query) {
      writeErrorSync(
        'the --query/-q flag is required (e.g. -q "PhD candidate Netherlands")',
        "MISSING_REQUIRED",
      )
      return 1
    }

    if (flags.page !== undefined) {
      const v = parseIntFlag("page", flags.page)
      if (v === null) return 1
      flags.page = String(v)
    }
    if (flags.limit !== undefined) {
      const v = parseIntFlag("limit", flags.limit)
      if (v === null) return 1
      flags.limit = String(v)
    }

    const opts: SearchOpts = {
      query,
      page: flags.page ? parseInt(flags.page as string, 10) : 1,
      limit: flags.limit ? parseInt(flags.limit as string, 10) : undefined,
      format: (["json", "table", "plain"].includes(
        (flags.format as string) || "json",
      )
        ? (flags.format as string)
        : "json") as SearchOpts["format"],
    }
    return runSearch(opts)
  }

  if (cmd === "detail") {
    const id = (flags._ as string[])[1]
    if (!id) {
      writeErrorSync("detail requires an <id|url>", "MISSING_REQUIRED")
      return 1
    }
    const fmt = (flags.format as string) || "json"
    const opts: DetailOpts = {
      id,
      format: (fmt === "plain" ? "plain" : "json") as DetailOpts["format"],
    }
    return runDetail(opts)
  }

  writeErrorSync(`Unknown command "${cmd}"`, "BAD_CMD")
  return 1
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    writeErrorSync(
      e instanceof Error ? e.message : String(e),
      "INTERNAL_ERROR",
    )
    process.exit(1)
  })
