// Data source: AACC Jobs (https://jobs.aacc.nche.edu), the American Association
// of Community Colleges job board (jobboard.io platform). US community-college
// jobs (faculty, adjunct, administration, staff), in English. No authentication.
//
// Server-side keyword search is Cloudflare-walled (/jobs/search/* answers 403
// "Just a moment" to non-browser clients), so search reads the two public,
// unchallenged feeds — GET /jobs.rss and the homepage's ul.jobList "Latest
// Jobs" — and applies CLIENT-SIDE keyword filtering over title + company +
// location + description. Zero runtime dependencies: plain fetch + regex.

export const SITE_ORIGIN = "https://jobs.aacc.nche.edu"
export const RSS_URL = `${SITE_ORIGIN}/jobs.rss`
export const HOME_URL = `${SITE_ORIGIN}/`

// Honest tool-naming UA (the convention every shipped portal CLI follows).
// robots.txt names several disallowed AI crawlers site-wide, so no AI product
// name may ever appear in this string.
export const UA = "Mozilla/5.0 (compatible; aaccjobs-cli/1.0)"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

export interface FetchResult {
  body: string
  /** Final URL after redirects. */
  url: string
}

/**
 * Fetch text with exponential backoff on 429/5xx. Returns { body: "", url }
 * on a 404. Throws a dedicated error when Cloudflare bot protection answers
 * instead of the page, so callers can report it plainly rather than as a
 * confusing parse failure.
 */
export async function fetchText(url: string): Promise<FetchResult> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    })
    if (response.status === 429 || response.status >= 500) {
      if (attempt === maxRetries) {
        throw new Error(`Request failed: ${response.status} ${response.statusText}`)
      }
      const jitter = Math.floor(Math.random() * 500)
      await new Promise((r) => setTimeout(r, delay + jitter))
      delay = Math.min(delay * 2, 8000)
      continue
    }
    if (response.status === 404) return { body: "", url: response.url || url }
    if (!response.ok) {
      const probe = await response.clone().text().catch(() => "")
      if (response.status === 403 && isChallenge(probe)) {
        throw new Error(
          "AACC Jobs answered with Cloudflare bot protection (this path is server-search; use the RSS/homepage search instead). Keep volume low or use the WebSearch fallback.",
        )
      }
      throw new Error(`Request failed: ${response.status} ${response.statusText}`)
    }
    const body = await response.text()
    if (isChallenge(body)) {
      throw new Error(
        "AACC Jobs answered with Cloudflare bot protection instead of the page. Keep volume low or use the WebSearch fallback.",
      )
    }
    return { body, url: response.url || url }
  }
  throw new Error("Request failed after max retries")
}

function isChallenge(body: string): boolean {
  return /just a moment|cf-chl|cf_challenge|__cf_chl|cf-mitigated/i.test(body)
}

/**
 * Convert a Unicode code point to a string. Uses `fromCodePoint` (not
 * `fromCharCode`) so supplementary-plane code points decode correctly, and
 * drops out-of-range values instead of throwing.
 */
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
    .replace(/&#(\d+);/g, (_, dec) => numericEntity(parseInt(dec, 10)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, hex) => numericEntity(parseInt(hex, 16)))
    .replace(/&nbsp;/g, " ")
    // &amp; last so "&amp;#39;" does not decode twice.
    .replace(/&amp;/g, "&")
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

export function clean(html: string): string {
  return decodeHtmlEntities(stripTags(html))
}

/** HTML description -> readable text with paragraph breaks preserved. */
export function descriptionToText(html: string): string | null {
  const withBreaks = html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|ul|ol|div|h\d|tr|figure)>/gi, "\n")
  const text = decodeHtmlEntities(
    withBreaks.replace(/<[^>]+>/g, "").replace(/[ \t]+/g, " "),
  )
  const normalized = text
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  return normalized || null
}

export interface JobCard {
  id: string
  title: string
  company: string | null
  location: string | null
  /** ISO date (YYYY-MM-DD) from RSS pubDate, else the homepage "Oct 12" label, else null. */
  date: string | null
  /** RSS description excerpt; null for homepage-only cards. */
  snippet: string | null
  /** Full plain-text description; set on RSS cards, null on homepage cards. */
  description: string | null
  url: string
}

export interface JobDetail {
  id: string
  title: string
  company: string | null
  location: string | null
  /** datePosted from JSON-LD (ISO), or null. */
  date: string | null
  /** validThrough from JSON-LD (ISO deadline), or null. */
  deadline: string | null
  employmentType: string | null
  url: string
  applyUrl: string | null
  description: string | null
}

/** Pull the numeric job id out of a /jobs/{id}[-{slug}] URL. */
export function idFromJobUrl(url: string): string | null {
  const m = url.match(/\/jobs\/(\d+)/)
  return m ? m[1] : null
}

