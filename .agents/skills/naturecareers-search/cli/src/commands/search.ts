import {
  SEARCH_URL,
  htmlFetch,
  parseJobCards,
  parseResultCount,
  writeError,
  type JobCard,
} from "../helpers.js"

export interface SearchOpts {
  query: string
  page: number
  limit?: number
  /** Portal sort order; default relevance. */
  sort: "relevance" | "date"
  format: "json" | "table" | "plain"
}

function buildUrl(opts: SearchOpts): string {
  const params = new URLSearchParams()
  params.set("Keywords", opts.query)
  params.set("Page", String(opts.page))
  // Default sort is Relevance — only send the param when the user asks for date.
  // Never send countrycode: the server may inject it from geo, but sending it
  // would pin results to one country.
  if (opts.sort === "date") params.set("sort", "Date")
  return `${SEARCH_URL}?${params.toString()}`
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  const rows = cards.map((c) => {
    const title = (c.title || "").slice(0, 44).padEnd(44)
    const company = (c.company || "—").slice(0, 26).padEnd(26)
    const loc = (c.location || "—").slice(0, 22).padEnd(22)
    const date = c.date || "—"
    return `${c.id.padEnd(10)} ${title} ${company} ${loc} ${date}`
  })
  const header =
    "ID".padEnd(10) +
    " " +
    "TITLE".padEnd(44) +
    " " +
    "COMPANY".padEnd(26) +
    " " +
    "LOCATION".padEnd(22) +
    " AGE"
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const html = await htmlFetch(buildUrl(opts))
    const cards = parseJobCards(html)
    // Total matching postings across all pages when the page embeds a count
    // signal; otherwise the length of this page (see url-reference.md).
    const count = parseResultCount(html) ?? cards.length
    const limited =
      opts.limit !== undefined && opts.limit >= 0 ? cards.slice(0, opts.limit) : cards

    if (opts.format === "table") {
      process.stdout.write(renderTable(limited) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(
        limited
          .map(
            (c) =>
              `${c.title}\n  ${c.company || "—"} · ${c.location || "—"} · ${c.date || "—"}\n  id: ${c.id}\n  ${c.url}`,
          )
          .join("\n\n") + "\n",
      )
    } else {
      process.stdout.write(
        JSON.stringify({ meta: { count, page: opts.page }, results: limited }, null, 2) + "\n",
      )
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "SEARCH_FAILED")
    return 1
  }
}
