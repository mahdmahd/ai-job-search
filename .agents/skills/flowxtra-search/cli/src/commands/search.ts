import {
  apiGet,
  toResult,
  writeError,
  type FlowxtraListEnvelope,
  type JobResult,
} from "../helpers.js"

export const WORKPLACES = ["On-site", "Hybrid", "Remote"] as const

export interface SearchOpts {
  query?: string
  location?: string
  workplace?: string // exact match: On-site | Hybrid | Remote
  company?: string
  jobage: number
  page: number
  limit: number
  format: "json" | "table" | "plain"
}

function buildQuery(opts: SearchOpts): URLSearchParams {
  const p = new URLSearchParams()
  if (opts.query) p.set("search-key", opts.query)
  if (opts.location) p.set("location", opts.location)
  if (opts.workplace) p.set("workplace", opts.workplace)
  if (opts.company) p.set("company_name", opts.company)
  p.set("page", String(opts.page))
  p.set("per_page", String(opts.limit))
  return p
}

/**
 * Posting-age filter. The API has no posting-age parameter, so `--jobage` is
 * applied client-side on `date_share` (always set on list rows). Undated rows
 * are kept — dropping them would hide jobs over a missing field.
 */
function withinAge(rows: JobResult[], days: number): JobResult[] {
  if (days <= 0 || days >= 9999) return rows
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
  return rows.filter((r) => {
    if (!r.date) return true
    const t = Date.parse(r.date)
    return isNaN(t) ? true : t >= cutoff
  })
}

/** The date portion (YYYY-MM-DD) of an ISO timestamp, or "—" when absent. */
function shortDate(date: string | null): string {
  return date ? date.slice(0, 10) : "—"
}

// Table columns: header, width, and the cell value. The ID column is sized to
// the longest id so it is never truncated — a cut id can't be looked up in
// `detail`; the fixed-width columns truncate for scanning.
interface Column {
  header: string
  width: number
  cell: (r: JobResult) => string
}

function renderTable(rows: JobResult[]): string {
  if (rows.length === 0) return "No results."
  const columns: Column[] = [
    { header: "ID", width: Math.max(2, ...rows.map((r) => r.id.length)), cell: (r) => r.id },
    { header: "TITLE", width: 38, cell: (r) => r.title },
    { header: "COMPANY", width: 22, cell: (r) => r.company ?? "—" },
    { header: "LOCATION", width: 24, cell: (r) => r.location ?? "—" },
    { header: "WORK", width: 7, cell: (r) => r.workplace ?? "—" },
    { header: "DATE", width: 10, cell: (r) => shortDate(r.date) },
  ]
  const row = (cells: string[]) => cells.map((c, i) => c.slice(0, columns[i].width).padEnd(columns[i].width)).join("  ")

  const header = row(columns.map((c) => c.header))
  const body = rows.map((r) => row(columns.map((c) => c.cell(r))))
  return [header, "-".repeat(header.length), ...body].join("\n")
}

function renderPlain(rows: JobResult[]): string {
  if (rows.length === 0) return "No results."
  const block = (r: JobResult) =>
    [
      r.title,
      `  ${r.company ?? "—"} · ${r.location ?? "—"} (${r.workplace ?? "—"}) · ${shortDate(r.date)}`,
      r.salary ? `  ${r.salary}` : null,
      `  id: ${r.id}`,
      `  ${r.url}`,
    ]
      .filter((l): l is string => l !== null)
      .join("\n")
  return rows.map(block).join("\n\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const env = await apiGet<FlowxtraListEnvelope>(`/central/jobs?${buildQuery(opts).toString()}`)
    const page = env?.data
    const rows = withinAge((page?.data ?? []).map(toResult), opts.jobage)

    if (opts.format === "table") {
      process.stdout.write(renderTable(rows) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(renderPlain(rows) + "\n")
    } else {
      process.stdout.write(
        JSON.stringify(
          {
            // `total`/`last_page` are the server's pre---jobage numbers; count
            // is what survived the client-side age filter on this page.
            meta: {
              count: rows.length,
              page: page?.current_page ?? opts.page,
              total: page?.total ?? rows.length,
              last_page: page?.last_page ?? 1,
            },
            results: rows,
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
