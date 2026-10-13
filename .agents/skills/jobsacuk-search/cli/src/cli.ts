#!/usr/bin/env bun
// Self-contained CLI for searching Jobs.ac.uk (www.jobs.ac.uk), a UK academic
// jobs board (English, GBP). No external CLI framework and zero runtime
// dependencies beyond `bun`.
//
// Keep volume low: this reads the portal's public pages; robots.txt allows the
// /search/ and /job/ paths but disallows /job/feedback/ and /enhanced/fp/.
// h-captcha markup is embedded in every page but has never blocked plain
// requests — if a request ever fails, back off and report; never try to solve
// challenges. This CLI always sends an honest jobsacuk-cli UA.

import { runSearch, type SearchOpts } from "./commands/search.js"
import { runDetail, type DetailOpts } from "./commands/detail.js"

interface Flags {
  _: string[]
  [k: string]: string | boolean | string[]
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [] }
  const alias: Record<string, string> = { q: "query", l: "location", n: "limit" }
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

const HELP = `jobsacuk-cli — search Jobs.ac.uk (UK academic jobs, English, GBP)

USAGE
  bun run src/cli.ts search --query "<keywords>" [flags]
  bun run src/cli.ts detail <id|url> [--format json|plain]

SEARCH FLAGS
  --query, -q <text>      Keywords (title, skill, role). REQUIRED.
  --location, -l <text>   Location filter, mapped to the location param
                          (e.g. "London", "Edinburgh").
  --page <n>              1-indexed page (25 results/page). Default 1.
  --limit, -n <n>         Cap results emitted (client-side).
  --format <fmt>          json (default) | table | plain.

  There is no --jobage flag: the portal has no posting-age parameter.
  Each result carries date placed ("31 Jul") and the closing date.

DETAIL IDS
  detail accepts a REF (e.g. DSL474), a full /job/REF/slug URL, or a bare
  /job/REF path. The numeric advert-id from search results is accepted too
  and resolved via the search page (see url-reference.md).

EXAMPLES
  bun run src/cli.ts search -q "PhD candidate" --limit 5 --format table
  bun run src/cli.ts search -q "research fellow" -l "London" --format table
  bun run src/cli.ts search -q "lecturer" -l "Edinburgh" --page 2 --format json
  bun run src/cli.ts detail DSL474 --format plain

Keep volume low — personal use only.
`

// Long-form flag names each command accepts (parseFlags resolves the short
// aliases q/l/n to these before validation). "help"/"h" pass so `search --help`
// still prints usage.
const KNOWN_FLAGS: Record<string, Set<string>> = {
  search: new Set(["query", "location", "page", "limit", "format", "help", "h"]),
  detail: new Set(["format", "help", "h"]),
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2)
  const flags = parseFlags(argv)
  const cmd = (flags._ as string[])[0]

  if (!cmd || flags.help || flags.h) {
    process.stdout.write(HELP)
    return cmd ? 0 : 1
  }

  // Reject unknown flags instead of silently discarding them: a discarded
  // filter changes what the search returns with no error (a wrong flag name
  // once returned an entire portal's database as if it matched the query).
  const knownFlags = KNOWN_FLAGS[cmd]
  if (knownFlags) {
    for (const key of Object.keys(flags)) {
      if (key === "_" || knownFlags.has(key)) continue
      process.stderr.write(
        JSON.stringify({
          error: `unknown flag --${key} for '${cmd}' - flags are never silently ignored, because a discarded filter changes what the search returns; see --help for the supported flags`,
          code: "UNKNOWN_FLAG",
        }) + "\n",
      )
      return 1
    }
  }

  if (cmd === "search") {
    const query = typeof flags.query === "string" ? flags.query.trim() : ""
    if (!query) {
      process.stderr.write(
        JSON.stringify({
          error: 'the --query/-q flag is required (e.g. -q "PhD candidate", -q "research fellow")',
          code: "MISSING_REQUIRED",
        }) + "\n",
      )
      return 1
    }

    // Number(), not parseInt(): parseInt truncates, so "--page 1.5" would
    // silently become page 1. Whole numbers >= 1 only.
    const parseIntFlag = (name: string, raw: string | boolean | string[]): number | null => {
      const val = typeof raw === "string" ? Number(raw.trim()) : NaN
      if (!Number.isInteger(val) || val < 1) {
        process.stderr.write(
          JSON.stringify({
            error: `--${name} must be a whole number of at least 1, got "${raw}"`,
            code: "VALIDATION",
          }) + "\n",
        )
        return null
      }
      return val
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

    const fmt = typeof flags.format === "string" ? flags.format : "json"
    if (!["json", "table", "plain"].includes(fmt)) {
      process.stderr.write(
        JSON.stringify({
          error: `--format must be one of json, table, plain; got "${fmt}"`,
          code: "VALIDATION",
        }) + "\n",
      )
      return 1
    }

    const opts: SearchOpts = {
      query,
      location: typeof flags.location === "string" ? flags.location.trim() : undefined,
      page: flags.page ? parseInt(flags.page as string, 10) : 1,
      limit: flags.limit ? parseInt(flags.limit as string, 10) : undefined,
      format: fmt as SearchOpts["format"],
    }
    return runSearch(opts)
  }

  if (cmd === "detail") {
    const id = (flags._ as string[])[1]
    if (!id) {
      process.stderr.write(
        JSON.stringify({ error: "detail requires an <id|url>", code: "MISSING_REQUIRED" }) + "\n",
      )
      return 1
    }
    const fmt = typeof flags.format === "string" ? flags.format : "json"
    if (!["json", "plain"].includes(fmt)) {
      process.stderr.write(
        JSON.stringify({
          error: `--format must be one of json, plain; got "${fmt}"`,
          code: "VALIDATION",
        }) + "\n",
      )
      return 1
    }
    const opts: DetailOpts = {
      id,
      format: fmt as DetailOpts["format"],
    }
    return runDetail(opts)
  }

  process.stderr.write(JSON.stringify({ error: `Unknown command "${cmd}"`, code: "BAD_CMD" }) + "\n")
  return 1
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    process.stderr.write(
      JSON.stringify({
        error: e instanceof Error ? e.message : String(e),
        code: "INTERNAL_ERROR",
      }) + "\n",
    )
    process.exit(1)
  })