// ---------------------------------------------------------------------------
// RSS parsing (GET /jobs.rss — plain regex/XML-lite, no XML library)
// ---------------------------------------------------------------------------

function tagText(itemXml: string, tag: string): string {
  const cdata = itemXml.match(new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`))
  if (cdata) return cdata[1].trim()
  const plain = itemXml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))
  return plain ? plain[1].trim() : ""
}

export interface ParsedRssTitle {
  role: string
  company: string | null
  location: string | null
}

/**
 * RSS titles look like "Superintendent/President at Imperial Valley College
 * (Imperial, CA, USA)". Split off the trailing "(City, ST, USA)" location,
 * then split the rest on the LAST " at " so roles containing " at " survive.
 */
export function parseRssTitle(raw: string): ParsedRssTitle {
  const title = decodeHtmlEntities(raw).replace(/\s+/g, " ").trim()
  let location: string | null = null
  let rest = title
  const locMatch = rest.match(/\(([^()]*)\)\s*$/)
  if (locMatch) {
    location = locMatch[1].trim() || null
    rest = rest.slice(0, locMatch.index).trim()
  }
  const atIdx = rest.lastIndexOf(" at ")
  if (atIdx === -1) return { role: rest, company: null, location }
  const role = rest.slice(0, atIdx).trim()
  const company = rest.slice(atIdx + 4).trim()
  return { role: role || rest, company: company || null, location }
}

/** ISO date (YYYY-MM-DD) from an RSS pubDate, or null when unparseable. */
export function pubDateToISO(pubDate: string): string | null {
  if (!pubDate) return null
  const d = new Date(pubDate)
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

/** Parse the RSS feed into per-item jobs. Malformed items skip cleanly. */
export function parseRss(xml: string): JobCard[] {
  const results: JobCard[] = []
  const items = xml.matchAll(/<item>([\s\S]*?)<\/item>/g)
  for (const match of items) {
    const itemXml = match[1]
    const link = tagText(itemXml, "link") || tagText(itemXml, "guid")
    const id = idFromJobUrl(link)
    if (!id) continue
    const rawTitle = tagText(itemXml, "title")
    if (!rawTitle) continue
    const { role, company, location } = parseRssTitle(rawTitle)
    const description = tagText(itemXml, "description") || null
    results.push({
      id,
      title: role,
      company,
      location,
      date: pubDateToISO(tagText(itemXml, "pubDate")),
      snippet: description
        ? decodeHtmlEntities(description).replace(/\s+/g, " ").trim().slice(0, 280) || null
        : null,
      description: description
        ? decodeHtmlEntities(description).replace(/\s+/g, " ").trim() || null
        : null,
      url: link,
    })
  }
  return results
}

// ---------------------------------------------------------------------------
// Homepage parsing (ul.jobList "Latest Jobs" — ~30 cards, single page)
// ---------------------------------------------------------------------------

/**
 * Parse homepage job cards: one <li class="job-listing ..."> per posting.
 * Chunks are parsed independently so one malformed card cannot break the rest.
 * Anchors: a.jobList-title (href /jobs/{id}-{slug}, <strong> title),
 * ul.jobList-introMeta li (company, then location), div.jobList-date.
 */
export function parseHomepageCards(html: string): JobCard[] {
  const results: JobCard[] = []
  const chunks = html.split(/<li class="job-listing/).slice(1)

  for (const chunk of chunks) {
    const linkMatch = chunk.match(/class="jobList-title"[^>]*href="([^"]+)"/i)
    if (!linkMatch) continue
    const href = linkMatch[1]
    const id = idFromJobUrl(href)
    if (!id) continue

    const titleMatch = chunk.match(
      /class="jobList-title"[^>]*>([\s\S]*?)<\/a>/i,
    )
    const title = titleMatch ? clean(titleMatch[1]) : ""
    if (!title) continue

    let company: string | null = null
    let location: string | null = null
    const metaBlock = chunk.match(/class="jobList-introMeta"[^>]*>([\s\S]*?)<\/ul>/i)
    if (metaBlock) {
      const items: string[] = []
      for (const li of metaBlock[1].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)) {
        const text = clean(li[1])
        if (text) items.push(text)
      }
      company = items[0] ?? null
      location = items[1] ?? null
    }

    const dateMatch = chunk.match(/class="jobList-date[^"]*"[^>]*>([^<]*)</i)
    const date = dateMatch ? clean(dateMatch[1]) || null : null

    results.push({
      id,
      title,
      company,
      location,
      date,
      snippet: null,
      description: null,
      url: href.startsWith("http") ? href : `${SITE_ORIGIN}${href}`,
    })
  }

  return results
}

// ---------------------------------------------------------------------------
// Client-side keyword filtering (server search is Cloudflare-walled)
// ---------------------------------------------------------------------------

/**
 * AND-of-words match over title + company + location + description
 * (case-insensitive). Single words behave like substring search; multi-word
 * queries match when every word appears somewhere in the posting.
 */
export function matchesQuery(
  job: Pick<JobCard, "title" | "company" | "location" | "description">,
  query: string,
): boolean {
  const haystack = [job.title, job.company, job.location, job.description]
    .filter((v): v is string => typeof v === "string" && v.length > 0)
    .join("\n")
    .toLowerCase()
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  return words.every((w) => haystack.includes(w))
}

// ---------------------------------------------------------------------------
// Detail parsing (JSON-LD schema.org/JobPosting preferred)
// ---------------------------------------------------------------------------

/**
 * Extract the JobPosting node from the page's JSON-LD. Pages may carry several
 * ld+json scripts; pick the JobPosting one, tolerating an array wrapper or an
 * @graph container, and skipping scripts that do not parse.
 */
export function extractJobPosting(html: string): Record<string, unknown> | null {
  const scripts = html.match(
    /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi,
  )
  if (!scripts) return null
  for (const tag of scripts) {
    const body = tag.replace(/^<script[^>]*>/i, "").replace(/<\/script>$/i, "")
    let data: unknown
    try {
      data = JSON.parse(body)
    } catch {
      continue
    }
    const candidates: unknown[] = Array.isArray(data) ? data : [data]
    for (const node of candidates) {
      if (node && typeof node === "object" && !Array.isArray(node)) {
        const rec = node as Record<string, unknown>
        if (rec["@type"] === "JobPosting") return rec
        const graph = rec["@graph"]
        if (Array.isArray(graph)) {
          const hit = graph.find(
            (g) =>
              g &&
              typeof g === "object" &&
              (g as Record<string, unknown>)["@type"] === "JobPosting",
          )
          if (hit) return hit as Record<string, unknown>
        }
      }
    }
  }
  return null
}

/** jobLocation may be a single Place or an array of Places (schema.org allows both). */
function locationFromJobLocation(value: unknown): string | null {
  const places = Array.isArray(value) ? value : [value]
  const parts: string[] = []
  for (const place of places) {
    if (!place || typeof place !== "object") continue
    const addr = (place as Record<string, unknown>).address
    if (!addr || typeof addr !== "object") continue
    const a = addr as Record<string, unknown>
    for (const key of ["addressLocality", "addressRegion", "addressCountry"] as const) {
      const v = a[key]
      if (typeof v === "string" && v && !parts.includes(v)) parts.push(v)
    }
  }
  return parts.length ? parts.join(", ") : null
}

/**
 * employmentType arrives inconsistently across jobboard.io postings: usually a
 * plain string ("Full Time"), sometimes an array or a JSON-encoded array
 * string. Normalize all shapes to a plain value.
 */
export function normalizeEmploymentType(value: unknown): string | null {
  if (value == null) return null
  if (Array.isArray(value)) {
    const items = value.filter((v): v is string => typeof v === "string")
    return items.length ? items.join(", ") : null
  }
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) {
        const items = parsed.filter((v): v is string => typeof v === "string")
        return items.length ? items.join(", ") : null
      }
    } catch {
      /* fall through to raw string */
    }
  }
  return trimmed || null
}

/** Parse a single job detail page (JSON-LD first, HTML fallbacks after). */
export function parseJobDetail(html: string, id: string, url: string): JobDetail {
  const posting = extractJobPosting(html)

  const title =
    (posting && typeof posting.title === "string" ? posting.title.trim() : null) ??
    (() => {
      const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
      return h1 ? clean(h1[1]) || null : null
    })()

  let company: string | null = null
  if (posting && posting.hiringOrganization && typeof posting.hiringOrganization === "object") {
    const org = posting.hiringOrganization as Record<string, unknown>
    if (typeof org.name === "string" && org.name.trim()) company = org.name.trim()
  }
  if (!company) {
    const headerOrg = html.match(
      /class="jobDetail-header[^"]*"[\s\S]{0,2000}?fa-building[^<]*<\/i>\s*([^<]+)</i,
    )
    if (headerOrg) company = clean(headerOrg[1]) || null
  }

  const location = locationFromJobLocation(posting?.jobLocation)

  const date =
    posting && typeof posting.datePosted === "string" && posting.datePosted
      ? posting.datePosted
      : null
  const deadline =
    posting && typeof posting.validThrough === "string" && posting.validThrough
      ? posting.validThrough
      : null
  const employmentType = posting ? normalizeEmploymentType(posting.employmentType) : null

  const description =
    posting && typeof posting.description === "string" && posting.description
      ? descriptionToText(posting.description)
      : null

  const applyMatch = html.match(
    /<a[^>]*class="[^"]*apply-button[^"]*"[^>]*href="([^"]+)"/i,
  )
  const applyUrl = applyMatch ? applyMatch[1] : null

  return {
    id,
    title: title || "(untitled)",
    company,
    location,
    date,
    deadline,
    employmentType,
    url,
    applyUrl,
    description,
  }
}
