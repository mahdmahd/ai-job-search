#!/usr/bin/env bun
// Self-contained CLI for GC Jobs / Emplois GC — the Government of Canada's federal
// public service recruitment site (emploisfp-psjobs.cfp-psc.gc.ca).
//
// Public advertisements only ("Jobs open to the public"); no login, no API key,
// zero runtime dependencies. See helpers.ts for why searching means sweeping the
// listing and filtering client-side rather than submitting criteria.

import { runSearch, type SearchOpts } from "./commands/search.js"
import { runDetail, type DetailOpts } from "./commands/detail.js"
import type { Lang } from "./helpers.js"

interface Flags {
  _: string[]
  [key: string]: string | boolean | string[]
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [] }
  const alias: Record<string, string> = {
    q: "query",
    l: "location",
    o: "org",
    n: "limit",
    "max-pages": "maxPages",
    "lang-req": "langReq",
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

const HELP = `gcjobs-cli — search GC Jobs, the Government of Canada federal public service board

USAGE
  bun run src/cli.ts search [flags]
  bun run src/cli.ts detail <id|url> [--lang en|fr] [--format json|plain]

SEARCH FLAGS
  --query, -q <text>      Match job title. All terms must appear. Accent-insensitive.
  --location, -l <text>   Match location, e.g. "Ottawa", "Ontario", "Vancouver".
  --org, -o <text>        Match hiring organization, e.g. "Statistics Canada".
  --lang-req <text>       Match language requirement, e.g. "English essential",
                          "Bilingual".
  --page <n>              1-indexed page over the filtered results (20/page). Default 1.
  --limit, -n <n>         Cap results emitted (client-side).
  --max-pages <n>         Listing pages to sweep before filtering. Default 20 (all).
                          Lower it for a faster, partial search.
  --lang <en|fr>          Interface language. Default en.
  --format <fmt>          json (default) | table | plain

EXAMPLES
  bun run src/cli.ts search -q analyst -l Ottawa --format table
  bun run src/cli.ts search -q "policy" --lang-req "English essential" --format table
  bun run src/cli.ts search -o "Statistics Canada" --format table
  bun run src/cli.ts search -l "British Columbia" --limit 10 --format table
  bun run src/cli.ts detail 2445986 --format plain

NOTES
  GC Jobs has no queryable API. This CLI sweeps the full public listing (~400
  postings over 20 pages) and filters locally, so a search takes ~30 seconds.
  Use --max-pages to trade coverage for speed; meta.truncated flags a partial sweep.
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
    for (const name of ["page", "limit", "maxPages"]) {
      if (flags[name] !== undefined) {
        const value = parseIntFlag(name === "maxPages" ? "max-pages" : name, flags[name])
        if (value === null) return 1
        flags[name] = String(value)
      }
    }

    const rawFormat = typeof flags.format === "string" ? flags.format : "json"
    const opts: SearchOpts = {
      query: typeof flags.query === "string" ? flags.query : undefined,
      location: typeof flags.location === "string" ? flags.location : undefined,
      org: typeof flags.org === "string" ? flags.org : undefined,
      languageRequirement: typeof flags.langReq === "string" ? flags.langReq : undefined,
      page: flags.page ? Math.max(1, parseInt(flags.page as string, 10)) : 1,
      limit: flags.limit ? parseInt(flags.limit as string, 10) : undefined,
      maxPages: flags.maxPages ? Math.max(1, parseInt(flags.maxPages as string, 10)) : 20,
      lang,
      format: (["json", "table", "plain"].includes(rawFormat) ? rawFormat : "json") as SearchOpts["format"],
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
