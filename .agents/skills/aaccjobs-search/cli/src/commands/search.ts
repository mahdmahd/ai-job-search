import {
  HOME_URL,
  RSS_URL,
  fetchText,
  matchesQuery,
  parseHomepageCards,
  parseRss,
  writeError,
  type JobCard,
} from "../helpers.js"

export interface SearchOpts {
  /** REQUIRED. Client-side keyword filter (space-separated = AND of words). */
  query: string
  page: number
  limit?: number
  format: "json" | "table" | "plain"
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  const rows = cards.map((c) => {
    const title = (c.title || "").slice(0, 44).padEnd(44)
    const company = (c.company || "—").slice(0, 26).padEnd(26)
    const loc = (c.location || "—").slice(0, 22).padEnd(22)
    const date = (c.date || "—").slice(0, 10)
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
    " DATE"
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    // Cheap, structured feed first; homepage cards fill gaps the feed lacks
    // (and vice versa). Both paths are public and unchallenged.
    const [{ body: rss }, { body: home }] = await Promise.all([
      fetchText(RSS_URL),
      fetchText(HOME_URL),
    ])

    const rssJobs = parseRss(rss)
    const homeJobs = parseHomepageCards(home)

    // Merge, preferring the richer RSS entry when both carry the same id.
    const byId = new Map<string, JobCard>()
    for (const card of homeJobs) byId.set(card.id, card)
    for (const card of rssJobs) byId.set(card.id, card)

    const fetched = byId.size
    let matched = [...byId.values()].filter((job) => matchesQuery(job, opts.query))

    // Recency first: ISO dates from RSS sort directly; homepage "Oct 12"
    // labels fall back to feed order (the homepage is already newest-first).
    matched.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))

    const total = matched.length
    const limited =
      opts.limit !== undefined && opts.limit >= 0 ? matched.slice(0, opts.limit) : matched

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
        JSON.stringify(
          {
            meta: {
              count: total,
              page: opts.page,
              fetched,
              note: "client-side filter over the latest public listings (RSS + homepage); server-side keyword search is Cloudflare-walled.",
            },
            results: limited,
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
