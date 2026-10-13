// Data source: LatinosinHigherEd (latinosinhighered.com), a JobMount job-board
// site (Madgex-style layout). No authentication required; robots.txt allows
// /candidate/search_jobs and /career/*. We parse the HTML with chunked regex
// (zero runtime dependencies, same architecture as linkedin-search): one
// malformed card can never break the rest of the page.

export const BASE_URL = "https://latinosinhighered.com"
export const SEARCH_URL = `${BASE_URL}/candidate/search_jobs`

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

// Honest UA that names the tool — never browser impersonation.
const UA = "Mozilla/5.0 (compatible; latinosinhighered-cli/1.0)"

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
}

export interface JobDetail extends JobCard {
  description: string | null
  datePosted: string | null
  validThrough: string | null
  category: string | null
  jobType: string | null
  salary: string | null
  requiredEducation: string | null
  requiredExperience: string | null
  applyUrl: string | null
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

export function clean(html: string): string {
  return decodeHtmlEntities(stripTags(html))
}

/** Inner text of the first `<span class="...cls...">…</span>` in the chunk. */
function spanText(chunk: string, cls: string): string | null {
  const m = chunk.match(
    new RegExp(`class="[^"]*\\b${cls}\\b[^"]*"[^>]*>([\\s\\S]*?)<\\/span>`, "i"),
  )
  return m ? clean(m[1]) || null : null
}

/**
 * Resolve a job id from a bare numeric id, a latinosinhighered.com career URL
 * (with or without scheme), or a site-relative `/career/...` path. Any URL on
 * another host is rejected: a foreign apply/board link must never be reduced
 * to its digits and fetched as a LatinosinHigherEd posting.
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
    if (!/(^|\.)latinosinhighered\.com$/i.test(parsed.hostname)) return null
    const m = parsed.pathname.match(/\/career\/(\d{4,})(?:\/|$)/)
    return m ? m[1] : null
  }

  // Site-relative path: "/career/179106/slug" or "career/179106/slug".
  const m = trimmed.match(/^\/?career\/(\d{4,})(?:\/|$)/)
  return m ? m[1] : null
}

/**
 * Parse the search results page. Split on the `a.job-link` anchor and parse
 * each chunk independently so one malformed card cannot break the rest. The
 * cards sit inside the rotating "featured jobs" module (verified 2026-10-13);
 * there is no separate keyword-results container on the GET endpoint, so ALL
 * job-link rows are parsed and deduplicated by id.
 */
export function parseJobCards(html: string): JobCard[] {
  const results: JobCard[] = []
  const seen = new Set<string>()
  const chunks = html.split(/<a class="job-link"/i).slice(1)

  for (const chunk of chunks) {
    // The chunk starts with the anchor's remaining attributes: `tabindex="50"
    // href="/career/<id>/<slug>"`.
    const hrefMatch = chunk.match(/href="([^"]*)"/i)
    if (!hrefMatch) continue
    const href = hrefMatch[1].trim()
    const pathMatch = href.match(/\/career\/(\d{4,})(?:\/([^\/?#]*))?/i)
    if (!pathMatch) continue
    const id = pathMatch[1]
    if (seen.has(id)) continue

    const title = spanText(chunk, "featured-jobs-title")
    if (!title) continue
    seen.add(id)

    const company = spanText(chunk, "sp_sh_employer")
    const city = spanText(chunk, "sp_sh_city")
    const region = spanText(chunk, "sp_sh_region")
    const location = [city, region].filter((p): p is string => !!p).join(", ") || null

    results.push({
      id,
      title,
      company,
      location,
      // Search cards carry no date element — only the detail page's JSON-LD
      // datePosted does. null, never omitted.
      date: null,
      url: `${BASE_URL}/career/${id}/${pathMatch[2] ?? ""}`.replace(/\/$/, ""),
    })
  }

  return results
}

/** Parse every application/ld+json script and return the JobPosting object. */
export function findJobPosting(html: string): Record<string, unknown> | null {
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

/**
 * Parse the `vac_item_*` label/value table on the detail page. Labels are
 * matched by visible text (`Employer:&nbsp;`, `City:&nbsp;`, …) with the value
 * in the following `<td>` — robust to the platform's varying class names.
 */
export function parseDetailTable(html: string): Record<string, string> {
  const fields: Record<string, string> = {}
  const rowRe = /<tr[^>]*>\s*<td[^>]*class="f[^"]*"[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/gi
  let m: RegExpExecArray | null
  while ((m = rowRe.exec(html)) !== null) {
    // &nbsp; decodes to a trailing space AFTER clean()'s internal trim, so
    // the colon strip must tolerate trailing whitespace (label "City:&nbsp;").
    const label = clean(m[1]).replace(/:\s*$/, "").trim().toLowerCase()
    const value = clean(m[2])
    if (!label || !value || fields[label] !== undefined) continue
    fields[label] = value
  }
  return fields
}

/** External apply link from the inline `var rUrl = '<url>'` JS on the detail page. */
export function extractApplyUrl(html: string): string | null {
  const m = html.match(/var\s+rUrl\s*=\s*'([^']+)'/)
  if (!m) return null
  const url = decodeHtmlEntities(m[1]).replace(/\\u002F/gi, "/").trim()
  return url || null
}

/** Description HTML → readable text with paragraph breaks preserved.
 *  Unlike `clean`, this must NOT collapse whitespace across newlines — the
 *  detail page relies on <br>/<p> for paragraph structure. */
export function htmlToText(html: string): string | null {
  const withBreaks = html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|ul|ol|li|h\d)>/gi, "\n")
    .replace(/\r\n?/g, "\n")
  const noTags = withBreaks.replace(/<[^>]+>/g, " ")
  const text = decodeHtmlEntities(noTags)
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  return text || null
}

/** Parse the single-job detail page (JSON-LD JobPosting + vac_item table). */
export function parseJobDetail(html: string, id: string): JobDetail {
  const posting = findJobPosting(html)
  const table = parseDetailTable(html)

  const title =
    (typeof posting?.title === "string" && posting.title.trim()) ||
    clean(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "") ||
    "(untitled)"

  const jsonOrg =
    posting && typeof posting.hiringOrganization === "object" && posting.hiringOrganization !== null
      ? ((posting.hiringOrganization as { name?: unknown }).name ?? null)
      : null
  const company =
    table["employer"] ?? (typeof jsonOrg === "string" && jsonOrg.trim() ? jsonOrg.trim() : null)

  // Description: JSON-LD first, the job_desc_td cell as fallback.
  let description: string | null = null
  if (typeof posting?.description === "string" && posting.description.trim()) {
    description = htmlToText(posting.description)
  }
  if (!description) {
    const m = html.match(/class="job_desc_td"[^>]*>([\s\S]*?)<\/td>/i)
    if (m) description = htmlToText(m[1])
  }

  const city = table["city"] ?? null
  const region = table["state"] ?? null
  const location = [city, region].filter((p): p is string => !!p).join(", ") || null

  const datePosted =
    typeof posting?.datePosted === "string" && posting.datePosted
      ? posting.datePosted
      : (html.match(/class="post_date"[^>]*>([\s\S]*?)<\/span>/i)?.[1] != null
          ? clean(html.match(/class="post_date"[^>]*>([\s\S]*?)<\/span>/i)![1]) || null
          : null)

  return {
    id,
    title,
    company,
    location,
    date: datePosted,
    url: `${BASE_URL}/career/${id}/`,
    description,
    datePosted,
    validThrough: typeof posting?.validThrough === "string" ? posting.validThrough : null,
    category: table["category"] ?? null,
    jobType: table["job type"] ?? null,
    salary: table["salary and benefits"] ?? null,
    requiredEducation: table["required education"] ?? null,
    requiredExperience: table["required experience"] ?? null,
    applyUrl: extractApplyUrl(html),
  }
}
