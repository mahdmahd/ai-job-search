#!/usr/bin/env bun
// Self-contained CLI for searching academic jobs on vacancyedu.com's public
// WordPress REST API (PhD, postdoc, and faculty postings; global, English).
// No external CLI framework, so it runs anywhere `bun` is available with zero
// install beyond the repo clone.
//
// Personal use only: robots.txt allows access and no login is required, but
// keep volume low — this is a personal job-search tool, not a bulk crawler.

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

const HELP = `vacancyedu-cli — search academic jobs on vacancyedu.com (global, English)

USAGE
  bun run src/cli.ts search --query "<keywords>" [flags]
  bun run src/cli.ts detail <id|url> [--format json|plain]

SEARCH FLAGS
  --query, -q <text>      Keywords (PhD, postdoc, faculty role / field). REQUIRED.
                          Include the country in the query to narrow by location,
                          e.g. -q "postdoc Netherlands".
  --jobage <days>         Posted within N days (maps to the WP REST after= param).
                          Omit for all postings.
  --page <n>              1-indexed page (100 results/page from the API). Default 1.
  --limit, -n <n>         Cap results emitted (client-side, after the page fetch).
  --format <fmt>          json (default) | table | plain.

NOTE
  The portal has NO server-side location filter. Institution and country live
  only in the post title ("... at <Institution>, <Country>"); the CLI parses
  them out, but you must put the location in --query yourself.

EXAMPLES
  bun run src/cli.ts search -q "PhD candidate" --limit 5 --format table
  bun run src/cli.ts search -q "postdoctoral researcher" --jobage 30 --format table
  bun run src/cli.ts search -q "postdoc Netherlands" --format table
  bun run src/cli.ts search -q "assistant professor Germany" --format plain
  bun run src/cli.ts detail 17395 --format plain

Personal use only — robots.txt allows it, but keep volume low (no bulk crawling).
`

// Long-form flag names each command accepts (parseFlags resolves the short
// aliases q/n to these before validation). "help"/"h" pass so `search --help`
// still prints usage.
const KNOWN_FLAGS: Record<string, Set<string>> = {
  search: new Set(["query", "jobage", "page", "limit", "format", "help", "h"]),
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
  // add-portal.md's contract requires a bogus flag to exit 1 with a JSON
  // error on stderr.
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
    const query = typeof flags.query === "string" ? flags.query : undefined
    if (!query) {
      process.stderr.write(
        JSON.stringify({
          error: "--query/-q is required (e.g. -q \"postdoctoral researcher Netherlands\")",
          code: "MISSING_REQUIRED",
        }) + "\n",
      )
      return 1
    }
    const fmt = (flags.format as string) || "json"

    const parseIntFlag = (name: string, raw: string | boolean | string[]): number | null => {
      // Number(), not parseInt(): parseInt truncates, so "--jobage 0.5"
      // became 0 and silently dropped after= from the request.
      // Whole numbers >= 1 only, matching the other portal CLIs.
      const val = typeof raw === "string" ? Number(raw.trim()) : NaN
      if (!Number.isInteger(val) || val < 1) {
        process.stderr.write(
          JSON.stringify({ error: `--${name} must be a whole number of at least 1, got "${raw}"`, code: "BAD_ARG" }) + "\n",
        )
        return null
      }
      return val
    }

    if (flags.jobage !== undefined) {
      const v = parseIntFlag("jobage", flags.jobage)
      if (v === null) return 1
      flags.jobage = String(v)
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
      jobage: flags.jobage ? parseInt(flags.jobage as string, 10) : 9999,
      page: flags.page ? Math.max(1, parseInt(flags.page as string, 10)) : 1,
      limit: flags.limit ? parseInt(flags.limit as string, 10) : undefined,
      format: (["json", "table", "plain"].includes(fmt) ? fmt : "json") as SearchOpts["format"],
    }
    return runSearch(opts)
  }

  if (cmd === "detail") {
    const id = (flags._ as string[])[1]
    if (!id) {
      process.stderr.write(JSON.stringify({ error: "detail requires an <id|url>", code: "NO_ID" }) + "\n")
      return 1
    }
    const fmt = (flags.format as string) || "json"
    const opts: DetailOpts = {
      id,
      format: (fmt === "plain" ? "plain" : "json") as DetailOpts["format"],
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
