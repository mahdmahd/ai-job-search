// Data source: Consortium LGBT (www.consortium.lgbt) WP Job Manager board.
// Search goes through the plugin's pretty AJAX endpoint
// POST /jm-ajax/get_listings/ (form-encoded, no nonce required); detail
// fetches the public /job/<slug>/ page. Both are parsed with regex — the
// markup is shallow and stable, so zero runtime dependencies.

export const SEARCH_URL = "https://www.consortium.lgbt/jm-ajax/get_listings/"
export const BASE_URL = "https://www.consortium.lgbt"
export const POST_ID = "53" // jobs page id (shortcode data-post_id)

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA = "Mozilla/5.0 (compatible; consortiumlgbt-cli/1.0)"

/** POST form-encoded with exponential backoff on 429/5xx. */
export async function ajaxPost(params: Record<string, string>): Promise<string> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(SEARCH_URL, {
      method: "POST",
      headers: {
        "User-Agent": UA,
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Requested-With": "XMLHttpRequest",
        Referer: `${BASE_URL}/jobs/`,
        Accept: "application/json, text/javascript, */*; q=0.01",
      },
      body: new URLSearchParams(params).toString(),
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
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`)
    }
    return response.text()
  }
  throw new Error("Request failed after max retries")
}

/** GET HTML with exponential backoff on 429/5xx. Returns "" on a 404. */
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
  employmentType: string | null
  deadline: string | null
}

export interface JobDetail extends JobCard {
  description: string | null
  validThrough: string | null
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
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => numericEntity(parseInt(dec, 10)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, hex) => numericEntity(parseInt(hex, 16)))
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&#8217;|&#x2019;/gi, "'")
    .replace(/&#8216;|&#x2018;/gi, "'")
    .replace(/&#8220;|&#x201C;/gi, '"')
    .replace(/&#8221;|&#x201D;/gi, '"')
    .replace(/&#8211;|&#x2013;/gi, "-")
    .replace(/&#8212;|&#x2014;/gi, "--")
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

function clean(html: string): string {
  return decodeHtmlEntities(stripTags(html))
}

/**
 * Parse the AJAX `html` payload: a flat run of `<li class="post-<id>
 * job_listing ...">` cards. We split on the `<li class="post-` boundary and
 * parse each chunk independently so one malformed card cannot break the rest.
 */
export function parseJobCards(html: string): JobCard[] {
  const results: JobCard[] = []
  const chunks = html.split(/(?=<li class="post-)/)

  for (const chunk of chunks) {
    if (!chunk.startsWith("<li class=\"post-")) continue
    if (!/\bjob_listing\b/.test(chunk.slice(0, 200))) continue

    const idMatch = chunk.match(/^<li class="post-(\d+)/)
    if (!idMatch) continue
    const id = idMatch[1]

    const linkMatch = chunk.match(/<a\s+href="([^"]*\/job\/[^"]*)"/i)
    const url = linkMatch ? decodeHtmlEntities(linkMatch[1]) : `${BASE_URL}/?p=${id}`

    const h3 = chunk.match(/<h3>([\s\S]*?)<\/h3>/i)
    const title = h3 ? clean(h3[1]) : null
    if (!title) continue

    const companyMatch = chunk.match(/<div class="company">[\s\S]*?<strong>([\s\S]*?)<\/strong>/i)
    const company = companyMatch ? clean(companyMatch[1]) || null : null

    const locMatch = chunk.match(/<div class="location">([\s\S]*?)<\/div>/i)
    const location = locMatch ? clean(locMatch[1].replace(/<small>[\s\S]*?<\/small>/gi, "")) || null : null

    const dt = chunk.match(/<time datetime="([^"]+)"/i)
    const date = dt ? dt[1].slice(0, 10) : null

    const jt = chunk.match(/<li class="job-type\s+([a-z-]+)"/i)
    const employmentType = jt ? clean(jt[1]) || null : null

    const dl = chunk.match(/<li class="application-deadline[^"]*"[^>]*>([\s\S]*?)<\/li>/i)
    const deadline = dl ? clean(dl[1].replace(/<label>[\s\S]*?<\/label>/i, "")) || null : null

    results.push({ id, title, company, location, date, url, employmentType, deadline })
  }

  return results
}

/** Extract the JSON-LD JobPosting block from a detail page. */
function jsonLd(html: string): Record<string, unknown> | null {
  const m = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)
  if (!m) return null
  try {
    const parsed: unknown = JSON.parse(m[1])
    if (parsed && typeof parsed === "object" && (parsed as Record<string, unknown>)["@type"] === "JobPosting") {
      return parsed as Record<string, unknown>
    }
    return null
  } catch {
    return null
  }
}

function jsonLdText(value: unknown): string | null {
  if (typeof value !== "string") return null
  const cleaned = decodeHtmlEntities(
    value
      .replace(/<\s*br\s*\/?>/gi, "\n")
      .replace(/<\/(p|li|ul|ol|div|h\d|tr)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim()
  return cleaned || null
}

/** Parse a single-job detail page (JSON-LD first, visible markup fallback). */
export function parseJobDetail(html: string, id: string, url: string): JobDetail {
  const ld = jsonLd(html)

  let title = "(untitled)"
  let company: string | null = null
  let location: string | null = null
  let date: string | null = null
  let validThrough: string | null = null
  let description: string | null = null
  let employmentType: string | null = null

  if (ld) {
    if (typeof ld["title"] === "string" && ld["title"].trim()) title = ld["title"].trim()
    const org = ld["hiringOrganization"]
    if (org && typeof org === "object") {
      const name = (org as Record<string, unknown>)["name"]
      if (typeof name === "string" && name.trim()) company = name.trim()
    }
    const addr = ld["jobLocation"]
    const locObj = Array.isArray(addr) ? addr[0] : addr
    if (locObj && typeof locObj === "object") {
      const a = (locObj as Record<string, unknown>)["address"]
      if (typeof a === "string" && a.trim()) location = a.trim()
    }
    if (typeof ld["datePosted"] === "string") date = ld["datePosted"].slice(0, 10)
    if (typeof ld["validThrough"] === "string") validThrough = ld["validThrough"].slice(0, 10)
    description = jsonLdText(ld["description"])
    const et = ld["employmentType"]
    const etStr = Array.isArray(et) ? et.join(", ") : et
    if (typeof etStr === "string" && etStr.trim()) employmentType = etStr.trim()
  }

  // Fallbacks from visible markup when JSON-LD is absent.
  if (title === "(untitled)") {
    const h = html.match(/<span class="fl-heading-text">([\s\S]*?)<\/span>/i)
    if (h) title = clean(h[1]) || title
  }

  return {
    id,
    title,
    company,
    location,
    date,
    url,
    employmentType,
    deadline: validThrough,
    description,
    validThrough,
  }
}
