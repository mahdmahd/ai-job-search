// Data source: EURAXESS public job search (European Commission, Drupal + CloudFront).
// No authentication required. Search returns an HTML list of job cards; detail
// returns a single job's HTML — but only when EURAXESS decides to serve it to a
// non-browser client (it 307-redirects /jobs/<id> to /jobs/search in some
// conditions), so detail parsing degrades to a documented DETAIL_BLOCKED error.
// We parse both with regex (chunked per card, so one malformed card cannot break
// the rest) — zero runtime dependencies.

export const BASE_URL = "https://euraxess.ec.europa.eu"
export const SEARCH_URL = `${BASE_URL}/jobs/search`
export const DETAIL_URL = `${BASE_URL}/jobs`

export const RESULT_KEYS = [
  "id",
  "title",
  "company",
  "location",
  "date",
  "url",
  "deadline",
  "snippet",
] as const

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA = "Mozilla/5.0 (compatible; euraxess-cli/1.0)"

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
      signal: AbortSignal.timeout(20000),
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
  deadline: string | null
  snippet: string | null
}

export interface JobDetail {
  id: string
  title: string
  company: string | null
  location: string | null
  date: string | null
  url: string
  deadline: string | null
  description: string | null
  department: string | null
  researchField: string | null
  researcherProfile: string | null
  positions: string | null
  contractType: string | null
  jobStatus: string | null
  country: string | null
  workLocations: string | null
  applyEmail: string | null
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
    // Numeric character references: decimal (&#233;) and hexadecimal (&#xE9;).
    .replace(/&#(\d+);/g, (_, dec) => numericEntity(parseInt(dec, 10)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, hex) => numericEntity(parseInt(hex, 16)))
    .replace(/&nbsp;/g, " ")
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

function clean(html: string): string {
  return decodeHtmlEntities(stripTags(html))
}

/** Clean while keeping paragraph/line breaks as newlines. */
function cleanWithBreaks(html: string): string {
  const withBreaks = html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|ul|ol|div|h\d|tr|table)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
  const text = decodeHtmlEntities(withBreaks)
    .split("\n")
    .map((line) => line.replace(/[^\S\n]+/g, " ").trim())
    .filter((line) => line.length > 0)
    .join("\n")
  return text.replace(/\n{3,}/g, "\n\n").trim()
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
 * Extract the HTML of a named detail section: from after `<h2 id="<id>">...</h2>`
 * (heading text excluded) up to the next `<h2 id="...">` (or end of document).
 * Detail pages are flat heading sections, so splitting on the next heading
 * anchor is sufficient.
 */
function extractSection(html: string, id: string): string | null {
  const openRe = new RegExp(`<h2[^>]*id="${id}"[^>]*>([\\s\\S]*?)</h2>`, "i")
  const open = openRe.exec(html)
  if (!open) return null
  const start = open.index + open[0].length
  const next = /<h2[^>]*id="/i.exec(html.slice(start))
  const end = next ? start + next.index : html.length
  return html.slice(start, end)
}

/**
 * Parse the search response: a flat list of <article class="ecl-content-item">
 * job cards. We split on the article tag and parse each chunk independently so
 * one malformed card cannot break the rest.
 */
export function parseJobCards(html: string): JobCard[] {
  const results: JobCard[] = []
  const chunks = html.split(/<article\b/i).slice(1)

  for (const rawChunk of chunks) {
    if (!/ecl-content-item/i.test(rawChunk)) continue
    const end = rawChunk.indexOf("</article>")
    const card = end === -1 ? rawChunk : rawChunk.slice(0, end)

    // Title + id: the card's <h3> holds the anchor to /jobs/<id>; the visible
    // title text sits in an inner <span>. clean() strips the anchor/span tags.
    const titleBlock = card.match(
      /class="ecl-content-block__title"[^>]*>([\s\S]*?)<\/h3>/i,
    )
    if (!titleBlock) continue
    const href = titleBlock[1].match(/href="[^"]*\/jobs\/(\d+)[^"]*"/i)
    if (!href) continue
    const id = href[1]
    const title = clean(titleBlock[1])
    if (!title) continue

    // Primary meta: first <li> is the organisation (usually an <a>), a later
    // <li> reads "Posted on: 13 October 2026" (kept verbatim).
    let company: string | null = null
    let date: string | null = null
    const meta = card.match(
      /class="ecl-content-block__primary-meta-container"[^>]*>([\s\S]*?)<\/ul>/i,
    )
    if (meta) {
      const items = meta[1].split(/<li\b/i).slice(1)
      if (items.length > 0) {
        // Each split item starts with the <li> attributes up to the first ">",
        // then the element's content up to </li>.
        const firstLi = items[0].match(/>([\s\S]*?)(?:<\/li>|$)/i)
        company = clean(firstLi ? firstLi[1] : "") || null
      }
      const posted = meta[1].match(/Posted\s+on:\s*([^<]*\d{4})/i)
      if (posted) date = posted[1].trim()
    }

    // Location: the id-Work-Locations block's sibling .ecl-text-standard text,
    // e.g. "Number of offers: 1, Netherlands, TU Delft, 2628 CD, Delft".
    const loc = card.match(
      /id-Work-Locations[\s\S]*?class="ecl-text-standard[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    )
    const location = loc ? clean(loc[1]) || null : null

    // Deadline: the id-Application-Deadline block's <time datetime="..."> ISO
    // attribute. Some cards genuinely have no deadline — null, not an error.
    const dl = card.match(
      /id-Application-Deadline[\s\S]*?<time[^>]*datetime="([^"]+)"/i,
    )
    const deadline = dl ? dl[1] : null

    // Snippet: the card's short description block.
    const descHtml = extractDivContent(card, "ecl-content-block__description")
    const snippet = descHtml ? clean(descHtml) || null : null

    results.push({
      id,
      title,
      company,
      location,
      date,
      url: `${DETAIL_URL}/${id}`,
      deadline,
      snippet,
    })
  }

  return results
}

/**
 * Approximate total result count from the pagination footer: EURAXESS pages at
 * a fixed 10 cards per page, and the last-page link reads ?page=<last>. The
 * exact total is not rendered anywhere on the page, so this is lastPage * 10
 * (accurate up to 9). Returns null when no pager is present.
 */
export function parseTotalCount(html: string): number | null {
  const m = html.match(
    /ecl-pagination__item--last[\s\S]*?href="[^"]*[?&]page=(\d+)"/i,
  )
  if (!m) return null
  const last = parseInt(m[1], 10)
  return Number.isFinite(last) && last > 0 ? last * 10 : null
}

