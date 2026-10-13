// Data source: jobRxiv's public WP Job Manager listing endpoint
// (/jm-ajax/get_listings/) and public job detail pages (/job/{slug}/).
// No authentication required; robots.txt allows admin-ajax.php and places no
// restriction on the listing or job detail paths. Search returns JSON whose
// `html` field is a chunk of Workscout `<li class="... job_listing ...">`
// cards; detail returns a single job's HTML. We parse both with regex (the
// markup is shallow; a DOM library is unnecessary and would add a runtime
// dependency this skill does not need).

export const LISTINGS_URL = "https://jobrxiv.org/jm-ajax/get_listings/"
export const SITE_ORIGIN = "https://jobrxiv.org"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA = "Mozilla/5.0 (compatible; jobrxiv-cli/1.0)"

/**
 * Fetch a URL as text with exponential backoff on 429/5xx. Returns ""
 * on a 404 (never a crash — the detail command surfaces this as
 * NOT_FOUND). Throws on other non-OK statuses and network failures.
 */
export async function textFetch(url: string, accept: string): Promise<string> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: accept,
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

/** Fetch an HTML page (search fallback / detail). */
export async function htmlFetch(url: string): Promise<string> {
  return textFetch(url, "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
}

/**
 * Fetch the WP Job Manager get_listings JSON envelope. Returns the raw
 * parsed JSON (the caller pulls `html`, `max_num_pages`, and `post_count`
 * out of it) or null on a 404. Throws on invalid JSON.
 */
export async function listingsFetch(url: string): Promise<Record<string, unknown> | null> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "application/json",
        "Accept-Language": "en-US,en;q=0.9",
        "X-Requested-With": "XMLHttpRequest",
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
    try {
      return (await response.json()) as Record<string, unknown>
    } catch {
      throw new Error("Response was not valid JSON")
    }
  }
  throw new Error("Request failed after max retries")
}

export interface JobCard {
  id: string
  title: string
  company: string | null
  companyUrl: string | null
  location: string | null
  date: string | null
  url: string
  type: string | null
  salary: string | null
  description: string | null
}

export interface JobDetail extends JobCard {
  applyUrl: string | null
  isActive: boolean
}

