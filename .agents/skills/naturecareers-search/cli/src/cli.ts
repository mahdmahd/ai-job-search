#!/usr/bin/env bun
// Self-contained CLI for searching Nature Careers (nature.com/naturecareers),
// a global science/academic + industry research job board (Madgex platform).
// No external CLI framework and zero runtime dependencies beyond `bun`.
//
// Keep volume low: this reads Nature's public job pages; robots.txt allows
// the search/detail paths but disallows /naturecareers/jobs/search and
// /naturecareers/jobsrss/, and blocks named AI crawlers site-wide — this CLI
// always sends an honest naturecareers-cli UA.

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

const HELP = `naturecareers-cli — search Nature Careers (global science/academic + industry research jobs)

USAGE
  bun run src/cli.ts search --query "<keywords>" [flags]
  bun run src/cli.ts detail <id|url> [--format json|plain]

SEARCH FLAGS
  --query, -q <text>   Keywords (title, skill, role). REQUIRED.
  --page <n>           1-indexed page (20 results/page). Default 1.
  --limit, -n <n>      Cap results emitted (client-side).
  --sort <order>       relevance (default) | date.
  --format <fmt>       json (default) | table | plain.

  There is no --location flag: the clean search path has no server-side
  location parameter. Put the city in --query (e.g. -q "postdoc London"),
  and read each result's location field.

EXAMPLES
  bun run src/cli.ts search -q "PhD candidate" --limit 5 --format table
  bun run src/cli.ts search -q "postdoctoral researcher London" --sort date --format table
  bun run src/cli.ts search -q "computational biology" --page 2 --format json
  bun run src/cli.ts detail 12864992 --format plain

Keep volume low — personal use only.
`

// Long-form flag names each command accepts (parseFlags resolves the short
// aliases q/n to these before validation). "help"/"h" pass so `search --help`
// still prints usage.
const KNOWN_FLAGS: Record<string, Set<string>> = {
  search: new Set(["query", "page", "limit", "sort", "format", "help", "h"]),
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
          error: 'the --query/-q flag is required (e.g. -q "PhD candidate", -q "computational biology")',
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

    const sort = typeof flags.sort === "string" ? flags.sort.toLowerCase() : "relevance"
    if (!["relevance", "date"].includes(sort)) {
      process.stderr.write(
        JSON.stringify({
          error: `--sort must be one of relevance, date; got "${flags.sort}"`,
          code: "VALIDATION",
        }) + "\n",
      )
      return 1
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
      page: flags.page ? parseInt(flags.page as string, 10) : 1,
      limit: flags.limit ? parseInt(flags.limit as string, 10) : undefined,
      sort: sort as SearchOpts["sort"],
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
