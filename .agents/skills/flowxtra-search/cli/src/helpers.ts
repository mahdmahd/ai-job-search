// Data source: Flowxtra's public cross-tenant jobs API (JSON). Flowxtra
// (https://flowxtra.com) is a multi-tenant ATS; the central endpoint lists live
// postings from every company hosted on the platform in one board-wide feed —
// no per-company slug, no API key, reads are unauthenticated. Search narrowing
// (title, location, company, workplace) is server-side. The base URL is
// swappable via FLOWXTRA_API_URL (mainly for tests).

export const DEFAULT_BASE_URL = "https://app.flowxtra.com/api"

/** API base URL: FLOWXTRA_API_URL (tests / self-managed mirror) or the default. */
export function baseUrl(): string {
  const raw = (process.env.FLOWXTRA_API_URL ?? "").trim()
  return (raw || DEFAULT_BASE_URL).replace(/\/+$/, "")
}

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA = "flowxtra-search-skill/1.0 (+https://flowxtra.com)"

/**
 * GET a JSON body from the Flowxtra API. Retries 429/5xx (transient server
 * states) with exponential backoff and jitter; returns `null` on a 404 (the
 * API 404s unknown job ids with a JSON envelope). A connection failure fails
 * fast with a clear message — no retry, so an outage degrades this source
 * quickly rather than hanging the caller.
 */
export async function apiGet<T>(path: string): Promise<T | null> {
  const url = `${baseUrl()}${path}`
  const maxRetries = 6
  let delay = 500

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let response: Response
    try {
      response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        redirect: "follow",
        signal: AbortSignal.timeout(15000),
      })
    } catch (e) {
      throw new Error(
        `could not reach the Flowxtra API at ${baseUrl()} (${e instanceof Error ? e.message : String(e)})`,
      )
    }

    if (response.status === 429 || response.status >= 500) {
      if (attempt === maxRetries) {
        throw new Error(`Flowxtra API request failed: ${response.status} ${response.statusText}`)
      }
      await sleep(delay + Math.floor(Math.random() * 500))
      delay = Math.min(delay * 2, 8000)
      continue
    }
    if (response.status === 404) return null

    const body = (await response.json().catch(() => null)) as (T & { message?: string }) | null
    if (!response.ok) {
      throw new Error(body?.message || `Flowxtra API request failed: ${response.status} ${response.statusText}`)
    }
    if (!body) throw new Error("Flowxtra API returned an unparseable response body")
    return body
  }
  throw new Error("Flowxtra API request failed after retries")
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** One list row — the fields this skill reads (the wire shape carries more). */
export interface FlowxtraJobSummary {
  has_id: string
  title: string
  workplace: string
  currency: string
  date_share: string | null
  min_salary: number | null
  max_salary: number | null
  salary: number | null
  rate_salary: string
  name_company: string
  city_company: string
  state_company: string
  country_company: string
  employment_types: Array<{ name: string }>
  urlJobApplay: string
}

/** The list envelope: Laravel pagination under `data`. */
export interface FlowxtraListEnvelope {
  success: boolean
  data: {
    current_page: number
    last_page: number
    total: number
    data: FlowxtraJobSummary[]
  }
}

/** The detail wire shape — the fields this skill reads. */
export interface FlowxtraJobDetail {
  has_id: string
  title: string
  workplace: string
  seniority: string | null
  description: string
  currency: string
  min_salary: number | null
  max_salary: number | null
  salary: number | null
  rate_salary: string
  urlJobApplay: string
  company: { name: string; website: string | null }
  job_type_job: Array<{ name: string }>
  company_office: {
    address: string | null
    country: { name: string } | null
    state: { name: string } | null
  } | null
}

export interface FlowxtraDetailEnvelope {
  success: boolean
  data: FlowxtraJobDetail
}

/**
 * A search result in the portal-skill contract shape. `id` is the has_id (what
 * `detail <id>` consumes); missing values are `null`, never omitted. The extra
 * `workplace` and `salary` fields are a permitted superset.
 */
export interface JobResult {
  id: string
  title: string
  company: string | null
  location: string | null
  date: string | null
  url: string
  workplace: string | null
  salary: string | null
}

