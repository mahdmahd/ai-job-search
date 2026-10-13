import {
  SEARCH_URL,
  htmlFetch,
  parseJobCards,
  parseTotalCount,
  writeError,
  type JobCard,
} from "../helpers.js"

export interface SearchOpts {
  query: string
  page: number
  limit?: number
  format: "json" | "table" | "plain"
}

/**
 * Build the keyword-facet search URL: /jobs/search?f[0]=keywords:<query>&page=<n>.
 * This is the GET facet URL EURAXESS's own filter UI produces. The POST form
 * search also exists but is not used here (see url-reference.md).
 */
export function buildSearchUrl(opts: SearchOpts): string {
  const encoded = encodeURIComponent(opts.query)
  return `${SEARCH_URL}?f%5B0%5D=keywords%3A${encoded}&page=${opts.page}`
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  const rows = cards.map((c) => {
    const title = (c.title || "").slice(0, 38).padEnd(38)
    const company = (c.company || "—").slice(0, 24).padEnd(24)
    const loc = (c.location || "—").slice(0, 14).padEnd(14)
    const deadline = (c.deadline || "—").slice(0, 25)
    return `${c.id.padEnd(8)} ${title} ${company} ${loc} ${deadline}`
  })
  const header =
    "ID".padEnd(8) +
    " " +
    "TITLE".padEnd(38) +
    " " +
    "ORGANISATION".padEnd(24) +
    " " +
    "LOCATION".padEnd(14) +
    " DEADLINE (ISO)"
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const html = await htmlFetch(buildSearchUrl(opts))
    if (!html) {
      writeError("Search page not found (404)", "NOT_FOUND")
      return 1
    }
    const cards = parseJobCards(html)
    // Total from the pagination footer (≈ lastPage * 10); falls back to the
    // page length when the pager is absent. Computed before --limit so the
    // reported count does not depend on the client-side cap.
    const count = parseTotalCount(html) ?? cards.length
    const visible = opts.limit !== undefined ? cards.slice(0, opts.limit) : cards

    if (opts.format === "table") {
      process.stdout.write(renderTable(visible) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(
        visible
          .map(
            (c) =>
              `${c.title}\n  ${c.company || "—"} · ${c.location || "—"} · posted: ${c.date || "—"} · deadline: ${c.deadline || "—"}\n  id: ${c.id}\n  ${c.url}`,
          )
          .join("\n\n") + "\n",
      )
    } else {
      process.stdout.write(
        JSON.stringify(
          { meta: { count, page: opts.page }, results: visible },
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
