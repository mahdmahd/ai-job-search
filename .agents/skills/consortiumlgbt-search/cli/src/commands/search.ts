import {
  ajaxPost,
  parseJobCards,
  writeError,
  POST_ID,
  type JobCard,
} from "../helpers.js"

export interface SearchOpts {
  query?: string
  location?: string
  page: number
  limit?: number
  format: "json" | "table" | "plain"
}

const PER_PAGE = 20

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  const rows = cards.map((c) => {
    const title = (c.title || "").slice(0, 40).padEnd(40)
    const company = (c.company || "—").slice(0, 22).padEnd(22)
    const loc = (c.location || "—").slice(0, 20).padEnd(20)
    const date = (c.date || "—").padEnd(10)
    return `${c.id.padEnd(8)} ${title} ${company} ${loc} ${date}`
  })
  const header =
    "ID".padEnd(8) +
    " " +
    "TITLE".padEnd(40) +
    " " +
    "COMPANY".padEnd(22) +
    " " +
    "LOCATION".padEnd(20) +
    " DATE"
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const body = await ajaxPost({
      search_keywords: opts.query ?? "",
      search_location: opts.location ?? "",
      per_page: String(PER_PAGE),
      page: String(opts.page),
      post_id: POST_ID,
      lang: "",
    })
    let payload: { html?: string; max_num_pages?: number }
    try {
      payload = JSON.parse(body) as { html?: string; max_num_pages?: number }
    } catch {
      throw new Error("Search endpoint returned a non-JSON response")
    }
    let cards = parseJobCards(payload.html ?? "")
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
      process.stdout.write(
        JSON.stringify(
          { meta: { count: cards.length, page: opts.page }, results: cards },
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
