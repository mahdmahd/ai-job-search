import { lookupCities, writeError, type Lang } from "../helpers.js"

export interface CitiesOpts {
  query: string
  lang: Lang
  limit: number
  format: "json" | "table" | "plain"
}

/**
 * Look up Job Bank city ids.
 *
 * Exposed as a command because city filtering is the one part of the search that
 * cannot be guessed: `--location` only works once a name resolves to a numeric id,
 * and several Canadian city names repeat across provinces (there is a London in ON
 * and a Windsor in three provinces).
 */
export async function runCities(opts: CitiesOpts): Promise<number> {
  try {
    const cities = await lookupCities(opts.query, opts.lang, opts.limit)

    if (opts.format === "table") {
      if (cities.length === 0) {
        process.stdout.write("No matching cities.\n")
        return 0
      }
      const header = "CITY ID".padEnd(10) + " " + "NAME".padEnd(30) + " PROVINCE"
      const rows = cities.map(
        (c) =>
          c.cityId.padEnd(10) + " " + c.name.slice(0, 30).padEnd(30) + " " + `${c.provinceName} (${c.province})`,
      )
      process.stdout.write([header, "-".repeat(header.length), ...rows].join("\n") + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(
        (cities.length === 0
          ? "No matching cities."
          : cities.map((c) => `${c.name}, ${c.province} (id ${c.cityId})`).join("\n")) + "\n",
      )
    } else {
      process.stdout.write(
        JSON.stringify({ meta: { count: cities.length }, results: cities }, null, 2) + "\n",
      )
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "CITIES_FAILED")
    return 1
  }
}
