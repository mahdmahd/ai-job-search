// Data source: Job Bank Canada / Guichet-Emplois (Government of Canada, ESDC).
// Public pages, no authentication, no API key.
//
// Three endpoints are used:
//   1. /jobsearch/jobsearch      - HTML search results (25 cards per page)
//   2. /jobsearch/jobposting/ID  - HTML detail page, annotated with schema.org microdata
//   3. /core/ta-cityprovsuggest_<lang>/select - public Solr index that maps a city
//      name to the numeric city id the search page needs for city-level filtering
//
// Parsing is regex-based on purpose: the markup is shallow and the fields we want
// carry stable class names (`noctitle`, `business`, `location`, ...) or microdata
// `property=` attributes, so a DOM parser would be a dependency for no benefit.

export type Lang = "en" | "fr"

/** Job Bank serves English and French from two different hosts. */
export function baseUrl(lang: Lang): string {
  return lang === "fr" ? "https://www.guichetemplois.gc.ca" : "https://www.jobbank.gc.ca"
}

/** The city-suggest Solr core is language-suffixed. */
export function cityCoreUrl(lang: Lang): string {
  return `${baseUrl(lang)}/core/ta-cityprovsuggest_${lang}/select`
}

export const PROVINCES = [
  "AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT",
] as const

export type Province = (typeof PROVINCES)[number]

export function isProvince(value: string): value is Province {
  return (PROVINCES as readonly string[]).includes(value.toUpperCase())
}

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

// jobbank.gc.ca/robots.txt allows all paths but sets `Crawl-delay: 5`. We honour it
// between successive requests rather than firing pages off in parallel.
export const CRAWL_DELAY_MS = 5000

let lastRequestAt = 0

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Wait out the remainder of the crawl delay since the previous request. */
async function respectCrawlDelay(): Promise<void> {
  const waitFor = lastRequestAt + CRAWL_DELAY_MS - Date.now()
  if (waitFor > 0) await sleep(waitFor)
  lastRequestAt = Date.now()
}

interface FetchOpts {
  /** Skip the crawl delay - used for the very first request of a run. */
  immediate?: boolean
  accept?: string
}

/**
 * Fetch with a browser User-Agent, the site's crawl delay, and exponential
 * backoff with jitter on 429/5xx. Returns "" on 404 rather than throwing.
 */
export async function politeFetch(url: string, opts: FetchOpts = {}): Promise<string> {
  if (!opts.immediate) await respectCrawlDelay()
  else lastRequestAt = Date.now()

  const maxRetries = 6
  let delay = 1000
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: opts.accept ?? "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-CA,en;q=0.9,fr-CA;q=0.8",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(20000),
    })
    if (response.status === 429 || response.status >= 500) {
      if (attempt === maxRetries) {
        throw new Error(`Request failed: ${response.status} ${response.statusText}`)
      }
      const jitter = Math.floor(Math.random() * 500)
      await sleep(delay + jitter)
      delay = Math.min(delay * 2, 16000)
      lastRequestAt = Date.now()
      continue
    }
    if (response.status === 404) return ""
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`)
    }
    return response.text()
  }
  throw new Error("Request failed after max retries")
}

// ---------------------------------------------------------------------------
// HTML text helpers
// ---------------------------------------------------------------------------

function numericEntity(cp: number): string {
  return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ""
}

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, dec) => numericEntity(parseInt(dec, 10)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, hex) => numericEntity(parseInt(hex, 16)))
    // &amp; last, so "&amp;#39;" does not decode twice into a quote.
    .replace(/&amp;/g, "&")
}

export function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ")
}

/** Strip tags, decode entities, collapse whitespace. */
export function clean(html: string): string {
  return decodeHtmlEntities(stripTags(html)).replace(/\s+/g, " ").trim()
}

/** Like `clean`, but turns block-level tags into newlines so prose stays readable. */
export function cleanBlock(html: string): string {
  const withBreaks = html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|ul|ol|div|h\d|tr)>/gi, "\n")
  return decodeHtmlEntities(stripTags(withBreaks))
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/**
 * Job Bank rewrites internal links with a `;jsessionid=...` path segment. It is
 * per-request noise and must not end up in stored job URLs.
 */
export function stripSessionId(url: string): string {
  return url.replace(/;jsessionid=[^?#]*/i, "")
}

// ---------------------------------------------------------------------------
// City lookup
// ---------------------------------------------------------------------------

export interface City {
  cityId: string
  name: string
  province: string
  provinceName: string
}

interface SolrDoc {
  city_id?: string
  name?: string
  province_cd?: string
  province_name?: string
}

/**
 * Resolve a free-text city name to Job Bank's numeric city id.
 *
 * The search page only filters by city when `locationparam` carries that id -
 * passing `locationstring` alone is silently ignored, which is the single
 * easiest way to think you have a city filter when you do not.
 */
export async function lookupCities(query: string, lang: Lang, rows = 10): Promise<City[]> {
  const params = new URLSearchParams({
    q: query,
    fq: "NOT postalcode_cnt:0",
    wt: "json",
    rows: String(rows),
  })
  const body = await politeFetch(`${cityCoreUrl(lang)}?${params.toString()}`, {
    accept: "application/json,text/plain;q=0.9,*/*;q=0.8",
  })
  if (!body) return []

  let parsed: { response?: { docs?: SolrDoc[] } }
  try {
    parsed = JSON.parse(body) as { response?: { docs?: SolrDoc[] } }
  } catch {
    throw new Error("City lookup returned a non-JSON response")
  }

  return (parsed.response?.docs ?? [])
    .filter((doc): doc is SolrDoc & { city_id: string; name: string } =>
      Boolean(doc.city_id && doc.name),
    )
    .map((doc) => ({
      cityId: doc.city_id,
      name: doc.name,
      province: doc.province_cd ?? "",
      provinceName: doc.province_name ?? "",
    }))
}

/**
 * Turn a "Toronto" or "Toronto, ON" style string into a city.
 * When a province is supplied it wins over Solr's own ranking.
 */
export async function resolveCity(input: string, lang: Lang): Promise<City | null> {
  const match = input.match(/^\s*(.+?)\s*,\s*([A-Za-z]{2})\s*$/)
  const name = match ? match[1] : input.trim()
  const province = match ? match[2].toUpperCase() : null

  const candidates = await lookupCities(name, lang, 25)
  if (candidates.length === 0) return null
  if (!province) return candidates[0]
  return candidates.find((c) => c.province.toUpperCase() === province) ?? candidates[0]
}

// ---------------------------------------------------------------------------
// Search-result parsing
// ---------------------------------------------------------------------------

export interface JobCard {
  id: string
  title: string
  company: string | null
  location: string | null
  date: string | null
  url: string
  salary: string | null
  /** Job Bank's own posting number, shown on the card as `#123456`. */
  jobNumber: string | null
  /** "On site", "Remote", "Hybrid" when the employer declared it. */
  workLocation: string | null
}

