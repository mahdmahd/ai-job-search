import {
  PAGE_SIZE,
  SEARCH_URL,
  SITE_ORIGIN,
  htmlFetch,
  parseJobCards,
  parseResultCount,
  writeError,
  type JobCard,
} from "../helpers.js"

export interface SearchOpts {
  query: string
  location?: string
  page: number
  limit?: number
  format: "json" | "table" | "plain"
}

export function buildUrl(opts: SearchOpts): string {
  const params = new URLSearchParams()
  params.set("keywords", opts.query)
  if (opts.location) params.set("location", opts.location)
  params.set("pageSize", String(PAGE_SIZE))
  // startIndex is a 1-based item offset: page 1 → 1, page 2 → 26, ...
  params.set("startIndex", String((opts.page - 1) * PAGE_SIZE + 1))
  return `${SEARCH_URL}?${params.toString()}`
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  const rows = cards.map((c) => {
    const ref = (c.ref || "—").slice(0, 8).padEnd(8)
    const title = (c.title || "").slice(0, 42).padEnd(42)
    const company = (c.company || "—").slice(0, 24).padEnd(24)
    const loc = (c.location || "—").slice(0, 20).padEnd(20)
    const date = (c.date || "—").slice(0, 8)
    return `${ref} ${title} ${company} ${loc} ${date}`
  })
  const header =
    "REF".padEnd(8) +
    " " +
    "TITLE".padEnd(42) +
    " " +
    "COMPANY".padEnd(24) +
    " " +
    "LOCATION".padEnd(20) +
    " PLACED"
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const url = buildUrl(opts)
    const html = await htmlFetch(url, SITE_ORIGIN + "/")
    if (html && !/j-search-result__result|job-count/.test(html)) {
      writeError(
        "search page returned no job markup — the portal may be challenging this client; back off and retry later, never try to solve challenges",
        "BLOCKED_CHALLENGE",
      )
      return 1
    }
    const cards = parseJobCards(html)
    // Total matching postings when the page embeds a count; the emitted page
    // length otherwise (see url-reference.md).
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
              `${c.title}\n  ${c.company || "—"} · ${c.location || "—"} · placed ${c.date || "—"} · closes ${c.deadline || "—"}\n  ref: ${c.ref || "—"} · id: ${c.id}\n  ${c.url}`,
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
