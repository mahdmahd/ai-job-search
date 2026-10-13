#!/usr/bin/env bun
// Self-contained CLI for Job Bank Canada / Guichet-Emplois (jobbank.gc.ca),
// the Government of Canada's national job board. Public data, no authentication,
// no API key, zero runtime dependencies - it runs anywhere `bun` is available.
//
// robots.txt allows every path we touch and asks for `Crawl-delay: 5`; the CLI
// honours that between requests, so a multi-page sweep is deliberately unhurried.

import { runSearch, type SearchOpts } from "./commands/search.js"
import { runDetail, type DetailOpts } from "./commands/detail.js"
import { runCities, type CitiesOpts } from "./commands/cities.js"
import { PROVINCES, type Lang } from "./helpers.js"

interface Flags {
  _: string[]
  [key: string]: string | boolean | string[]
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [] }
  const alias: Record<string, string> = {
    q: "query",
    l: "location",
    p: "province",
    n: "limit",
  }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg.startsWith("-")) {
      const key = alias[arg.replace(/^-+/, "")] ?? arg.replace(/^-+/, "")
      const next = argv[i + 1]
      if (next === undefined || next.startsWith("-")) {
        flags[key] = true
      } else {
        flags[key] = next
        i++
      }
    } else {
      ;(flags._ as string[]).push(arg)
    }
  }
  return flags
}

const HELP = `jobbank-ca-cli — search Job Bank Canada / Guichet-Emplois (jobbank.gc.ca)

USAGE
  bun run src/cli.ts search [flags]
  bun run src/cli.ts detail <id|url> [--lang en|fr] [--format json|plain]
  bun run src/cli.ts cities <name> [--lang en|fr] [--format json|table|plain]

SEARCH FLAGS
  --query, -q <text>      Keywords (job title, skill, NOC title). Recommended.
  --location, -l <city>   City to filter by, e.g. "Toronto" or "Toronto, ON".
                          Resolved to a Job Bank city id automatically.
  --province, -p <code>   Province/territory: ${PROVINCES.join(" ")}
  --jobage <days>         Posted within N days (1 = today).
  --page <n>              1-indexed page (25 results/page). Default 1.
  --limit, -n <n>         Cap results emitted (client-side).
  --sort <mode>           relevance (default) | date
  --lang <en|fr>          English (jobbank.gc.ca) or French (guichetemplois.gc.ca).
  --format <fmt>          json (default) | table | plain

EXAMPLES
  bun run src/cli.ts search -q "software developer" -l "Toronto, ON" --format table
  bun run src/cli.ts search -q "registered nurse" -p BC --jobage 7 --sort date --format table
  bun run src/cli.ts search -q "data analyst" -l Calgary --page 2 --limit 10
  bun run src/cli.ts search -q "développeur" --lang fr -l "Montréal, QC" --format table
  bun run src/cli.ts cities Windsor --format table
  bun run src/cli.ts detail 49969224 --format plain

NOTES
  Filtering by city requires the city id; --location does that lookup for you.
  Passing a city name to Job Bank without the id is silently ignored by the site.
`

function parseIntFlag(name: string, raw: string | boolean | string[]): number | null {
  const value = parseInt(raw as string, 10)
  if (isNaN(value)) {
    process.stderr.write(
      JSON.stringify({ error: `--${name} must be a number, got "${raw}"`, code: "BAD_ARG" }) + "\n",
    )
    return null
  }
  return value
}

function resolveLang(flags: Flags): Lang | null {
  const raw = typeof flags.lang === "string" ? flags.lang.toLowerCase() : "en"
  if (raw !== "en" && raw !== "fr") {
    process.stderr.write(
      JSON.stringify({ error: `--lang must be "en" or "fr", got "${raw}"`, code: "BAD_LANG" }) + "\n",
    )
    return null
  }
  return raw
}

async function main(): Promise<number> {
  const flags = parseFlags(process.argv.slice(2))
  const cmd = (flags._ as string[])[0]

  if (!cmd || flags.help || flags.h) {
    process.stdout.write(HELP)
    return cmd ? 0 : 1
  }

  const lang = resolveLang(flags)
  if (lang === null) return 1

  if (cmd === "search") {
    for (const name of ["jobage", "page", "limit"]) {
      if (flags[name] !== undefined) {
        const value = parseIntFlag(name, flags[name])
        if (value === null) return 1
        flags[name] = String(value)
      }
    }

    const rawSort = typeof flags.sort === "string" ? flags.sort.toLowerCase() : "relevance"
    if (rawSort !== "relevance" && rawSort !== "date") {
      process.stderr.write(
        JSON.stringify({ error: `--sort must be "relevance" or "date", got "${rawSort}"`, code: "BAD_ARG" }) + "\n",
      )
      return 1
    }

    const rawFormat = typeof flags.format === "string" ? flags.format : "json"
    const opts: SearchOpts = {
      query: typeof flags.query === "string" ? flags.query : undefined,
      location: typeof flags.location === "string" ? flags.location : undefined,
      province: typeof flags.province === "string" ? flags.province : undefined,
      jobage: flags.jobage ? parseInt(flags.jobage as string, 10) : undefined,
      page: flags.page ? Math.max(1, parseInt(flags.page as string, 10)) : 1,
      limit: flags.limit ? parseInt(flags.limit as string, 10) : undefined,
      sort: rawSort,
      lang,
      format: (["json", "table", "plain"].includes(rawFormat) ? rawFormat : "json") as SearchOpts["format"],
    }

    if (!opts.query && !opts.location && !opts.province) {
      process.stderr.write(
        JSON.stringify({
          error: "search needs at least one of --query, --location or --province",
          code: "NO_CRITERIA",
        }) + "\n",
      )
      return 1
    }
    return runSearch(opts)
  }

  if (cmd === "detail") {
    const id = (flags._ as string[])[1]
    if (!id) {
      process.stderr.write(
        JSON.stringify({ error: "detail requires an <id|url>", code: "NO_ID" }) + "\n",
      )
      return 1
    }
    const rawFormat = typeof flags.format === "string" ? flags.format : "json"
    const opts: DetailOpts = { id, lang, format: rawFormat === "plain" ? "plain" : "json" }
    return runDetail(opts)
  }

  if (cmd === "cities") {
    const query = (flags._ as string[])[1]
    if (!query) {
      process.stderr.write(
        JSON.stringify({ error: "cities requires a <name> to look up", code: "NO_QUERY" }) + "\n",
      )
      return 1
    }
    if (flags.limit !== undefined) {
      const value = parseIntFlag("limit", flags.limit)
      if (value === null) return 1
      flags.limit = String(value)
    }
    const rawFormat = typeof flags.format === "string" ? flags.format : "json"
    const opts: CitiesOpts = {
      query,
      lang,
      limit: flags.limit ? parseInt(flags.limit as string, 10) : 10,
      format: (["json", "table", "plain"].includes(rawFormat) ? rawFormat : "json") as CitiesOpts["format"],
    }
    return runCities(opts)
  }

  process.stderr.write(
    JSON.stringify({ error: `Unknown command "${cmd}"`, code: "BAD_CMD" }) + "\n",
  )
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