/** Pull the text of an `<li class="X">` out of a card, dropping screen-reader labels. */
function liText(chunk: string, className: string): string | null {
  const re = new RegExp(`<li class="${className}"[^>]*>([\\s\\S]*?)</li>`, "i")
  const match = chunk.match(re)
  if (!match) return null
  // `<span class="wb-inv">` holds the invisible label ("Location", "Salary", ...).
  const withoutLabels = match[1].replace(/<span class="wb-inv"[^>]*>[\s\S]*?<\/span>/gi, " ")
  return clean(withoutLabels) || null
}

/**
 * Parse the search-results page.
 *
 * Cards are split on the `<article id="article-...">` boundary and parsed
 * independently, so one malformed posting cannot take out the whole page.
 */
export function parseJobCards(html: string, lang: Lang): JobCard[] {
  const results: JobCard[] = []
  const chunks = html.split(/<article id="article-/).slice(1)

  for (const chunk of chunks) {
    const idMatch = chunk.match(/^(\d+)/)
    if (!idMatch) continue
    const id = idMatch[1]

    const titleMatch = chunk.match(/<span class="noctitle"[^>]*>([\s\S]*?)<\/span>/i)
    const title = titleMatch ? clean(titleMatch[1]) : ""
    if (!title) continue

    const hrefMatch = chunk.match(/href="(\/jobsearch\/jobposting\/[^"]+)"/i)
    const href = hrefMatch ? stripSessionId(decodeHtmlEntities(hrefMatch[1])).split("?")[0] : ""

    // The source line reads `<span class="wb-inv">Job number:</span> ... 3632881`.
    const sourceText = liText(chunk, "source")
    const jobNumber = sourceText ? (sourceText.match(/(\d{4,})\s*$/)?.[1] ?? null) : null

    // Work location is an unclassed <li>; the flag span on the title is more reliable.
    const teleworkMatch = chunk.match(/<span class="telework"[^>]*>([\s\S]*?)<\/span>/i)

    results.push({
      id,
      title,
      company: liText(chunk, "business"),
      location: liText(chunk, "location"),
      date: liText(chunk, "date"),
      url: href ? `${baseUrl(lang)}${href}` : `${baseUrl(lang)}/jobsearch/jobposting/${id}`,
      salary: liText(chunk, "salary")?.replace(/^Salary\s*/i, "") ?? null,
      jobNumber,
      workLocation: teleworkMatch ? clean(teleworkMatch[1]) || null : null,
    })
  }

  return results
}

/** Total number of postings the query matched, as reported by the page. */
export function parseResultCount(html: string): number | null {
  const match = html.match(/id="results-count"[^>]*>\s*([\d,\s]+)/i)
  if (!match) return null
  const digits = match[1].replace(/[^\d]/g, "")
  return digits ? parseInt(digits, 10) : null
}

// ---------------------------------------------------------------------------
// Detail-page parsing
// ---------------------------------------------------------------------------

