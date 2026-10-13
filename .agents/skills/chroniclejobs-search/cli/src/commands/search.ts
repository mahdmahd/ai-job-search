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

export function buildUrl(opts: SearchOpts): string {
  const params = new URLSearchParams()
  params.set("Keywords", opts.query)
  params.set("Page", String(opts.page))
  return `${SEARCH_URL}?${params.toString()}`
}

function pad(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) : s.padEnd(n)
}

// Salary replaces the DATE column used by sibling portals: search cards on
// this board never carry a date anchor (date is always null), while salary
// text is present on most cards.
function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  const rows = cards.map((c) => {
    return [
      pad(c.id, 10),
      pad(c.title, 44),
      pad(c.company ?? "—", 30),
      pad(c.location ?? "—", 26),
      c.salary ?? "—",
    ].join(" ")
  })
  const header =
    pad("ID", 10) +
    " " +
    pad("TITLE", 44) +
    " " +
    pad("COMPANY", 30) +
    " " +
    pad("LOCATION", 26) +
    " " +
    "SALARY"
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const html = await htmlFetch(buildUrl(opts))
    let cards = parseJobCards(html)
    if (opts.limit !== undefined && opts.limit >= 0) cards = cards.slice(0, opts.limit)

    if (opts.format === "table") {
      process.stdout.write(renderTable(cards) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(
        cards
          .map((c) => {
            const lines = [
              c.title,
              `${c.company ?? "—"} · ${c.location ?? "—"} · ${c.date ?? "—"}`,
            ]
            if (c.salary) lines.push(`Salary: ${c.salary}`)
            lines.push(`id: ${c.id}`, c.url)
            return lines.join("\n")
          })
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
