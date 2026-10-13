// Data source: Inside Higher Ed Careers (careers.insidehighered.com), a Madgex
// job-board site (same platform as jobs.chronicle.com and nature.com/naturecareers).
// No authentication required; robots.txt allows /searchjobs/ and /job/*. We parse
// the HTML with chunked regex (zero runtime dependencies, same architecture as
// linkedin-search): one malformed card can never break the rest of the page.

export const BASE_URL = "https://careers.insidehighered.com"
export const SEARCH_URL = `${BASE_URL}/searchjobs/`

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

// Honest UA that names the tool — never browser impersonation.
const UA = "Mozilla/5.0 (compatible; insidehighered-cli/1.0)"

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

export interface JobDetail extends JobCard {
  description: string | null
  validThrough: string | null
  employmentType: string | null
  applyUrl: string | null
  externalApplyUrl: string | null
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
    // Numeric character references: decimal (&#233;) and hexadecimal (&#xE9;).
    .replace(/&#(\d+);/g, (_, dec) => numericEntity(parseInt(dec, 10)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, hex) => numericEntity(parseInt(hex, 16)))
    .replace(/&nbsp;/g, " ")
    // &amp; last, so "&amp;#39;" does not double-decode into "'".
    .replace(/&amp;/g, "&")
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

function clean(html: string): string {
  return decodeHtmlEntities(stripTags(html))
}

/** Absolute URL for site-relative hrefs (`/apply/...` → full careers URL). */
function absoluteUrl(href: string): string {
  if (/^https?:\/\//i.test(href)) return href
  if (href.startsWith("//")) return `https:${href}`
  return BASE_URL + (href.startsWith("/") ? href : `/${href}`)
}

/** First inner-text match of `<meta ... content="...">`-style attributes is
 *  handled inline; this extracts an attribute value from an opening tag. */
function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`${name}="([^"]*)"`, "i"))
  return m ? m[1] : null
}

/**
 * Resolve a job id from a bare numeric id, a careers.insidehighered.com job
 * URL (with or without scheme), or a site-relative `/job/<id>/...` path.
 * Any URL on another host is rejected: a foreign apply/board link must never
 * be reduced to its digits and fetched as an Inside Higher Ed posting.
 */
export function normalizeId(input: string): string | null {
  const trimmed = input.trim()
  if (/^\d{4,}$/.test(trimmed)) return trimmed

  const hasScheme = /^https?:\/\//i.test(trimmed)
  const hostLike = /^[a-z0-9.-]+\.[a-z]{2,}(\/|$|\?)/i.test(trimmed)

  if (hasScheme || hostLike) {
    let parsed: URL
    try {
      parsed = new URL(hasScheme ? trimmed : `https://${trimmed}`)
    } catch {
      return null
    }
    // Only Inside Higher Ed hosts (careers.*, www.*, the dead jobs.* legacy).
    if (!/(^|\.)insidehighered\.com$/i.test(parsed.hostname)) return null
    const m = parsed.pathname.match(/\/job\/(\d{4,})(?:\/|$)/)
    return m ? m[1] : null
  }

  // Site-relative path: "/job/1234567/slug/" or "job/1234567/slug/".
  const m = trimmed.match(/^\/?job\/(\d{4,})(?:\/|$)/)
  return m ? m[1] : null
}

/**
 * Parse the search results page. Split on the per-card id anchor and parse
 * each chunk independently so one malformed card (or an interspersed ad /
 * mini-lister noise block, which carries no `id="item-..."`) cannot break the
 * rest. Returns only chunks that yield both an id and a title.
 */
export function parseJobCards(html: string): JobCard[] {
  const results: JobCard[] = []
  const chunks = html.split(/id="item-/).slice(1)

  for (const chunk of chunks) {
    const idMatch = chunk.match(/^(\d+)/)
    if (!idMatch) continue
    const id = idMatch[1]

    // Title + href from the lister header. Madgex writes the href across
    // several lines (`href=" \n\t/job/3509752/slug/\n\n"`), so trim before use.
    const header = chunk.match(
      /class="lister__header"[^>]*>\s*<a([^>]*)>([\s\S]*?)<\/a>/i,
    )
    if (!header) continue
    const title = clean(header[2])
    if (!title) continue

    const hrefAttr = attr(header[1], "href")
    const href = hrefAttr ? hrefAttr.replace(/\s+/g, "") : ""
    const url = href ? absoluteUrl(href) : `${BASE_URL}/job/${id}/`

    const meta = (cls: string): string | null => {
      const m = chunk.match(
        new RegExp(`class="[^"]*${cls}[^"]*"[^>]*>([\\s\\S]*?)<\\/li>`, "i"),
      )
      return m ? clean(m[1]) || null : null
    }

    const descMatch = chunk.match(
      /class="lister__description[^"]*"[^>]*>([\s\S]*?)<\/p>/i,
    )

    results.push({
      id,
      title,
      company: meta("lister__meta-item--recruiter"),
      location: meta("lister__meta-item--location"),
      // Search cards carry no visible date element — only the detail page's
      // JSON-LD datePosted does. null, never omitted.
      date: null,
      url,
      salary: meta("lister__meta-item--salary"),
      snippet: descMatch ? clean(descMatch[1]) || null : null,
    })
  }

  return results
}

