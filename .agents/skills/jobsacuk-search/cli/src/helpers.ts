// Data source: Jobs.ac.uk (https://www.jobs.ac.uk/), a UK academic jobs board.
// No authentication required. Search returns an HTML results page (25 cards per
// page); detail returns a single advert's HTML whose `var job = {"job": {...}}`
// embedded object is the richest field source. Both are parsed with regex +
// JSON.parse — zero runtime dependencies.
//
// Access note: robots.txt allows the /search/ and /job/ paths used here (only
// /job/feedback/ and /enhanced/fp/ are disallowed). Plain fetches work on
// search; detail pages intermittently need the search page as Referer — the CLI
// always sends it. h-captcha markup is embedded in every page but has never
// blocked plain curl; if a request ever fails, back off and report, never try
// to solve challenges.

export const SEARCH_URL = "https://www.jobs.ac.uk/search/"
export const SITE_ORIGIN = "https://www.jobs.ac.uk"
export const PAGE_SIZE = 25

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

// Honest tool-naming UA (the convention every shipped portal CLI follows).
export const UA = "Mozilla/5.0 (compatible; jobsacuk-cli/1.0)"

/**
 * Fetch HTML with exponential backoff on 429/5xx. Returns "" on a 404.
 * A challenge/interstitial page (no job markup) is surfaced as an error by
 * the caller — never silently treated as empty results.
 */
