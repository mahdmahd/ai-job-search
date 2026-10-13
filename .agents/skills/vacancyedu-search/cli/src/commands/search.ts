import {
  API_BASE,
  apiFetch,
  parsePosts,
  jobageToAfter,
  writeError,
  type JobResult,
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
  params.set("search", opts.query)
  params.set("page", String(opts.page))
  // WP REST caps per_page at 100; --limit is a client-side cap after this fetch.
  params.set("per_page", "100")
  params.set("_fields", "id,date,link,title")
  const after = jobageToAfter(opts.jobage)
  if (after) params.set("after", after)
  return `${API_BASE}?${params.toString()}`
}

function renderTable(cards: JobResult[]): string {
  if (cards.length === 0) return "No results."
  const rows = cards.map((c) => {
    const id = String(c.id).padEnd(7)
    const title = (c.title || "").slice(0, 48).padEnd(48)
    const company = (c.company || "—").slice(0, 26).padEnd(26)
    const loc = (c.location || "—").slice(0, 22).padEnd(22)
    const date = (c.date || "—").slice(0, 10)
    return `${id} ${title} ${company} ${loc} ${date}`
  })
  const header =
    "ID".padEnd(7) +
    " " +
    "TITLE".padEnd(48) +
    " " +
    "COMPANY".padEnd(26) +
    " " +
    "LOCATION".padEnd(22) +
    " DATE"
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const result = await apiFetch<unknown>(buildUrl(opts))
    // apiFetch returns null only on 404 — treat that as an empty result set,
    // never a crash (the /scrape contract requires null/empty, not an error).
    let cards = parsePosts(result?.data)
    const total = result?.total ?? cards.length
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