/** Parse every application/ld+json script and return the JobPosting object. */
function findJobPosting(html: string): Record<string, unknown> | null {
  const re = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    let data: unknown
    try {
      data = JSON.parse(m[1].trim())
    } catch {
      continue
    }
    const candidates = Array.isArray(data)
      ? data
      : data && typeof data === "object" && Array.isArray((data as { "@graph"?: unknown[] })["@graph"])
        ? (data as { "@graph": unknown[] })["@graph"]
        : [data]
    for (const c of candidates) {
      if (c && typeof c === "object" && (c as { "@type"?: string })["@type"] === "JobPosting") {
        return c as Record<string, unknown>
      }
    }
  }
  return null
}

/** jobLocation: schema.org Place | Place[] → "City, Region, CC". */
function formatJobLocation(jl: unknown): string | null {
  if (!jl) return null
  const place = Array.isArray(jl) ? jl[0] : jl
  if (!place || typeof place !== "object") return null
  const addr = (place as { address?: Record<string, unknown> }).address
  if (!addr || typeof addr !== "object") return null
  const parts = [addr.addressLocality, addr.addressRegion, addr.addressCountry]
    .filter((p): p is string => typeof p === "string" && p.length > 0)
  return parts.length ? parts.join(", ") : null
}

/** employmentType arrives as a stringified JSON array ("[\"FULL_TIME\"]"). */
function formatEmploymentType(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed.join(", ") || null
  } catch {
    /* not JSON — use the raw string */
  }
  return raw
}

/** Description HTML → readable text with paragraph breaks preserved.
 *  Unlike `clean`, this must NOT collapse whitespace across newlines — the
 *  detail page relies on <br>/<p> for paragraph structure. */
function htmlToText(html: string): string | null {
  const withBreaks = html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/?(?:p|div|ul|ol|li|h\d)[^>]*>/gi, "\n")
    .replace(/\r\n?/g, "\n")
  const noTags = withBreaks.replace(/<[^>]+>/g, " ")
  const text = decodeHtmlEntities(noTags)
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  return text || null
}

/** Parse the single-job detail page (JSON-LD JobPosting + apply anchors). */
export function parseJobDetail(html: string, id: string): JobDetail {
  const posting = findJobPosting(html)

  const title =
    typeof posting?.title === "string" && posting.title.trim()
      ? posting.title.trim()
      : clean(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "") || "(untitled)"

  const company =
    posting && typeof posting.hiringOrganization === "object" && posting.hiringOrganization !== null
      ? ((posting.hiringOrganization as { name?: string }).name ?? null)
      : null

  const description =
    typeof posting?.description === "string" && posting.description.trim()
      ? htmlToText(posting.description)
      : null

  const date = typeof posting?.datePosted === "string" ? posting.datePosted : null
  const validThrough = typeof posting?.validThrough === "string" ? posting.validThrough : null
  const employmentType = formatEmploymentType(posting?.employmentType)

  // Apply anchors live in the page body, not the JSON-LD.
  const body = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "")
  const applyMatch = body.match(/href="([^"]*\/apply\/[^"]+)"/i)
  const applyUrl = applyMatch ? absoluteUrl(decodeHtmlEntities(applyMatch[1])) : null

  let externalApplyUrl: string | null = null
  const anchorRe = /<a\b([^>]*)>([\s\S]{0,400}?)<\/a>/gi
  let am: RegExpExecArray | null
  while ((am = anchorRe.exec(body)) !== null) {
    if (/Apply on website/i.test(am[2])) {
      const href = attr(am[1], "href")
      if (href) {
        externalApplyUrl = absoluteUrl(decodeHtmlEntities(href))
        break
      }
    }
  }

  return {
    id,
    title,
    company,
    location: formatJobLocation(posting?.jobLocation),
    date,
    url: `${BASE_URL}/job/${id}/`,
    salary: null,
    snippet: null,
    description,
    validThrough,
    employmentType,
    applyUrl,
    externalApplyUrl,
  }
}
