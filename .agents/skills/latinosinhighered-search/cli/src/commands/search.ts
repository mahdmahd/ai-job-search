import {
  SEARCH_URL,
  htmlFetch,
  parseJobCards,
  writeError,
  type JobCard,
} from "../helpers.js"

export interface SearchOpts {
  query: string
  page: number
  limit?: number
  format: "json" | "table" | "plain"
}

function buildUrl(query: string): string {
  const params = new URLSearchParams()
  params.set("keywords", query)
  return `${SEARCH_URL}?${params.toString()}`
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  const rows = cards.map((c) => {
    const id = c.id.padEnd(9)
    const title = (c.title || "").slice(0, 44).padEnd(44)
    const company = (c.company || "—").slice(0, 30).padEnd(30)
    const loc = (c.location || "—").slice(0, 26).padEnd(26)
    const date = c.date || "—"
    return `${id} ${title} ${company} ${loc} ${date}`
  })
  const header =
    "ID".padEnd(9) +
    " " +
    "TITLE".padEnd(44) +
    " " +
    "ORG".padEnd(30) +
    " " +
    "LOCATION".padEnd(26) +
    " DATE"
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    // The portal exposes no pagination parameter on the GET search endpoint
    // (verified 2026-10-13: ?page=2 returns an identical single page). Any
    // page > 1 is answered client-side with zero results — no wasted request.
    let cards: JobCard[] = []
    if (opts.page === 1) {
      const html = await htmlFetch(buildUrl(opts.query))
      cards = parseJobCards(html)
    }
    if (opts.limit !== undefined && opts.limit >= 0) cards = cards.slice(0, opts.limit)

    if (opts.format === "table") {
      process.stdout.write(renderTable(cards) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(
        cards
          .map(
            (c) =>
              `${c.title}\n  ${c.company || "—"} · ${c.location || "—"}\n  id: ${c.id}\n  ${c.url}`,
          )
          .join("\n\n") + "\n",
      )
    } else {
      process.stdout.write(
        JSON.stringify({ meta: { count: cards.length, page: opts.page }, results: cards }, null, 2) + "\n",
      )
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "SEARCH_FAILED")
    return 1
  }
}