/** Convert a Unicode code point to a string (same approach as linkedin-search). */
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
    .replace(/&#0*8230;/g, "…")
    .replace(/&#0*8211;/g, "–")
    .replace(/&#0*8212;/g, "—")
    .replace(/&#0*8216;|&#0*8217;/g, "'")
    .replace(/&#0*8220;|&#0*8221;/g, '"')
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

function clean(html: string): string {
  return decodeHtmlEntities(stripTags(html))
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
 * Next `<li`/`<li ` opening at or after `from`. Plain indexOf("<li") would
 * also match `<link>` tags; we require the following character to be a tag
 * terminator.
 */
function indexOfLi(html: string, from: number): number {
  let i = html.indexOf("<li", from)
  while (i !== -1) {
    const next = html.charAt(i + 3)
    if (next === ">" || /\s/.test(next)) return i
    i = html.indexOf("<li", i + 3)
  }
  return -1
}

/**
 * Split a get_listings `html` chunk into per-card `<li>` strings. We split
 * on the `<li ... job_listing ...>` opening tag and cut each card at the
 * matching `</li>` via tag-depth tracking, so one malformed card cannot
 * break the rest.
 */
export function splitCards(html: string): string[] {
  const cards: string[] = []
  const openRe = /<li\b[^>]*\bjob_listing\b[^>]*>/gi
  let m: RegExpExecArray | null
  while ((m = openRe.exec(html)) !== null) {
    let i = m.index + m[0].length
    let depth = 1
    while (depth > 0 && i < html.length) {
      const nextOpen = indexOfLi(html, i)
      const nextClose = html.indexOf("</li>", i)
      if (nextClose === -1) break
      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth++
        i = nextOpen + 3
      } else {
        depth--
        i = nextClose + 5
      }
    }
    if (depth === 0) {
      cards.push(html.slice(m.index, i))
      openRe.lastIndex = i
    }
  }
  return cards
}

/**
 * Numeric WP post ID out of a card's class list (`post-155928 job_listing`),
 * else null. The numeric ID is the stable identifier to pass to `detail`.
 */
export function postIdFromClass(card: string): string | null {
  const m = card.match(/post-(\d+)\s+job_listing|post-(\d+)"/)
  return m ? (m[1] ?? m[2]) : null
}

/** Numeric WP post ID out of a `?post_type=job_listing&p=153878` permalink, else null. */
function postIdFromQueryUrl(url: string): string | null {
  const m = url.match(/[?&]p=(\d+)/)
  return m ? m[1] : null
}

/**
 * Fallback ID from a pretty permalink: the numeric chunk the board embeds
 * in many slugs (e.g. `...-dublin-27778-fully-erc-funded-...` -> "27778").
 * Bare slugs without digits return null (detail then fetches by URL).
 */
export function numericFromSlug(url: string): string | null {
  const m = url.match(/-(\d{4,})(?:-|$|\/)/)
  return m ? m[1] : null
}

/**
 * Parse the get_listings response: JSON envelope -> `html` chunk -> rich
 * `<li class="... job_listing ...">` cards. Each card is parsed
 * independently so one malformed card cannot break the rest. Cards missing
 * a title or any usable URL are skipped.
 */
export function parseListingCards(raw: unknown): JobCard[] {
  if (raw === null || typeof raw !== "object") return []
  const html = (raw as Record<string, unknown>).html
  if (typeof html !== "string" || !html) return []
  const results: JobCard[] = []
  for (const card of splitCards(html)) {
    try {
      const linkMatch = card.match(/<a\s[^>]*href="([^"]+)"/i)
      if (!linkMatch) continue
      const url = decodeHtmlEntities(linkMatch[1]).replace(/&#0*38;|&amp;/g, "&")
      if (!url) continue

      const titleMatch = card.match(/<h4>([\s\S]*?)<\/h4>/i)
      let title: string | null = null
      if (titleMatch) {
        // Strip the job-type badge (<span class="job-type ...">) nested in <h4>.
        title = clean(titleMatch[1].replace(/<span\s[^>]*class="[^"]*job-type[^"]*"[^>]*>[\s\S]*?<\/span>/gi, ""))
      }
      if (!title) continue

      const companyMatch = card.match(
        /class="ws-meta-company-name"[^>]*>([\s\S]*?)<\/span>/i,
      )
      const company = companyMatch ? clean(companyMatch[1]) || null : null

      const locMatch = card.match(/class="ws-meta-job-location"[^>]*>([\s\S]*?)<\/span>/i)
      const location = locMatch ? clean(locMatch[1]) || null : null

      const dateMatch = card.match(
        /class="ws-meta-job-date"[^>]*>[\s\S]*?<time\s[^>]*datetime="([^"]+)"[^>]*>([\s\S]*?)<\/time>/i,
      )
      const date = dateMatch ? dateMatch[1].slice(0, 10) || null : null

      const typeMatch = card.match(
        /<span\s[^>]*class="[^"]*job-type[^"]*"[^>]*>([\s\S]*?)<\/span>/i,
      )
      const type = typeMatch ? clean(typeMatch[1]) || null : null

      const salaryMatch = card.match(
        /class="job-salary-range"[^>]*>([\s\S]*?)<\/span>\s*<\/div>/i,
      )
      const salary = salaryMatch
        ? clean(salaryMatch[1]) || null
        : (() => {
            // Fallback: the per-card `.ws-meta-salary` line (usually a city).
            const sm = card.match(/class="ws-meta-salary"[^>]*>([\s\S]*?)<\/span>/i)
            return sm ? clean(sm[1]) || null : null
          })()

      const descMatch = card.match(/class="listing-desc"[^>]*>([\s\S]*?)<\/div>/i)
      const description = descMatch ? clean(descMatch[1]) || null : null

      const id =
        postIdFromClass(card) ??
        postIdFromQueryUrl(url) ??
        numericFromSlug(url) ??
        url

      results.push({
        id,
        title,
        company,
        companyUrl: null,
        location,
        date,
        url,
        type,
        salary,
        description,
      })
    } catch {
      // A single malformed card must never break the rest of the page.
      continue
    }
  }
  return results
}

/**
 * Pull a total out of the get_listings envelope. `post_count` is a number
 * when present; otherwise we parse "Found N matching records" out of the
 * `showing` string. Falls back to the page's card count.
 */
export function totalFromEnvelope(raw: unknown, pageCount: number): number {
  if (raw !== null && typeof raw === "object") {
    const rec = raw as Record<string, unknown>
    if (typeof rec.post_count === "number" && Number.isFinite(rec.post_count)) {
      return rec.post_count
    }
    if (typeof rec.showing === "string") {
      const m = rec.showing.match(/Found\s+([\d,]+)\s+matching/i)
      if (m) return Number(m[1].replace(/,/g, ""))
    }
  }
  return pageCount
}

/** Max page count out of the get_listings envelope (`max_num_pages`). */
export function maxPagesFromEnvelope(raw: unknown): number | null {
  if (raw !== null && typeof raw === "object") {
    const n = (raw as Record<string, unknown>).max_num_pages
    if (typeof n === "number" && Number.isFinite(n) && n >= 1) return n
  }
  return null
}

/**
 * A posting is expired when the card carries `status-expired` in its class
 * list (WP Job Manager flips `status-publish` to `status-expired` on
 * expiry). The search endpoint returns expired postings too; callers may
 * want to flag or skip them.
 */
export function cardIsExpired(card: string): boolean {
  return /\bstatus-expired\b/.test(card)
}

/**
 * Parse a single-job detail page (`/job/{slug}/`).
 *
 * Anchors (verified live 2026-10-13):
 * - title: `#titlebar h1` (a `<span class="job-type ...">` badge is nested
 *   inside — strip it before cleaning)
 * - company: `.company-info h4 strong` (fallback: `.company_logo` alt text)
 * - date: `.job-overview` "Date Posted" `<time datetime>`
 * - location: `.job-overview` "Location" `.location` span
 * - type: first `.job-type` span in the titlebar
 * - description: `.single_job_listing .job_description`
 * - apply link: `#apply-dialog .small-dialog-content a[href]` (external URL)
 * - closed: an "expired" banner or the literal "This job has expired" text
 *   near the top of the page. Absence of the banner is absence of evidence,
 *   not proof the posting is open — isActive:true means only "no closed
 *   banner found".
 */
export function parseJobDetail(html: string, id: string, url: string): JobDetail {
  const h1 = html.match(/<div[^>]*id="titlebar"[^>]*>[\s\S]*?<h1>([\s\S]*?)<\/h1>/i)?.[1]
  const titleRaw = h1
    ? clean(h1.replace(/<span\s[^>]*class="[^"]*job-type[^"]*"[^>]*>[\s\S]*?<\/span>/gi, ""))
    : null

  const typeMatch = h1?.match(/<span\s[^>]*class="[^"]*job-type[^"]*"[^>]*>([\s\S]*?)<\/span>/i)
  const type = typeMatch ? clean(typeMatch[1]) || null : null

  const infoBlock = html.match(/class="company-info[^"]*"[^>]*>([\s\S]*?)<div class="clearfix"><\/div>/i)?.[1]
  let company: string | null = null
  let companyUrl: string | null = null
  if (infoBlock) {
    company = clean(infoBlock.match(/<h4>([\s\S]*?)<\/h4>/i)?.[1] ?? "") || null
    const site = infoBlock.match(/<a\s[^>]*class="website"[^>]*href="([^"]+)"/i)
    if (site) companyUrl = decodeHtmlEntities(site[1])
  }
  if (!company) {
    const alt = html.match(/class="company_logo"[^>]*alt="([^"]*)"/i)
    if (alt) company = decodeHtmlEntities(alt[1]).trim() || null
  }

  const overview = html.match(/class="job-overview"[^>]*>([\s\S]*?)<\/ul>/i)?.[1] ?? ""
  const dateMatch = overview.match(/Date Posted:[\s\S]*?<time\s[^>]*datetime="([^"]+)"/i)
  const date = dateMatch ? dateMatch[1].slice(0, 10) || null : null
  const locMatch = overview.match(/Location:[\s\S]*?class="location"[^>]*>([\s\S]*?)<\/span>/i)
  const location = locMatch ? clean(locMatch[1]) || null : null

  let description: string | null = null
  const descHtml = html.match(/class="single_job_listing"[^>]*>[\s\S]*?class="job_description"[^>]*>([\s\S]*?)<\/div>\s*(?:<ul class="share-post"|<div class="clearfix"|$)/i)?.[1]
  if (descHtml) {
    description = htmlToText(descHtml) || null
  }

  let applyUrl: string | null = null
  const dialog = html.match(/id="apply-dialog"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i)?.[1]
  if (dialog) {
    const links = [...dialog.matchAll(/<a\s[^>]*href="(https?:\/\/[^"]+)"/gi)]
      .map((m) => decodeHtmlEntities(m[1]))
      .filter((href) => !href.includes("jobrxiv.org"))
    if (links.length > 0) applyUrl = links[0]
  }

  // Closed-state detection, scoped above the description markup: recruiter
  // boilerplate quotes phrases like "expired", so the search stops where
  // the description begins.
  const descStart = html.search(/class="single_job_listing"/i)
  const top = descStart === -1 ? html : html.slice(0, descStart)
  const isActive = !/job-expired|this job has expired|position (has been )?filled|no longer accepting/i.test(top)

  return {
    id,
    title: titleRaw || "(untitled)",
    company,
    companyUrl,
    location,
    date,
    url,
    type,
    salary: null,
    description,
    applyUrl,
    isActive,
  }
}
