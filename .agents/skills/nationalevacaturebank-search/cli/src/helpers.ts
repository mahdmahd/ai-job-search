// Data source: Nationale Vacaturebank's public JSON API. The CLI deliberately
// uses no API key and no runtime dependencies beyond Bun's built-in fetch.

export const API_BASE_URL = "https://api.nationalevacaturebank.nl"
export const JOBS_PATH = "/api/jobs/v3/sites/nationalevacaturebank.nl/jobs"

const USER_AGENT = "nationalevacaturebank-search-skill/1.0"
const DUTCH_ACCEPT_LANGUAGE = "nl-NL,nl;q=0.9,en-US;q=0.8,en;q=0.7"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

export interface Company {
  name: string | null
  website: string | null
  slug: string | null
  type: string | null
}

export interface Salary {
  min: number | null
  max: number | null
}

export interface WorkingHours {
  min: number | null
  max: number | null
}

export interface WorkLocation {
  readonly city: string | null
  readonly displayName: string | null
}

/** Documented job shape returned by the vacancy search and detail endpoints. */
export interface NationaleVacaturebankJob {
  id: string | number
  title: string
  dcoTitle: string | null
  description: string | null
  company: Company | null
  salary: Salary | null
  contractType: string | null
  careerLevel: string | null
  categories: string[]
  industries: string[]
  startDate: string | null
  endDate: string | null
  status: string | null
  workingHours: WorkingHours | null
  workLocation?: WorkLocation | null
}

export interface SearchApiResponse {
  page: number
  limit: number
  pages: number
  total: number
  _links: Record<string, unknown>
  _embedded: {
    jobs: NationaleVacaturebankJob[]
  }
}

export interface GeolocationApiResponse {
  readonly cityCenter: {
    readonly latitude: string
    readonly longitude: string
  }
}

/** Shared portal-skill result fields, plus source data that is useful to callers. */
export interface JobResult {
  id: string
  title: string
  company: string | null
  companyUrl: string | null
  location: string | null
  date: string | null
  url: string
  dcoTitle: string | null
  contractType: string | null
  careerLevel: string | null
  categories: string[]
  industries: string[]
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Fetch a documented API endpoint, retrying only transient rate-limit/server
 * responses. A 404 is a normal absence and returns null for detail handling.
 */
export async function apiGet<T>(path: string): Promise<T | null> {
  const url = `${API_BASE_URL}${path}`
  const maxRetries = 6
  let delay = 500

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let response: Response
    try {
      response = await fetch(url, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "application/json",
          "Accept-Language": DUTCH_ACCEPT_LANGUAGE,
        },
        redirect: "follow",
      })
    } catch (error) {
      throw new Error(
        `could not reach Nationale Vacaturebank API (${error instanceof Error ? error.message : String(error)})`,
      )
    }

    if (response.status === 429 || response.status >= 500) {
      if (attempt === maxRetries) {
        throw new Error(`Nationale Vacaturebank API request failed: ${response.status} ${response.statusText}`)
      }
      await sleep(delay + Math.floor(Math.random() * 500))
      delay = Math.min(delay * 2, 8000)
      continue
    }
    if (response.status === 404) return null
    if (!response.ok) {
      throw new Error(`Nationale Vacaturebank API request failed: ${response.status} ${response.statusText}`)
    }

    const body: unknown = await response.json().catch(() => null)
    if (body === null) throw new Error("Nationale Vacaturebank API returned an unparseable response body")
    return body as T
  }

  throw new Error("Nationale Vacaturebank API request failed after retries")
}

/** The documented detail endpoint is also the stable URL emitted for each result. */
export function jobUrl(id: string): string {
  return `${API_BASE_URL}${JOBS_PATH}/${encodeURIComponent(id)}`
}

/** Convert an API job to the shared search-result contract. */
export function toResult(job: NationaleVacaturebankJob): JobResult {
  const id = String(job.id)
  return {
    id,
    title: job.title || job.dcoTitle || "(untitled)",
    company: job.company?.name ?? null,
    companyUrl: job.company?.website ?? null,
    location: job.workLocation?.displayName ?? job.workLocation?.city ?? null,
    date: job.startDate ?? null,
    url: jobUrl(id),
    dcoTitle: job.dcoTitle ?? null,
    contractType: job.contractType ?? null,
    careerLevel: job.careerLevel ?? null,
    categories: job.categories ?? [],
    industries: job.industries ?? [],
  }
}

/** Extract an ID from a bare ID or the documented `/jobs/{id}` API detail URL. */
export function normalizeId(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  const urlId = trimmed.match(/\/jobs\/([^/?#]+)(?:[?#].*)?$/)
  if (urlId) {
    try {
      return decodeURIComponent(urlId[1])
    } catch {
      return null
    }
  }

  return /^[^/?#\s]+$/.test(trimmed) ? trimmed : null
}