/** A job detail: the contract fields plus description, seniority, and company info. */
export interface JobDetailResult extends JobResult {
  company_website: string | null
  seniority: string | null
  employment_types: string[]
  description: string | null
}

/** Join the non-empty location parts with ", ". Null when all are empty. */
export function joinLocation(...parts: Array<string | null | undefined>): string | null {
  const out = parts.filter((p): p is string => !!p && p.trim() !== "").join(", ")
  return out || null
}

/**
 * Human-readable salary line from the salary fields, e.g. "EUR 21000/year" or
 * "USD 100000–300000/year"; null when the posting lists none.
 */
export function formatSalary(
  currency: string,
  min: number | null,
  max: number | null,
  fixed: number | null,
  rate: string,
): string | null {
  let amount: string
  if (fixed != null) amount = String(fixed)
  else if (min != null && max != null) amount = `${min}–${max}`
  else if (min != null) amount = String(min)
  else if (max != null) amount = `up to ${max}`
  else return null
  const period = rate ? `/${rate}` : ""
  return `${currency} ${amount}${period}`
}

/** Reshape a list row into the contract search-result fields. */
export function toResult(j: FlowxtraJobSummary): JobResult {
  return {
    id: j.has_id,
    title: j.title || "(untitled)",
    company: j.name_company || null,
    location: joinLocation(j.city_company, j.state_company, j.country_company),
    date: j.date_share,
    url: j.urlJobApplay,
    workplace: j.workplace || null,
    salary: formatSalary(j.currency, j.min_salary, j.max_salary, j.salary, j.rate_salary),
  }
}

/**
 * Reshape a detail response into the detail result. The detail endpoint
 * serializes `date_share` as null (posted-at only comes from the list), and its
 * `urlJobApplay` is the company's own career-page URL rather than the
 * flowxtra.com/apply link the list carries.
 */
export function toDetail(d: FlowxtraJobDetail): JobDetailResult {
  const office = d.company_office
  return {
    id: d.has_id,
    title: d.title || "(untitled)",
    company: d.company.name || null,
    location: joinLocation(office?.state?.name, office?.country?.name),
    date: null,
    url: d.urlJobApplay,
    workplace: d.workplace || null,
    salary: formatSalary(d.currency, d.min_salary, d.max_salary, d.salary, d.rate_salary),
    company_website: d.company.website || null,
    seniority: d.seniority || null,
    employment_types: d.job_type_job.map((t) => t.name).filter(Boolean),
    description: cleanHtml(d.description),
  }
}

function numericEntity(cp: number): string {
  return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ""
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => numericEntity(parseInt(dec, 10)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, hex) => numericEntity(parseInt(hex, 16)))
    .replace(/&nbsp;/g, " ")
}

/**
 * Strip a description's HTML into readable prose: block/line-break tags become
 * newlines, entities are decoded, tags removed. Null for empty input.
 */
export function cleanHtml(html: string | null | undefined): string | null {
  if (!html) return null
  const withBreaks = html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|ul|ol|div|h\d)>/gi, "\n")
  const text = decodeHtmlEntities(withBreaks.replace(/<[^>]+>/g, " "))
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  return text || null
}

/**
 * Extract a Flowxtra has_id from a bare id or a job URL. Accepted URL shapes:
 * `https://flowxtra.com/apply/<id>` (with an optional locale segment, e.g.
 * `/en/apply/<id>`) and per-company career pages
 * `https://<company>.<career-domain>/job/<slug>/<id>`.
 */
export function normalizeId(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  const applyMatch = trimmed.match(/\/apply\/([A-Za-z0-9]+)(?:[/?#]|$)/)
  if (applyMatch) return applyMatch[1]
  const jobMatch = trimmed.match(/\/job\/[^/?#]+\/([A-Za-z0-9]+)(?:[/?#]|$)/)
  if (jobMatch) return jobMatch[1]
  // A bare has_id: short alphanumeric token (no path/scheme).
  if (/^[A-Za-z0-9]+$/.test(trimmed)) return trimmed
  return null
}