export interface JobDetail extends JobCard {
  description: string | null
  employmentType: string | null
  /** Application deadline, ISO `YYYY-MM-DD`, from the microdata `validThrough`. */
  deadline: string | null
  salaryMin: string | null
  salaryMax: string | null
  salaryUnit: string | null
  salaryCurrency: string | null
  workHours: string | null
  vacancies: string | null
  languages: string | null
  education: string | null
  experience: string | null
  howToApply: string | null
  postalCode: string | null
}

/**
 * Read a microdata `property="name"` value, preferring an explicit `content=`.
 *
 * Job Bank's templates mix single and double quotes on these attributes
 * (`property='workHours'` next to `property="baseSalary"`), so both are accepted.
 */
function microdata(html: string, property: string): string | null {
  const prop = `property=["']${property}["']`

  const contentMatch = html.match(new RegExp(`<[^>]*${prop}[^>]*content=["']([^"']*)["'][^>]*>`, "i"))
  if (contentMatch) return decodeHtmlEntities(contentMatch[1]).trim() || null

  const textMatch = html.match(new RegExp(`<([a-z0-9]+)[^>]*${prop}[^>]*>([\\s\\S]*?)</\\1>`, "i"))
  return textMatch ? clean(textMatch[2]) || null : null
}

/** Render Job Bank's `unitText` codes (HOUR, YEAR, ...) the way the site words them. */
export function formatSalary(
  min: string | null,
  max: string | null,
  unit: string | null,
  currency: string | null,
): string | null {
  if (!min && !max) return null
  const amount = [min, max].filter(Boolean).join(" to ")
  const period: Record<string, string> = {
    HOUR: "hourly",
    DAY: "daily",
    WEEK: "weekly",
    MONTH: "monthly",
    YEAR: "annually",
  }
  const suffix = unit ? (period[unit.toUpperCase()] ?? unit.toLowerCase()) : ""
  return [currency ?? "", amount, suffix].filter(Boolean).join(" ")
}

/** Grab the block that follows an `<h4>`/`<h3>` heading in the Overview panel. */
function sectionAfterHeading(html: string, heading: string): string | null {
  const re = new RegExp(
    `<h[34][^>]*>\\s*${heading}\\s*</h[34]>([\\s\\S]*?)(?=<h[234][^>]*>|$)`,
    "i",
  )
  const match = html.match(re)
  return match ? cleanBlock(match[1]) || null : null
}

export function parseJobDetail(html: string, id: string, lang: Lang): JobDetail {
  const title =
    microdata(html, "title") ??
    (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ? clean(RegExp.$1) : null)

  const locality = microdata(html, "addressLocality")
  const region = microdata(html, "addressRegion")
  const location = locality ? (region ? `${locality} (${region})` : locality) : null

  // The description lives in the requirements panel; fall back to the whole
  // main article if Job Bank reshuffles the wrapper.
  const requirements = html.match(
    /<div[^>]*class="[^"]*job-posting-detail-requirements[^"]*"[^>]*>([\s\S]*?)(?=<section|<footer|$)/i,
  )
  const description = requirements ? cleanBlock(requirements[1]) || null : null

  const howToApplyMatch = html.match(
    /id="howtoapply"[^>]*>([\s\S]*?)(?=<section|<footer|$)/i,
  )

  const dateMatch = html.match(/<span[^>]*property="datePosted"[^>]*>([\s\S]*?)<\/span>/i)

  return {
    id,
    title: title ?? "(untitled)",
    company: microdata(html, "hiringOrganization"),
    location,
    date: dateMatch ? clean(dateMatch[1]).replace(/^Posted on\s*/i, "") || null : null,
    url: `${baseUrl(lang)}/jobsearch/jobposting/${id}`,
    salary: null,
    jobNumber: html.match(/#(\d{4,})/)?.[1] ?? null,
    workLocation: null,
    description,
    employmentType: microdata(html, "employmentType"),
    deadline: microdata(html, "validThrough"),
    salaryMin: microdata(html, "minValue"),
    salaryMax: microdata(html, "maxValue"),
    salaryUnit: microdata(html, "unitText"),
    salaryCurrency: microdata(html, "currency"),
    workHours: microdata(html, "workHours"),
    vacancies: html.match(/(\d+)\s+vacanc/i)?.[1] ?? null,
    languages: sectionAfterHeading(html, "Lang(?:uages|ues)"),
    education: sectionAfterHeading(html, "(?:Education|.tudes)"),
    experience: sectionAfterHeading(html, "(?:Experience|Exp.rience)"),
    howToApply: howToApplyMatch ? cleanBlock(howToApplyMatch[1]) || null : null,
    postalCode: microdata(html, "postalCode"),
  }
}

/** Accept a bare posting id or any Job Bank / Guichet-Emplois posting URL. */
export function normalizePostingId(input: string): string | null {
  const fromUrl = input.match(/\/jobposting\/(\d+)/)
  if (fromUrl) return fromUrl[1]
  const bare = input.trim().match(/^\d{4,}$/)
  return bare ? bare[0] : null
}
