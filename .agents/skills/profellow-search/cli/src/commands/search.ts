import {
  ARCHIVE_BASE,
  htmlFetch,
  filterCards,
  parseOpenCallCards,
  writeError,
  type OpenCall,
} from "../helpers.js"

export interface SearchOpts {
  query: string
  page: number
  limit?: number
  format: "json" | "table" | "plain"
}

function buildUrl(page: number): string {
  // The archive is paginated /open-calls/page/N/ (page 1 is the bare path).
  // Keyword filtering is client-side over the fetched page (the WP ?s=
  // endpoint is CleanTalk-blocked), so --jobage has no server-side meaning
  // and is deliberately not offered.
  return page <= 1 ? `${ARCHIVE_BASE}/` : `${ARCHIVE_BASE}/page/${page}/`
}

function renderTable(cards: OpenCall[]): string {
  if (cards.length === 0) return "No results."
  const rows = cards.map((c) => {
    const id = c.id.slice(0, 30).padEnd(30)
    const title = (c.title || "").slice(0, 46).padEnd(46)
    const host = (c.company || "—").slice(0, 24).padEnd(24)
    const date = (c.date || "—").slice(0, 16)
    return `${id} ${title} ${host} ${date}`
  })
  const header =
    "ID (slug)".padEnd(30) +
    " " +
    "TITLE".padEnd(46) +
    " " +
    "HOST".padEnd(24) +
    " DEADLINE"
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const html = await htmlFetch(buildUrl(opts.page))
    if (!html) {
      writeError(`Archive page ${opts.page} not found`, "NOT_FOUND")
      return 1
    }
    let cards = filterCards(html, opts.query, parseOpenCallCards(html))
    const matched = cards.length
    if (opts.limit !== undefined && opts.limit >= 0) cards = cards.slice(0, opts.limit)

    if (opts.format === "table") {
      process.stdout.write(renderTable(cards) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(
        cards
          .map(
            (c) =>
              `${c.title}\n  ${c.company || "—"} · ${c.date || "no deadline listed"}\n  id: ${c.id}\n  ${c.url}`,
          )
          .join("\n\n") + "\n",
      )
    } else {
      // JSON shape: every key present; missing values are null, never omitted.
      process.stdout.write(
        JSON.stringify(
          { meta: { count: matched, page: opts.page }, results: cards },
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
