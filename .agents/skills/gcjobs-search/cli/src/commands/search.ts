import {
  PAGE_SIZE,
  Session,
  fetchListingPage,
  matchesFilters,
  parseJobCards,
  parsePageCount,
  parseResultCount,
  primeSession,
  writeError,
  type Filters,
  type JobCard,
  type Lang,
} from "../helpers.js"

export interface SearchOpts extends Filters {
  page: number
  limit?: number
  /** How many listing pages to sweep before filtering. */
  maxPages: number
  lang: Lang
  format: "json" | "table" | "plain"
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  const header =
    "ID".padEnd(9) +
    " " +
    "TITLE".padEnd(44) +
    " " +
    "ORGANIZATION".padEnd(30) +
    " " +
    "LOCATION".padEnd(22) +
    " CLOSES"
  const rows = cards.map((c) =>
    [
      c.id.padEnd(9),
      (c.title || "").slice(0, 44).padEnd(44),
      (c.company || "—").slice(0, 30).padEnd(30),
      (c.location || "—").slice(0, 22).padEnd(22),
      c.closingDate || "—",
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
        `  ${c.company || "—"} · ${c.location || "—"}`,
        c.salary ? `  ${c.salary}` : null,
        c.languageRequirement ? `  ${c.languageRequirement}` : null,
        c.closingDate ? `  closes: ${c.closingDate}` : null,
        `  id: ${c.id}`,
        `  ${c.url}`,
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n")
}

/**
 * GC Jobs cannot be queried by criteria over plain HTTP (the server 500s on a
 * replayed criteria search), so we sweep the public listing and filter locally.
 * The whole corpus is ~400 postings, so this stays cheap.
 */
export async function runSearch(opts: SearchOpts): Promise<number> {
  const session = new Session()
  try {
    const firstPage = await primeSession(session, opts.lang)
    const totalOpen = parseResultCount(firstPage)
    const pageCount = parsePageCount(firstPage) ?? 1
    const pagesToFetch = Math.min(pageCount, Math.max(1, opts.maxPages))

    const all: JobCard[] = parseJobCards(firstPage, opts.lang)
    for (let page = 2; page <= pagesToFetch; page++) {
      const html = await fetchListingPage(session, opts.lang, page)
      all.push(...parseJobCards(html, opts.lang))
    }

    // Deduplicate: the live index shifts under us during a sweep, so the same
    // posting can appear on two consecutive pages.
    const seen = new Set<string>()
    const unique = all.filter((job) => (seen.has(job.id) ? false : (seen.add(job.id), true)))

    const filters: Filters = {
      query: opts.query,
      location: opts.location,
      org: opts.org,
      languageRequirement: opts.languageRequirement,
    }
    const matched = unique.filter((job) => matchesFilters(job, filters))

    // Paginate the *filtered* set so --page behaves like the other portal skills.
    const start = (opts.page - 1) * PAGE_SIZE
    let results = matched.slice(start, start + PAGE_SIZE)
    if (opts.limit !== undefined && opts.limit >= 0) results = results.slice(0, opts.limit)

    if (opts.format === "table") {
      process.stdout.write(renderTable(results) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(renderPlain(results) + "\n")
    } else {
      process.stdout.write(
        JSON.stringify(
          {
            meta: {
              count: results.length,
              page: opts.page,
              pageSize: PAGE_SIZE,
              totalResults: matched.length,
              totalOpenPostings: totalOpen,
              listingPagesSwept: pagesToFetch,
              listingPagesAvailable: pageCount,
              /** True when the sweep stopped early, so filtering saw a partial corpus. */
              truncated: pagesToFetch < pageCount,
              lang: opts.lang,
              source: "emploisfp-psjobs.cfp-psc.gc.ca",
            },
            results,
          },
          null,
          2,
        ) + "\n",
      )
    }

    if (pagesToFetch < pageCount && opts.format !== "json") {
      process.stderr.write(
        `note: swept ${pagesToFetch} of ${pageCount} listing pages (--max-pages); ` +
          `results are filtered from a partial listing\n`,
      )
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "SEARCH_FAILED")
    return 1
  }
}
