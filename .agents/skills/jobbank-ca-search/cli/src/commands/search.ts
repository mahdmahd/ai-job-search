import {
  baseUrl,
  isProvince,
  parseJobCards,
  parseResultCount,
  politeFetch,
  resolveCity,
  writeError,
  type JobCard,
  type Lang,
} from "../helpers.js"

export interface SearchOpts {
  query?: string
  /** Free-text city, e.g. "Toronto" or "Toronto, ON". Resolved to a city id. */
  location?: string
  /** Two-letter province/territory code. Combines with `location`. */
  province?: string
  /** Posted within N days. Job Bank's `fage` is days-back. */
  jobage?: number
  page: number
  limit?: number
  sort: "relevance" | "date"
  lang: Lang
  format: "json" | "table" | "plain"
}

/** Job Bank serves a fixed 25 cards per results page. */
export const PAGE_SIZE = 25

export async function buildSearchUrl(opts: SearchOpts): Promise<{
  url: string
  resolvedCity: string | null
}> {
  const params = new URLSearchParams()
  if (opts.query) params.set("searchstring", opts.query)

  let resolvedCity: string | null = null
  if (opts.location) {
    const city = await resolveCity(opts.location, opts.lang)
    if (!city) {
      throw new Error(
        `No Job Bank city matched "${opts.location}". Try \`cities\` to see valid names.`,
      )
    }
    // Both parts are required: locationparam carries the filter, locationstring
    // only makes the page echo the city back in its heading.
    params.set("locationstring", `${city.name}, ${city.province}`)
    params.set("locationparam", city.cityId)
    resolvedCity = `${city.name}, ${city.province}`
  }

  if (opts.province) params.set("fprov", opts.province.toUpperCase())
  if (opts.jobage && opts.jobage > 0 && opts.jobage < 9999) {
    params.set("fage", String(opts.jobage))
  }
  params.set("sort", opts.sort === "date" ? "D" : "M")
  params.set("page", String(opts.page))

  return { url: `${baseUrl(opts.lang)}/jobsearch/jobsearch?${params.toString()}`, resolvedCity }
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  const header =
    "ID".padEnd(10) +
    " " +
    "TITLE".padEnd(40) +
    " " +
    "EMPLOYER".padEnd(26) +
    " " +
    "LOCATION".padEnd(22) +
    " DATE"
  const rows = cards.map((c) =>
    [
      c.id.padEnd(10),
      (c.title || "").slice(0, 40).padEnd(40),
      (c.company || "—").slice(0, 26).padEnd(26),
      (c.location || "—").slice(0, 22).padEnd(22),
      c.date || "—",
    ].join(" "),
  )
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

function renderPlain(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  return cards
    .map((c) =>
      [
        c.title,
        `  ${c.company || "—"} · ${c.location || "—"} · ${c.date || "—"}`,
        c.salary ? `  ${c.salary}` : null,
        `  id: ${c.id}`,
        `  ${c.url}`,
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  if (opts.province && !isProvince(opts.province)) {
    writeError(
      `--province must be a Canadian province/territory code (AB BC MB NB NL NS NT NU ON PE QC SK YT), got "${opts.province}"`,
      "BAD_PROVINCE",
    )
    return 1
  }

  try {
    const { url, resolvedCity } = await buildSearchUrl(opts)
    const html = await politeFetch(url, { immediate: true })
    const total = parseResultCount(html)
    let cards = parseJobCards(html, opts.lang)
    if (opts.limit !== undefined && opts.limit >= 0) cards = cards.slice(0, opts.limit)

    if (opts.format === "table") {
      process.stdout.write(renderTable(cards) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(renderPlain(cards) + "\n")
    } else {
      process.stdout.write(
        JSON.stringify(
          {
            meta: {
              count: cards.length,
              page: opts.page,
              pageSize: PAGE_SIZE,
              totalResults: total,
              location: resolvedCity,
              province: opts.province ? opts.province.toUpperCase() : null,
              lang: opts.lang,
              source: "jobbank.gc.ca",
            },
            results: cards,
          },
          null,
          2,
        ) + "\n",
      )
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "SEARCH_FAILED")
    return 1
  }
}
