#!/usr/bin/env bun
// Self-contained CLI for searching Flowxtra's public cross-tenant jobs API.
// No external CLI framework and zero runtime dependencies, so it runs anywhere
// `bun` is available with nothing installed beyond the repo clone.
//
// Flowxtra (https://flowxtra.com) is a multi-tenant ATS; its central endpoint
// lists live postings from every company on the platform in one board-wide
// feed. Reads are public — no API key. This skill is maintained by Flowxtra
// (first-party), so there is no ToS concern for automated read access.

import { runSearch, WORKPLACES, type SearchOpts } from "./commands/search.js"
import { runDetail, type DetailOpts } from "./commands/detail.js"
import { baseUrl } from "./helpers.js"

interface Flags {
  _: string[]
  [k: string]: string | boolean | string[]
}

// Short-flag aliases.
const ALIAS: Record<string, string> = { q: "query", l: "location", n: "limit" }

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith("-")) {
      ;(flags._ as string[]).push(a)
      continue
    }
    const name = a.replace(/^-+/, "")
    const key = ALIAS[name] ?? name
    const next = argv[i + 1]
    // A flag with no following value (or another flag next) is a boolean.
    let value: string | boolean = true
    if (next !== undefined && !next.startsWith("-")) {
      value = next
      i++
    }
    flags[key] = value
  }
  return flags
}

const HELP = `flowxtra-cli — search live jobs across every company on the Flowxtra ATS platform

USAGE
  bun run src/cli.ts search [-q "<keywords>"] [flags] [--format json|table|plain]
  bun run src/cli.ts detail <id|url> [--format json|plain]

SEARCH FLAGS
  --query, -q <text>      Job-title keywords (server-side search). Optional.
  --location, -l <text>   Company city, state, or country (server-side), e.g. "Spain".
  --workplace <type>      Exact workplace: On-site | Hybrid | Remote.
  --company <text>        Company-name search (server-side).
  --jobage <days>         Posted within N days (client-side; the API has no age param).
  --page <n>              1-indexed page. Default 1.
  --limit, -n <n>         Results per page (server-side). Default 25.
  --format <fmt>          json (default) | table | plain.

DETAIL
  <id|url>                A Flowxtra job id from a search result's id (e.g. M88PB),
                          or a full apply URL (https://flowxtra.com/apply/<id>) or
                          career-page URL (https://<company>.<domain>/job/<slug>/<id>).

EXAMPLES
  bun run src/cli.ts search -q "sales" --limit 10 --format table
  bun run src/cli.ts search -q "engineer" --location Spain --format table
  bun run src/cli.ts search --workplace Remote --jobage 14 --format table
  bun run src/cli.ts search --company Arogreen --format table
  bun run src/cli.ts detail M88PB --format plain

Reads are public (no API key). Source: ${baseUrl()} — Flowxtra's own public API
(first-party skill). Override with FLOWXTRA_API_URL (mainly for tests).
`

function parseIntFlag(name: string, raw: string | boolean | string[]): number | null {
  const val = parseInt(raw as string, 10)
  if (isNaN(val)) {
    process.stderr.write(JSON.stringify({ error: `--${name} must be a number, got "${raw}"`, code: "BAD_ARG" }) + "\n")
    return null
  }
  return val
}

function stringFlag(raw: string | boolean | string[] | undefined): string | undefined {
  return typeof raw === "string" ? raw : undefined
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2)
  const flags = parseFlags(argv)
  const cmd = (flags._ as string[])[0]

  if (!cmd || flags.help || flags.h) {
    process.stdout.write(HELP)
    return cmd ? 0 : 1
  }

  if (cmd === "search") {
    const fmt = (flags.format as string) || "json"

    for (const name of ["jobage", "page", "limit"] as const) {
      if (flags[name] !== undefined) {
        const v = parseIntFlag(name, flags[name])
        if (v === null) return 1
        flags[name] = String(v)
      }
    }

    const workplace = stringFlag(flags.workplace)
    if (workplace && !(WORKPLACES as readonly string[]).includes(workplace)) {
      process.stderr.write(
        JSON.stringify({
          error: `--workplace must be one of ${WORKPLACES.join(", ")}, got "${workplace}"`,
          code: "BAD_ARG",
        }) + "\n",
      )
      return 1
    }

    const opts: SearchOpts = {
      query: stringFlag(flags.query),
      location: stringFlag(flags.location),
      workplace,
      company: stringFlag(flags.company),
      jobage: flags.jobage ? parseInt(flags.jobage as string, 10) : 9999,
      page: flags.page ? Math.max(1, parseInt(flags.page as string, 10)) : 1,
      limit: flags.limit ? Math.max(1, parseInt(flags.limit as string, 10)) : 25,
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
    const opts: DetailOpts = { id, format: fmt === "plain" ? "plain" : "json" }
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
