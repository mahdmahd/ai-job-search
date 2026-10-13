import {
  LISTINGS_URL,
  listingsFetch,
  parseListingCards,
  totalFromEnvelope,
  writeError,
  type JobCard,
} from "../helpers.js"

export interface SearchOpts {
  query: string
  jobage: number
  page: number
  limit?: number
  format: "json" | "table" | "plain"
}

function buildUrl(opts: SearchOpts): string {
  const params = new URLSearchParams()
  params.set("search_keywords", opts.query)
  params.set("page", String(opts.page))
  // 25 is the board's own page size (see url-reference.md). --limit is a
  // client-side cap applied after the fetch.
  params.set("per_page", "25")
  return `${LISTINGS_URL}?${params.toString()}`
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  const rows = cards.map((c) => {
    const id = c.id.slice(0, 9).padEnd(9)
    const title = (c.title || "").slice(0, 44).padEnd(44)
    const company = (c.company || "—").slice(0, 24).padEnd(24)
    const loc = (c.location || "—").slice(0, 18).padEnd(18)
    const date = (c.date || "—").slice(0, 10)
    return `${id} ${title} ${company} ${loc} ${date}`
  })
  const header =
    "ID".padEnd(9) +
    " " +
    "TITLE".padEnd(44) +
    " " +
    "COMPANY".padEnd(24) +
    " " +
    "LOCATION".padEnd(18) +
    " DATE"
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const envelope = await listingsFetch(buildUrl(opts))
    // listingsFetch returns null only on 404 — treat that as an empty
    // result set, never a crash (the portal-skill contract requires
    // null/empty, not an error).
    let cards = parseListingCards(envelope)
    if (opts.jobage < 9999) {
      const cutoff = Date.now() - opts.jobage * 86400000
      cards = cards.filter((c) => {
        if (!c.date) return false
        const t = Date.parse(`${c.date}T00:00:00Z`)
        return Number.isFinite(t) && t >= cutoff
      })
    }
    const total = totalFromEnvelope(envelope, cards.length)
    if (opts.limit !== undefined && opts.limit >= 0) cards = cards.slice(0, opts.limit)

    if (opts.format === "table") {
      process.stdout.write(renderTable(cards) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(
        cards
          .map(
            (c) =>
              `${c.title}\n  ${c.company || "—"} · ${c.location || "—"} · ${c.date || "—"}\n  id: ${c.id}\n  ${c.url}`,
          )
          .join("\n\n") + "\n",
      )
    } else {
      // JSON shape: every key present; missing values are null, never omitted.
      process.stdout.write(
        JSON.stringify(
          { meta: { count: total, page: opts.page }, results: cards },
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