export async function htmlFetch(url: string, referer?: string): Promise<string> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const headers: Record<string, string> = {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-GB,en;q=0.9",
    }
    if (referer) headers["Referer"] = referer
    const response = await fetch(url, {
      headers,
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
  /** Advert id from data-advert-id (numeric, e.g. "1083631"). */
  id: string
  /** REF from /job/{REF}/... (e.g. "DSL474") or null when unparseable. */
  ref: string | null
  title: string
  company: string | null
  department: string | null
  location: string | null
  salary: string | null
  /** Date placed, as the portal renders it ("31 Jul"), or null. */
  date: string | null
  /** Closing date, as the portal renders it ("30 Mar"), or null. */
  deadline: string | null
  url: string
}

export interface JobDetail {
  /** REF (e.g. "DSL474") — the canonical detail key. */
  id: string
  /** Numeric advert id, or null. */
  advertId: string | null
  title: string
  company: string | null
  location: string | null
  /** "Placed On" date, as rendered, or null. */
  date: string | null
  /** "Closes" date, as rendered, or null. */
  deadline: string | null
  salary: string | null
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
    // Named entities the portal actually emits (salaries in GBP, typography).
    .replace(/&pound;/g, "£")
    .replace(/&euro;/g, "€")
    .replace(/&ndash;/g, "–")
    .replace(/&mdash;/g, "—")
    .replace(/&lsquo;/g, "‘")
    .replace(/&rsquo;/g, "’")
    .replace(/&ldquo;/g, "“")
    .replace(/&rdquo;/g, "”")
    .replace(/&hellip;/g, "…")
    .replace(/&times;/g, "×")
    .replace(/&copy;/g, "©")
    // &amp; last so "&amp;#39;" does not decode twice.
    .replace(/&amp;/g, "&")
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

function clean(html: string): string {
  return decodeHtmlEntities(stripTags(html))
}

export { decodeHtmlEntities, clean }

/** Resolve a (possibly relative) href to an absolute URL. */
export function resolveHref(href: string): string {
  const tight = href.trim()
  if (!tight) return ""
  try {
    return new URL(tight, SITE_ORIGIN).toString()
  } catch {
    return tight
  }
}

/** Pull the REF out of a /job/{REF}/... URL path. */
export function refFromUrl(url: string): string | null {
  const m = url.match(/\/job\/([A-Za-z0-9]+)(?:\/|$)/)
  return m ? m[1] : null
}

/**
 * Parse the total-result count the search page embeds:
 * `<strong class="job-count">582</strong> Jobs Found`.
 * Returns null when unparseable (caller falls back to page length).
 */
export function parseResultCount(html: string): number | null {
  const m = html.match(/<strong[^>]*class="job-count"[^>]*>\s*([\d,]+)/i)
  return m ? parseInt(m[1].replace(/,/g, ""), 10) : null
}

/**
 * Parse the search results page: one
 * `<div class="j-search-result__result ..." data-advert-id="{id}">` per
 * posting. We split on the `j-search-result__result` card opener and parse
 * each chunk independently, so one malformed card cannot break the rest.
 */
export function parseJobCards(html: string): JobCard[] {
  const results: JobCard[] = []
  // The opener is `class="j-search-result__result[ ...]"` followed later by
  // data-advert-id — but j-search-result__result--highlighted, __date-logos
  // etc. share the prefix, so anchor on the full token (quote/space after).
  const chunks = html.split(/<div class="j-search-result__result(?: |\")/).slice(1)

  for (const chunk of chunks) {
    const idMatch = chunk.match(/data-advert-id="(\d+)"/)
    if (!idMatch) continue
    const id = idMatch[1]

    // Title + URL: .j-search-result__text > a[href^="/job/"].
    const linkMatch = chunk.match(/<a\s+href="(\/job\/[^"]*)"[^>]*>([\s\S]*?)<\/a>/i)
    if (!linkMatch) continue
    const url = resolveHref(linkMatch[1])
    const title = clean(linkMatch[2])
    if (!title || !url) continue
    const ref = refFromUrl(linkMatch[1])

    const field = (cls: string): string | null => {
      const m = chunk.match(new RegExp(`<div class="${cls}"[^>]*>([\\s\\S]*?)</div>`, "i"))
      return m ? clean(m[1]) || null : null
    }

    // Location has no class: `<div>Location:\n Manchester\n</div>`.
    let location: string | null = null
    const locMatch = chunk.match(/<div>\s*Location:\s*([\s\S]*?)<\/div>/i)
    if (locMatch) location = clean(locMatch[1]) || null

    // .j-search-result__info holds "Salary: ..." — trim the label.
    let salary: string | null = null
    const info = field("j-search-result__info")
    if (info) salary = info.replace(/^Salary:\s*/i, "").trim() || null

    // Date placed: `<div>\n<strong>Date Placed: </strong>31 Jul\n</div>`.
    let date: string | null = null
    const placed = chunk.match(/Date Placed:\s*<\/strong>\s*([^<]*)/i)
    if (placed) date = clean(placed[1]) || null

    // Closing date: `.j-search-result__date--blue` ("30 Mar").
    let deadline: string | null = null
    const closes = chunk.match(
      /<span[^>]*class="[^"]*j-search-result__date--blue[^"]*"[^>]*>([\s\S]*?)<\/span>/i,
    )
    if (closes) deadline = clean(closes[1]) || null

    results.push({
      id,
      ref,
      title,
      company: field("j-search-result__employer"),
      department: field("j-search-result__department"),
      location,
      salary,
      date,
      deadline,
      url,
    })
  }

  return results
}

/**
 * Extract the embedded `var job = {"job": {...}}` object from a detail page.
 * The JSON is brace-balanced (strings may contain braces), so scan with
 * string-awareness instead of regex. Returns the inner job record or null.
 */
export function extractJobRecord(html: string): Record<string, unknown> | null {
  const m = html.match(/var\s+job\s*=\s*\{/)
  if (!m) return null
  const start = m.index! + m[0].length - 1
  let depth = 0
  let inStr = false
  let esc = false
  for (let j = start; j < html.length; j++) {
    const c = html[j]
    if (inStr) {
      if (esc) esc = false
      else if (c === "\\") esc = true
      else if (c === '"') inStr = false
    } else {
      if (c === '"') inStr = true
      else if (c === "{") depth++
      else if (c === "}") {
        depth--
        if (depth === 0) {
          try {
            const obj = JSON.parse(html.slice(start, j + 1)) as Record<string, unknown>
            const inner = obj["job"]
            if (inner && typeof inner === "object" && !Array.isArray(inner)) {
              return inner as Record<string, unknown>
            }
            return obj
          } catch {
            return null
          }
        }
      }
    }
  }
  return null
}

/** Read a record field as a trimmed non-empty string, else null. */
function strField(rec: Record<string, unknown> | null, key: string): string | null {
  if (!rec) return null
  const v = rec[key]
  if (typeof v !== "string") return null
  const t = v.trim()
  return t || null
}

/** HTML description -> readable text with paragraph breaks preserved. */
export function descriptionToText(html: string): string | null {
  const withBreaks = html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|ul|ol|div|h\d|tr)>/gi, "\n")
  const text = decodeHtmlEntities(withBreaks.replace(/<[^>]+>/g, "").replace(/[ \t]+/g, " "))
  const normalized = text
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  return normalized || null
}

/**
 * True when the response is a real advert pagerather than the provider's JS
 * challenge/interstitial (a small eval-packed script with none of the advert
 * anchors). Never treat a challenge page as "job not found".
 */
export function looksLikeAdvertPage(html: string): boolean {
  return /j-advert__title|id="job-description"|j-advert-details__table-header/.test(html)
}

/** Parse a single job detail page (embedded JS object first, HTML fallbacks). */
export function parseJobDetail(html: string, ref: string): JobDetail {
  const rec = extractJobRecord(html)

  const title =
    strField(rec, "title") ??
    (() => {
      const h1 = html.match(
        /<h1[^>]*class="[^"]*j-advert__title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i,
      )
      return h1 ? clean(h1[1]) || null : null
    })()

  const company =
    strField(rec, "employer_name") ??
    (() => {
      const h3 = html.match(
        /<h3[^>]*class="[^"]*j-advert__employer[^"]*"[^>]*>([\s\S]*?)<\/h3>/i,
      )
      if (!h3) return null
      // "<b><span>Uni</span></b> - Dept" — company is the <b> text.
      const b = h3[1].match(/<b[^>]*>([\s\S]*?)<\/b>/i)
      return clean(b ? b[1] : h3[1]) || null
    })()

  // Meta table: Location / Salary / Hours / Contract / Placed On / Closes.
  const meta: Record<string, string> = {}
  const rowRe =
    /<th[^>]*class="[^"]*j-advert-details__table-header[^"]*"[^>]*>\s*([^<]*?)\s*<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/gi
  let rm: RegExpExecArray | null
  while ((rm = rowRe.exec(html)) !== null) {
    meta[rm[1].trim().replace(/:$/, "").toLowerCase()] = clean(rm[2])
  }

  const salary = strField(rec, "salary_min")
    ? [strField(rec, "salary_min"), strField(rec, "salary_max")]
        .filter(Boolean)
        .join(" - ")
    : (meta["funding amount"] || meta["salary"] || null)

  const description =
    (rec && typeof rec["advert_text"] === "string" && rec["advert_text"]
      ? descriptionToText(rec["advert_text"])
      : null) ??
    (() => {
      const d = html.match(/<div[^>]*id="job-description"[^>]*>([\s\S]*?)<\/div>\s*<(?:div|footer)/i)
      if (!d) {
        // Fallback: depth-scan the description div.
        const open = html.match(/<div[^>]*id="job-description"[^>]*>/i)
        if (!open || open.index === undefined) return null
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
        return descriptionToText(html.slice(open.index + open[0].length, i - 6))
      }
      return descriptionToText(d[1])
    })()

  const applyMatch = html.match(
    /<a[^>]*href="([^"]+)"[^>]*>\s*<div[^>]*id="job-apply-button"/i,
  )
  const applyUrl =
    strField(rec, "apply_url") ?? (applyMatch ? resolveHref(applyMatch[1]) : null)

  // Contract/hours: meta table first, JS object after.
  const contract =
    meta["contract"] ||
    (rec && typeof rec["contract"] === "string" && rec["contract"].trim()
      ? rec["contract"].trim()
      : null) ||
    null
  const hours =
    meta["hours"] ||
    (rec && typeof rec["hours"] === "string" && rec["hours"].trim()
      ? rec["hours"].trim()
      : null) ||
    null
  const employmentType = [contract, hours].filter(Boolean).join(" / ") || null

  const advertId =
    rec && (typeof rec["advert_id"] === "string" || typeof rec["advert_id"] === "number")
      ? String(rec["advert_id"])
      : null

  return {
    id: (strField(rec, "reference") || ref).toUpperCase(),
    advertId,
    title: title || "(untitled)",
    company,
    location: meta["location"] || strField(rec, "location"),
    date: meta["placed on"] || strField(rec, "go_live_date"),
    deadline: meta["closes"] || strField(rec, "closing_date"),
    salary,
    employmentType,
    url: `${SITE_ORIGIN}/job/${strField(rec, "reference") || ref}/${strField(rec, "title_uri_path") ? strField(rec, "title_uri_path") + "/" : ""}`,
    applyUrl,
    description,
  }
}
