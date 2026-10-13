import { JOBS_PATH, apiGet, toResult, writeError, type GeolocationApiResponse, type JobResult, type NationaleVacaturebankJob, type SearchApiResponse } from "../helpers.js"

export interface SearchOpts {
  query?: string
  city?: string
  distance: number
  jobage?: number
  page: number
  limit: number
  format: "json" | "table" | "plain"
}

type Coordinates = GeolocationApiResponse["cityCenter"]

export function buildSearchPath(opts: SearchOpts, coordinates?: Coordinates): string {
  const params = new URLSearchParams()
  params.set("page", String(opts.page))
  params.set("limit", String(opts.limit))
  params.set("sort", opts.jobage === undefined ? "relevance" : "date")

  const filters: string[] = []
  if (opts.city) {
    filters.push(`city:${opts.city}`)
    if (coordinates) {
      filters.push(`latitude:${coordinates.latitude}`)
      filters.push(`longitude:${coordinates.longitude}`)
      filters.push(`distance:${opts.distance}`)
    }
  }
  if (opts.query) filters.push(`dcoTitle:${opts.query.replace(/\s+/g, "-")}`)
  if (filters.length > 0) params.set("filters", filters.join(" "))

  return `${JOBS_PATH}?${params.toString()}`
}

/** Keep undated/unparseable jobs because their age cannot be evaluated client-side. */
function filterByJobAge(jobs: NationaleVacaturebankJob[], jobage: number | undefined): NationaleVacaturebankJob[] {
  if (jobage === undefined) return jobs
  const cutoff = Date.now() - jobage * 24 * 60 * 60 * 1000
  return jobs.filter((job) => {
    if (!job.startDate) return true
    const started = Date.parse(job.startDate)
    return Number.isNaN(started) || started >= cutoff
  })
}

function renderTable(rows: JobResult[]): string {
  if (rows.length === 0) return "No results."
  const header = "ID".padEnd(14) + " TITLE".padEnd(43) + " COMPANY".padEnd(27) + " LOCATION".padEnd(22) + " DATE"
  const body = rows.map((row) =>
    row.id.slice(0, 14).padEnd(14) +
    " " + row.title.slice(0, 41).padEnd(41) +
    " " + (row.company ?? "—").slice(0, 25).padEnd(25) +
    " " + (row.location ?? "—").slice(0, 20).padEnd(20) +
    " " + (row.date ?? "—").slice(0, 10),
  )
  return [header, "-".repeat(header.length), ...body].join("\n")
}

function renderPlain(rows: JobResult[]): string {
  if (rows.length === 0) return "No results."
  return rows
    .map((row) => [row.title, `  ${row.company ?? "—"} · ${row.location ?? "—"} · ${row.date ?? "—"}`, `  id: ${row.id}`, `  ${row.url}`].join("\n"))
    .join("\n\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const geolocation = opts.city
      ? await apiGet<GeolocationApiResponse>(`/api/v1/geolocations/nl/${encodeURIComponent(opts.city)}`)
      : null
    if (opts.city && geolocation === null) throw new Error(`city not found: ${opts.city}`)
    const response = await apiGet<SearchApiResponse>(buildSearchPath(opts, geolocation?.cityCenter))
    const jobs = filterByJobAge(response?._embedded.jobs ?? [], opts.jobage).slice(0, opts.limit)
    const results = jobs.map((job) => toResult(job))
    const page = response?.page ?? opts.page
    const total = response?.total ?? results.length

    if (opts.format === "table") {
      process.stdout.write(renderTable(results) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(renderPlain(results) + "\n")
    } else {
      process.stdout.write(JSON.stringify({ meta: { count: results.length, page, total }, results }, null, 2) + "\n")
    }
    return 0
  } catch (error) {
    writeError(error instanceof Error ? error.message : String(error), "SEARCH_FAILED")
    return 1
  }
}
