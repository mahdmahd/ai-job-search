// Data source: Nature Careers (nature.com/naturecareers), a Madgex job board.
// No authentication required. Search returns an HTML results page (Madgex
// "lister" markup); detail returns a single job's HTML whose JSON-LD
// (script[type="application/ld+json"], @type JobPosting) is the richest field
// source. Both are parsed with regex + JSON.parse — zero runtime dependencies.

export const SEARCH_URL = "https://www.nature.com/naturecareers/searchjobs/"
export const SITE_ORIGIN = "https://www.nature.com"
export const JOB_PATH = "/naturecareers/job/"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

// Honest tool-naming UA (the convention every shipped portal CLI follows).
// robots.txt disallows the named AI crawlers (anthropic-ai, ClaudeBot, GPTBot,
// ...) site-wide, so no AI product name may ever appear in this string.
export const UA = "Mozilla/5.0 (compatible; naturecareers-cli/1.0)"

/** Fetch HTML with exponential backoff on 429/5xx. Returns "" on a 404. */
export async function htmlFetch(url: string): Promise<string> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-GB,en;q=0.9",
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
  /** Relative posting age as the portal renders it ("19 days ago"), or null. */
  date: string | null
  salary: string | null
  snippet: string | null
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

/**
 * Convert a Unicode code point to a string. Uses `fromCodePoint` (not
 * `fromCharCode`) so supplementary-plane code points decode correctly, and
 * drops out-of-range values instead of throwing.
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
    .replace(/&#(\d+);/g, (_, dec) => numericEntity(parseInt(dec, 10)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, hex) => numericEntity(parseInt(hex, 16)))
    .replace(/&nbsp;/g, " ")
    // &amp; last so "&amp;#39;" does not decode twice.
    .replace(/&amp;/g, "&")
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

function clean(html: string): string {
  return decodeHtmlEntities(stripTags(html))
}

/** Resolve a (possibly relative, whitespace-riddled) href to an absolute URL. */
export function resolveHref(href: string): string {
  const tight = href.replace(/\s+/g, "")
  if (!tight) return ""
  try {
    return new URL(tight, SITE_ORIGIN).toString()
  } catch {
    return tight
  }
}

/** Pull the numeric job id out of a /naturecareers/job/{id}/{slug}/ URL. */
export function idFromUrl(url: string): string | null {
  const m = url.match(/\/naturecareers\/job\/(\d+)\//)
  return m ? m[1] : null
}

/**
 * Parse the total-result count the search page embeds. Two signals, in order:
 *   1. the analytics config `'returned\x2dresults': '159',`
 *   2. the meta description "159 jobs using the term 'postdoc' ..."
 * Returns null when neither is parseable (caller falls back to page length).
 */
export function parseResultCount(html: string): number | null {
  const m =
    html.match(/returned\\x2dresults['"]?\s*:\s*['"](\d+)['"]/) ??
    html.match(/<meta name="description" content="(\d+) jobs using the term/)
  return m ? parseInt(m[1], 10) : null
}

/**
 * Parse the search results page: one <li class="lister__item ..." id="item-{id}">
 * per posting inside ul#listing. We split on `id="item-` and parse each chunk
 * independently, so empty-ad <li> cards and malformed markup skip cleanly
 * instead of breaking the rest of the page.
 */
export function parseJobCards(html: string): JobCard[] {
  const results: JobCard[] = []
  const chunks = html.split(/id="item-/).slice(1)

  for (const chunk of chunks) {
    const idMatch = chunk.match(/^(\d+)/)
    if (!idMatch) continue
    const id = idMatch[1]

    // Title + URL: h3.lister__header > a. The href values contain stray
    // whitespace/newlines inside the quotes — resolveHref trims them.
    const header = chunk.match(/<h3 class="lister__header"><a\b[\s\S]*?href="([\s\S]*?)"/i)
    if (!header) continue // empty ad card or truncated markup — skip, keep going
    const url = resolveHref(header[1])
    const titleHtml = chunk.match(
      /<h3 class="lister__header"><a\b[\s\S]*?>([\s\S]*?)<\/a>/i,
    )
    const title = titleHtml ? clean(titleHtml[1]) : ""
    if (!title || !url) continue

    const meta = (cls: string): string | null => {
      const m = chunk.match(
        new RegExp(`<li class="lister__meta-item ${cls}">([\\s\\S]*?)</li>`),
      )
      return m ? clean(m[1]) || null : null
    }

    const snippetMatch = chunk.match(/<p class="lister__description[^"]*">([\s\S]*?)<\/p>/i)
    // Relative age text ("19 days ago") from job-actions__action pipe. Absent
    // is fine — never invent an absolute date from it.
    const ageMatch = chunk.match(/<li class="job-actions__action pipe">([^<]*)<\/li>/i)

    results.push({
      id,
      title,
      company: meta("lister__meta-item--recruiter"),
      location: meta("lister__meta-item--location"),
      date: ageMatch ? clean(ageMatch[1]) || null : null,
      salary: meta("lister__meta-item--salary"),
      snippet: snippetMatch ? clean(snippetMatch[1]) || null : null,
      url,
    })
  }

  return results
}

/**
 * Extract the JobPosting node from the page's JSON-LD. Pages may carry several
 * ld+json scripts (Organization, BreadcrumbList, ...); pick the JobPosting one,
 * tolerating an array wrapper or an @graph container, and skipping scripts
 * that do not parse.
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
 * employmentType arrives inconsistently: sometimes "FULL_TIME", sometimes the
 * literal string '["FULL_TIME"]' (a JSON array encoded as a string — observed
 * live on Nature Careers, 2026-10-13). Normalize both to a plain value.
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

/** HTML description -> readable text with paragraph breaks preserved. */
export function descriptionToText(html: string): string | null {
  // Raw source newlines are formatting, not content (they render as spaces in
  // HTML) — flatten them first so a `<br />` followed by source `\r\n` yields
  // one break. Only tags generate breaks: <br> a single break, block closers
  // a paragraph break.
  const flattened = html.replace(/\r\n?/g, "\n").replace(/\n[ \t]*/g, " ")
  const withBreaks = flattened
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|ul|ol|div|h\d|tr)>/gi, "\n\n")
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

/** Parse a single job detail page (JSON-LD first, HTML fallbacks after). */
export function parseJobDetail(html: string, id: string): JobDetail {
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

  // JSON-LD jobLocation often carries only addressCountry; the page's own
  // config block ("LocationDescription": "Milan (IT)") has the city. Prefer
  // the JSON-LD address when it names more than a bare country.
  let location = locationFromJobLocation(posting?.jobLocation)
  if (!location || !location.includes(",")) {
    const desc = html.match(/"LocationDescription":\s*"((?:[^"\\]|\\.)*)"/)
    if (desc) {
      try {
        const decoded = JSON.parse(`"${desc[1]}"`) as string
        if (decoded.trim()) location = decoded.trim()
      } catch {
        // malformed escape — fall back to the raw capture below
        if (desc[1].trim()) location = desc[1].trim()
      }
    }
  }

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

  const applyMatch = html.match(/<a[^>]*href="([^"]*\/naturecareers\/apply\/[^"]*)"/i)
  const applyUrl = applyMatch ? resolveHref(applyMatch[1]) : null

  const url = `${SITE_ORIGIN}${JOB_PATH}${id}/`

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
