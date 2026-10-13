#!/usr/bin/env bun
// Self-contained CLI for Nationale Vacaturebank's public JSON API. It uses no
// CLI framework and no runtime packages, so Bun plus fetch is sufficient.

import { runDetail, type DetailOpts } from "./commands/detail.js"
import { runSearch, type SearchOpts } from "./commands/search.js"
import { writeError } from "./helpers.js"

interface Flags {
  _: string[]
  [key: string]: string | boolean | string[]
}

type FlagValue = string | boolean | string[] | undefined

const ALIAS: Record<string, string> = { q: "query", n: "limit" }

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [] }
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index]
    if (!argument.startsWith("-")) {
      flags._.push(argument)
      continue
    }

    const key = ALIAS[argument.replace(/^-+/, "")] ?? argument.replace(/^-+/, "")
    const next = argv[index + 1]
    if (next === undefined || next.startsWith("-")) {
      flags[key] = true
    } else {
      flags[key] = next
      index++
    }
  }
  return flags
}

const HELP = `nationalevacaturebank-cli — search Dutch vacancies on Nationale Vacaturebank

USAGE
  bun run src/cli.ts search [--query "<role>"] [--city "<city>"] [flags]
  bun run src/cli.ts detail <id|url> [--format json|plain]

SEARCH FLAGS
  --query, -q <text>      Job title / role (dcoTitle filter).
  --city <text>           Dutch city (city filter).
  --distance <km>         Distance with --city. Default: 40.
  --jobage <days>         Sort by date and filter returned startDate values.
  --page <n>              1-indexed page. Default: 1.
  --limit, -n <n>         Results per page. Default: 10.
  --format <fmt>          json (default) | table | plain.

Provide --query, --city, or both. Personal, low-volume use only: respect API rate limits.
`

function stringFlag(raw: FlagValue): string | undefined {
  return typeof raw === "string" && raw.trim() ? raw : undefined
}

function parseIntegerFlag(name: string, raw: FlagValue, minimum: number): number | null {
  if (typeof raw !== "string" || !/^\d+$/.test(raw)) {
    writeError(`--${name} must be an integer greater than or equal to ${minimum}, got "${String(raw)}"`, "BAD_ARG")
    return null
  }
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value < minimum) {
    writeError(`--${name} must be an integer greater than or equal to ${minimum}, got "${raw}"`, "BAD_ARG")
    return null
  }
  return value
}

function parseSearchFormat(raw: FlagValue): SearchOpts["format"] | null {
  if (raw === undefined) return "json"
  if (raw === "json" || raw === "table" || raw === "plain") return raw
  writeError(`--format must be json, table, or plain, got "${String(raw)}"`, "BAD_ARG")
  return null
}

async function main(): Promise<number> {
  const flags = parseFlags(process.argv.slice(2))
  const command = flags._[0]

  if (!command || flags.help || flags.h) {
    process.stdout.write(HELP)
    return command ? 0 : 1
  }

  if (command === "search") {
    const numeric = {
      distance: flags.distance === undefined ? 40 : parseIntegerFlag("distance", flags.distance, 0),
      page: flags.page === undefined ? 1 : parseIntegerFlag("page", flags.page, 1),
      limit: flags.limit === undefined ? 10 : parseIntegerFlag("limit", flags.limit, 1),
      jobage: flags.jobage === undefined ? undefined : parseIntegerFlag("jobage", flags.jobage, 0),
    }
    if (numeric.distance === null || numeric.page === null || numeric.limit === null || numeric.jobage === null) return 1

    const format = parseSearchFormat(flags.format)
    if (!format) return 1
    const query = stringFlag(flags.query)
    const city = stringFlag(flags.city)
    if (!query && !city) {
      writeError("--query/-q or --city is required", "MISSING_REQUIRED")
      return 1
    }

    const opts: SearchOpts = {
      query,
      city,
      distance: numeric.distance,
      jobage: numeric.jobage,
      page: numeric.page,
      limit: numeric.limit,
      format,
    }
    return runSearch(opts)
  }

  if (command === "detail") {
    const id = flags._[1]
    if (!id) {
      writeError("detail requires an <id|url>", "NO_ID")
      return 1
    }
    const rawFormat = flags.format
    if (rawFormat !== undefined && rawFormat !== "json" && rawFormat !== "plain") {
      writeError(`--format must be json or plain, got "${String(rawFormat)}"`, "BAD_ARG")
      return 1
    }
    const opts: DetailOpts = { id, format: rawFormat === "plain" ? "plain" : "json" }
    return runDetail(opts)
  }

  writeError(`Unknown command "${command}"`, "BAD_CMD")
  return 1
}

main().then((code) => process.exit(code))
