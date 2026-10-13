// Data source: vacancyedu.com's public WordPress REST API (wp-json/wp/v2/posts).
// No authentication required; CORS is open; robots.txt allows /wp-json/.
// Search returns a JSON array of post objects with X-WP-Total / X-WP-TotalPages
// headers; detail returns a single post. We parse with chunk-safe per-item
// parsing (no DOM parser needed — the API hands us clean JSON, and the only
// HTML is inside title/content strings we strip ourselves).

export const API_BASE = "https://vacancyedu.com/wp-json/wp/v2/posts"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA = "Mozilla/5.0 (compatible; vacancyedu-cli/1.0)"

export interface ApiResult<T> {
  data: T
  total: number | null
  totalPages: number | null
}

/**
 * Fetch a WP REST endpoint as JSON with exponential backoff on 429/5xx.
 * Returns null on a 404 (never a crash — the detail command surfaces this
 * as NOT_FOUND). Throws on other non-OK statuses and network failures.
 */
export async function apiFetch<T>(url: string): Promise<ApiResult<T> | null> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "application/json",
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
    if (response.status === 404) return null
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`)
    }
    const totalHeader = response.headers.get("x-wp-total")
    const totalPagesHeader = response.headers.get("x-wp-totalpages")
    let data: T
    try {
      data = (await response.json()) as T
    } catch {
      throw new Error("Response was not valid JSON")
    }
    return {
      data,
      total: totalHeader !== null && totalHeader !== "" ? Number(totalHeader) : null,
      totalPages:
        totalPagesHeader !== null && totalPagesHeader !== "" ? Number(totalPagesHeader) : null,
    }
  }
  throw new Error("Request failed after max retries")
}

export interface JobResult {
  id: number
  title: string
  company: string | null
  location: string | null
  date: string | null
  url: string | null
}

export interface JobDetail extends JobResult {
  description: string | null
  deadlines: string[]
  applyLinks: string[]
}

/** Convert a Unicode code point to a string (same as linkedin-search). */
function numericEntity(cp: number): string {
  return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ""
}

export function decodeHtmlEntities(text: string): string {
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
 * Parse company/location out of the title's "… at <Institution>, <Country>"
 * pattern. Splits at the FIRST comma after "at" so "Lund University, Scania,
 * Sweden" yields company="Lund University", location="Scania, Sweden".
 * Titles without an " at " match return null for both (never invented).
 */
export function parseCompanyLocation(title: string): { company: string | null; location: string | null } {
  const m = title.match(/\s+at\s+(.+)$/i)
  if (!m) return { company: null, location: null }
  const rest = m[1].trim()
  if (!rest) return { company: null, location: null }
  const comma = rest.indexOf(",")
  if (comma === -1) return { company: rest, location: null }
  const company = rest.slice(0, comma).trim()
  const location = rest.slice(comma + 1).trim()
  return { company: company || null, location: location || null }
}

/**
 * Parse the search response: a flat JSON array of WP post objects. We parse
 * each item independently so one malformed entry cannot break the rest.
 * Items missing an `id` or a usable `title.rendered` are skipped.
 */
export function parsePosts(raw: unknown): JobResult[] {
  if (!Array.isArray(raw)) return []
  const results: JobResult[] = []
  for (const item of raw) {
    try {
      if (item === null || typeof item !== "object") continue
      const post = item as Record<string, unknown>
      const id = post.id
      if (typeof id !== "number" && typeof id !== "string") continue
      const titleRendered =
        post.title && typeof post.title === "object" && post.title !== null
          ? (post.title as Record<string, unknown>).rendered
          : undefined
      const rawTitle = typeof titleRendered === "string" ? titleRendered : ""
      const title = decodeHtmlEntities(
        rawTitle.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "),
      ).trim()
      if (!title) continue
      const { company, location } = parseCompanyLocation(title)
      const date = typeof post.date === "string" ? post.date : null
      const url = typeof post.link === "string" && post.link ? post.link : null
      results.push({
        id: typeof id === "number" ? id : Number(id),
        title,
        company,
        location,
        date,
        url,
      })
    } catch {
      // A single malformed post must never break the rest of the page.
      continue
    }
  }
  return results
}

/**
 * Convert HTML to readable plain text. Preserves paragraph/list breaks as
 * newlines, decodes entities, and collapses runs of blank lines.
 */
export function htmlToText(html: string): string {
  const withBreaks = html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|ul|ol|div|h\d|tr)>/gi, "\n")
  return decodeHtmlEntities(withBreaks.replace(/<[^>]+>/g, " "))
    .replace(/[ \t]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/**
 * Surface every "Deadline : <date>" line in the post body. The board writes
 * them as free text (e.g. `<p><strong>Deadline :</strong> 30 November 2026</p>`)
 * and a post may aggregate several sub-positions, each with its own deadline.
 */
export function extractDeadlines(html: string): string[] {
  const found: string[] = []
  const re = /Deadline\s*:\s*<\/strong>\s*([^<]+)/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const value = decodeHtmlEntities(m[1]).replace(/\s+/g, " ").trim()
    if (value && !found.includes(value)) found.push(value)
  }
  // Fallback: plain-text "Deadline:" without a closing </strong> (layout drift).
  if (found.length === 0) {
    const plainRe = /Deadline\s*:\s*([^\n<]{3,80})/gi
    while ((m = plainRe.exec(html)) !== null) {
      const value = decodeHtmlEntities(m[1]).replace(/\s+/g, " ").trim()
      if (value && !found.includes(value)) found.push(value)
    }
  }
  return found
}

/**
 * Collect plain external "apply" anchors from the body. The board posts
 * outbound application links as ordinary <a href="https://…"> tags; we take
 * unique absolute http(s) URLs and drop vacancyedu's own links.
 */
export function extractApplyLinks(html: string): string[] {
  const found: string[] = []
  const re = /<a\s[^>]*href="(https?:\/\/[^"]+)"/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const href = decodeHtmlEntities(m[1])
    if (href.includes("vacancyedu.com")) continue
    if (!found.includes(href)) found.push(href)
  }
  return found
}

/** Parse a single WP REST post into a JobDetail. */
export function parsePostDetail(raw: unknown): JobDetail | null {
  if (raw === null || typeof raw !== "object") return null
  const post = raw as Record<string, unknown>
  const id = post.id
  if (typeof id !== "number" && typeof id !== "string") return null
  const titleRendered =
    post.title && typeof post.title === "object" && post.title !== null
      ? (post.title as Record<string, unknown>).rendered
      : undefined
  const rawTitle = typeof titleRendered === "string" ? titleRendered : ""
  const title = decodeHtmlEntities(
    rawTitle.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "),
  ).trim()
  const contentRendered =
    post.content && typeof post.content === "object" && post.content !== null
      ? (post.content as Record<string, unknown>).rendered
      : undefined
  const contentHtml = typeof contentRendered === "string" ? contentRendered : ""
  const { company, location } = parseCompanyLocation(title)
  return {
    id: typeof id === "number" ? id : Number(id),
    title: title || "(untitled)",
    company,
    location,
    date: typeof post.date === "string" ? post.date : null,
    url: typeof post.link === "string" && post.link ? post.link : null,
    description: contentHtml ? htmlToText(contentHtml) : null,
    deadlines: extractDeadlines(contentHtml),
    applyLinks: extractApplyLinks(contentHtml),
  }
}

/**
 * Convert a job-age in days to WordPress REST's `after` parameter (ISO 8601,
 * no timezone offset — matching the timestamps the REST API itself emits,
 * e.g. "2026-10-13T13:07:49"). Returns null for the "all time" sentinel 9999.
 */
export function jobageToAfter(days: number, now: Date = new Date()): string | null {
  if (!days || days <= 0 || days >= 9999) return null
  const cutoff = new Date(now.getTime() - days * 86400000)
  return cutoff.toISOString().slice(0, 19)
}