/**
 * Parse a job detail page. Returns null when the response carries no job
 * content — which is how EURAXESS's redirect-to-search degradation shows up
 * (no job-information/offer-description markup on the body) — so callers can
 * emit DETAIL_BLOCKED instead of fabricating empty fields.
 */
export function parseJobDetail(html: string, id: string): JobDetail | null {
  const infoSection = extractSection(html, "job-information")
  const descSection = extractSection(html, "offer-description")
  if (!infoSection && !descSection) return null

  // Title: the header card's <h1 class="ecl-content-block__title">.
  const h1 = html.match(
    /<h1[^>]*class="[^"]*ecl-content-block__title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i,
  )
  const title = h1 ? clean(h1[1]) : "(untitled)"

  // Job Information section: dt/dd pairs in the description list.
  const info: Record<string, string> = {}
  if (infoSection) {
    const pairRe = /<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/gi
    let pm: RegExpExecArray | null
    while ((pm = pairRe.exec(infoSection)) !== null) {
      info[clean(pm[1]).toLowerCase()] = clean(pm[2])
    }
  }

  // Deadline: prefer the ISO datetime attribute from the Application Deadline
  // row; fall back to the cleaned dd text.
  let deadline: string | null = null
  if (infoSection) {
    const dt = infoSection.match(
      /Application Deadline[\s\S]*?<time[^>]*datetime="([^"]+)"/i,
    )
    if (dt) {
      deadline = dt[1]
    } else if (info["application deadline"]) {
      deadline = info["application deadline"]
    }
  }

  // Offer Description: the section between the offer-description heading and
  // the next h2, with paragraph breaks preserved.
  const description = descSection ? cleanWithBreaks(descSection) || null : null

  // Posted date: the small meta line above the Job Information heading.
  const posted = html.match(
    /ecl-content-item__meta[\s\S]*?ecl-u-mt-xs[^>]*>\s*([0-9]{1,2}\s+[A-Za-z]{3,}\s+[0-9]{4})/,
  )
  const date = posted ? posted[1] : null

  // Work Location(s) section text (verbose — kept whole as a separate field).
  const wlSection = extractSection(html, "work-locations")
  const workLocations = wlSection ? clean(wlSection) || null : null

  // Apply link: the CTA's mailto: href (address only, subject stripped).
  const mail = html.match(/href="mailto:([^?"']+)/i)
  const applyEmail = mail ? decodeHtmlEntities(mail[1]) : null

  return {
    id,
    title,
    company: info["organisation/company"] ?? null,
    location: info["country"] ?? null,
    date,
    url: `${DETAIL_URL}/${id}`,
    deadline,
    description,
    department: info["department"] ?? null,
    researchField: info["research field"] ?? null,
    researcherProfile: info["researcher profile"] ?? null,
    positions: info["positions"] ?? null,
    contractType: info["type of contract"] ?? null,
    jobStatus: info["job status"] ?? null,
    country: info["country"] ?? null,
    workLocations,
    applyEmail,
  }
}
