// Data source: Chronicle of Higher Education Jobs (jobs.chronicle.com) — a Madgex
// job board (the same platform as nature.com/naturecareers and
// careers.insidehighered.com). No authentication and no paywall on job pages: the
// Chronicle's news-article paywall does not apply to the jobs subdomain.
// Search returns an HTML result list; detail returns a page with a JSON-LD
// JobPosting block. Both are parsed with regex (chunked, zero runtime deps).

export const BASE = "https://jobs.chronicle.com"
export const SEARCH_URL = `${BASE}/searchjobs/`

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA = "Mozilla/5.0 (compatible; chroniclejobs-cli/1.0)"

/** Fetch HTML with exponential backoff on 429/5xx. Returns "" on a 404. */
export async function htmlFetch(url: string): Promise<string> {
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
    if (response.status === 404) return ""
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`)
    }
    return response.text()
  }
  throw new Error("Request failed after max retries")
}

export interface JobCard {
  id: string
  title: string
  company: string | null
  location: string | null
  date: string | null
  url: string
  salary: string | null
  snippet: string | null
}

export interface JobDetail {
  id: string
  title: string | null
  company: string | null
  location: string | null
  date: string | null
  url: string
  salary: string | null
  description: string | null
  validThrough: string | null
  employmentType: string | null
  applyUrl: string | null
}

/**
 * Extract the inner HTML of a <div> identified by a CSS class name, correctly
 * handling nested <div> elements by tracking tag depth.
 */
export function extractDivContent(html: string, className: string): string | null {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const openRe = new RegExp(`<div[^>]*class="[^"]*${escaped}[^"]*"[^>]*>`, "i")
  const open = openRe.exec(html)
  if (!open) return null

  let i = open.index + open[0].length
  let depth = 1

  while (depth > 0 && i < html.length) {
    const nextOpen = html.indexOf("<div", i)
    const nextClose = html.indexOf("</div>", i)

    if (nextClose === -1) return null

    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++
      i = nextOpen + 4
    } else {
      depth--
      i = nextClose + 6
    }
  }

  return html.slice(open.index + open[0].length, i - 6)
}

/**
 * Convert a Unicode code point to a string. Uses `fromCodePoint` (not
 * `fromCharCode`) so supplementary-plane code points (e.g. emoji, U+1F600)
 * decode correctly, and drops out-of-range values instead of throwing.
 */
function numericEntity(cp: number): string {
  return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ""
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    // Numeric character references: decimal (&#233;) and hexadecimal (&#xE9;).
    .replace(/&#(\d+);/g, (_, dec) => numericEntity(parseInt(dec, 10)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, hex) => numericEntity(parseInt(hex, 16)))
    .replace(/&nbsp;/g, " ")
    // &amp; last, so a double-escaped entity is not double-decoded.
    .replace(/&amp;/g, "&")
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

/** Collapse to a single line — for title/company/location-style fields. */
function clean(html: string): string {
  return decodeHtmlEntities(stripTags(html))
}

/**
 * Convert an HTML fragment to readable text, keeping paragraph/list breaks as
 * newlines (used for the JSON-LD job description on detail pages).
 */
function htmlToText(html: string): string {
  const withBreaks = html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|ul|ol|div|h[1-6]|tr|section|article|blockquote)>/gi, "\n")
  return decodeHtmlEntities(withBreaks.replace(/<[^>]+>/g, " "))
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/**
 * Absolutize and clean a Madgex href. Chronicle list markup puts stray
 * whitespace and newlines INSIDE the quoted href value
 * (`href=" \n\t/job/123/slug/?LinkSource=... \n"`), so trim before anything
 * else, then drop the tracking query string.
 */
export function cleanHref(raw: string, fallback: string): string {
  const path = raw.trim().split("?")[0].trim()
  if (!path) return fallback
  if (/^https?:\/\//i.test(path)) return path
  return path.startsWith("/") ? BASE + path : `${BASE}/${path}`
}

/**
 * Parse a single "LocationDescription" / "SalaryDescription" style JSON string
 * captured out of the detail page's tracking blob (fallback fields when the
 * JSON-LD block lacks them). Returns null on anything unparseable.
 */
function jsonStringValue(inner: string): string | null {
  try {
    const v = JSON.parse(`"${inner}"`)
    return typeof v === "string" && v.trim() ? v.trim() : null
  } catch {
    return inner.trim() || null
  }
}

/**
 * Parse the search response: a flat list of <li id="item-{id}"> job cards.
 * We split on the id anchor and parse each chunk independently so one
 * malformed card cannot break the rest.
 *
 * The trailing part of the LAST chunk runs to the end of the document (ads,
 * paginator, footer follow the last card), and similar-jobs mini-listers reuse
 * some lister classes, so each chunk is bounded at the card's own
 * `lister__footer` (all real fields precede it) with the known noise markers
 * as fallbacks — a missing field can then never leak in from whatever follows.
 */
export function parseJobCards(html: string): JobCard[] {
  const results: JobCard[] = []
  const chunks = html.split(/id="item-/).slice(1)

  for (const chunk of chunks) {
    const idMatch = chunk.match(/^(\d+)"/)
    if (!idMatch) continue
    const id = idMatch[1]

    const body = chunk.split(/class="(?:lister__footer|mini-lister|paginator|ad ad--)/)[0]

    // Title + link. href values carry stray whitespace/newlines — cleanHref trims.
    const linkMatch = body.match(
      /lister__header"><a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i,
    )
    if (!linkMatch) continue
    const title = clean(linkMatch[2])
    if (!title) continue
    const url = cleanHref(linkMatch[1], `${BASE}/job/${id}/`)

    const metaItem = (name: string): string | null => {
      const m = body.match(
        new RegExp(`lister__meta-item--${name}[^>]*>([\\s\\S]*?)<\\/li>`, "i"),
      )
      return m ? clean(m[1]) || null : null
    }
    const company = metaItem("recruiter")
    const location = metaItem("location")
    // Salary is frequently empty on this board → null, never omitted.
    const salary = metaItem("salary")

    // The board exposes no posting-date anchor on search cards today (verified
    // live 2026-10-13); keep the generic anchors so a future markup change
    // surfaces dates instead of silently staying null.
    let date: string | null = null
    const dt = body.match(/datetime="([^"]+)"/i)
    if (dt) date = dt[1]
    else {
      const dm = body.match(/lister__meta-item--date[^>]*>([\s\S]*?)<\/li>/i)
      if (dm) date = clean(dm[1]) || null
    }

    const descHtml = extractDivContent(body, "lister__description")
    const snippet = descHtml ? clean(descHtml) || null : null

    results.push({ id, title, company, location, date, url, salary, snippet })
  }

  return results
}

/** Normalize employmentType from JSON-LD (string | array | JSON-encoded string). */
function normalizeEmploymentType(v: unknown): string | null {
  if (v == null) return null
  if (Array.isArray(v)) {
    const parts = v.filter((x): x is string => typeof x === "string" && x.trim() !== "")
    return parts.length ? parts.join(", ") : null
  }
  if (typeof v === "string") {
    const s = v.trim()
    if (!s) return null
    if (s.startsWith("[")) {
      try {
        const arr = JSON.parse(s)
        if (Array.isArray(arr)) return normalizeEmploymentType(arr)
      } catch {
        /* fall through to raw string */
      }
    }
    return s
  }
  return null
}

/** Build a "Locality, Region, Country" string from JSON-LD jobLocation. */
function locationFromJobLocation(raw: unknown): string | null {
  const list = Array.isArray(raw) ? raw : raw ? [raw] : []
  for (const entry of list) {
    const address = (entry as { address?: Record<string, unknown> } | null)?.address
    if (!address || typeof address !== "object") continue
    const parts = [address.addressLocality, address.addressRegion, address.addressCountry]
      .map((p) => (typeof p === "string" ? p.trim() : ""))
      .filter(Boolean)
    if (parts.length) return parts.join(", ")
  }
  return null
}

/**
 * Parse the single-job detail page. Primary source is the JSON-LD
 * `application/ld+json` block with `@type: JobPosting`. Returns null when no
 * such block exists (caller reports NO_JOB_DATA) — the page's similar-jobs
 * mini-lister and tracking blob are never mistaken for the posting itself.
 */
export function parseJobDetail(html: string, id: string): JobDetail | null {
  let posting: Record<string, unknown> | null = null
  const ldRe = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null
  while ((m = ldRe.exec(html)) !== null && posting === null) {
    let data: unknown
    try {
      data = JSON.parse(m[1])
    } catch {
      continue // malformed block — skip, look at the next one
    }
    const candidates = Array.isArray(data)
      ? data
      : data && typeof data === "object" && Array.isArray((data as { "@graph"?: unknown[] })["@graph"])
        ? ((data as { "@graph": unknown[] })["@graph"] as unknown[])
        : [data]
    for (const c of candidates) {
      if (c && typeof c === "object" && (c as { "@type"?: unknown })["@type"] === "JobPosting") {
        posting = c as Record<string, unknown>
        break
      }
    }
  }
  if (!posting) return null

  const title = typeof posting.title === "string" && posting.title.trim() ? posting.title.trim() : null
  const org = posting.hiringOrganization as { name?: unknown } | undefined
  const company = org && typeof org.name === "string" && org.name.trim() ? org.name.trim() : null

  let location = locationFromJobLocation(posting.jobLocation)
  if (!location) {
    const lm = html.match(/"LocationDescription":\s*"((?:[^"\\]|\\.)*)"/)
    if (lm) location = jsonStringValue(lm[1])
  }

  let salary: string | null = null
  const sm = html.match(/"SalaryDescription":\s*"((?:[^"\\]|\\.)*)"/)
  if (sm) salary = jsonStringValue(sm[1])

  const canonical = html.match(/<link rel="canonical" href="([^"]+)"/i)?.[1]
  const url = canonical ? canonical.trim() : `${BASE}/job/${id}/`

  // Apply button: /apply/{id}/{slug}?LinkSource=JobDetails (href may carry the
  // same stray whitespace as search-card hrefs) — external ATS on click.
  let applyUrl: string | null = null
  const am = html.match(/href="([^"]*\/apply\/[^"]*)"/i)
  if (am) {
    const cleaned = am[1].trim()
    if (cleaned) applyUrl = cleaned.startsWith("/") ? BASE + cleaned : cleaned
  }

  const rawDesc = typeof posting.description === "string" ? posting.description : ""
  const description = rawDesc ? htmlToText(rawDesc) || null : null

  return {
    id,
    title,
    company,
    location,
    date: typeof posting.datePosted === "string" ? posting.datePosted : null,
    url,
    salary,
    description,
    validThrough: typeof posting.validThrough === "string" ? posting.validThrough : null,
    employmentType: normalizeEmploymentType(posting.employmentType),
    applyUrl,
  }
}
