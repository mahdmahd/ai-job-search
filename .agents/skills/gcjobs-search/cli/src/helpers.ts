// Data source: GC Jobs / Emplois GC — the Public Service Commission of Canada's
// recruitment system (PSRS) at emploisfp-psjobs.cfp-psc.gc.ca. This is where every
// federal public service job open to the public is advertised.
//
// The site is a stateful server-rendered Java application, not an API. Three things
// follow from that, and they shape this whole file:
//
//   1. Every request needs a JSESSIONID cookie, and the listing only renders after a
//      priming call (`ajaxSetInternalAccess=1`). Fetching the search page cold returns
//      a bilingual "Lost Connection / Connexion interrompue" stub.
//   2. Results arrive from a second request (`isSecondPartOfPage=1`) that the page's
//      own JavaScript makes; the initial HTML contains only the shell.
//   3. Submitting search *criteria* over HTTP does not survive replay — the server
//      answers 500. So this CLI pulls the full public listing (roughly 400 postings
//      across 20 pages) and filters client-side. That is more requests, but it is
//      reliable and the corpus is small enough to make it cheap.

export type Lang = "en" | "fr"

export const ORIGIN = "https://emploisfp-psjobs.cfp-psc.gc.ca"
export const BASE = `${ORIGIN}/psrs-srfp/applicant`

/** The public job-search page. */
export const SEARCH_PAGE = `${BASE}/page2440`
/** The single-posting page. */
export const DETAIL_PAGE = `${BASE}/page1800`

/** GC Jobs renders 20 postings per page. */
export const PAGE_SIZE = 20

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * A minimal cookie jar.
 *
 * `fetch` does not persist cookies, and this site is useless without its
 * JSESSIONID, so we track Set-Cookie ourselves. Only the name=value pair matters
 * here — everything is same-origin and short-lived.
 */
export class Session {
  private cookies = new Map<string, string>()
  private lastRequestAt = 0
  /** Politeness delay between requests; the site publishes no robots.txt. */
  readonly delayMs: number

  constructor(delayMs = 1000) {
    this.delayMs = delayMs
  }

  private header(): string {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; ")
  }

  private absorb(response: Response): void {
    const raw =
      typeof response.headers.getSetCookie === "function"
        ? response.headers.getSetCookie()
        : ([response.headers.get("set-cookie")].filter(Boolean) as string[])
    for (const line of raw) {
      const [pair] = line.split(";")
      const index = pair.indexOf("=")
      if (index > 0) this.cookies.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim())
    }
  }

  hasSession(): boolean {
    return this.cookies.has("JSESSIONID")
  }

  /** GET with cookies, politeness delay, and backoff on 429/5xx. Returns "" on 404. */
  async get(url: string, referer?: string): Promise<string> {
    const waitFor = this.lastRequestAt + this.delayMs - Date.now()
    if (waitFor > 0) await sleep(waitFor)

    const maxRetries = 5
    let delay = 1000
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      this.lastRequestAt = Date.now()
      const response = await fetch(url, {
        headers: {
          "User-Agent": UA,
          Accept: "*/*",
          "Accept-Language": "en-CA,en;q=0.9,fr-CA;q=0.8",
          // The app is picky: without CORS-shaped fetch metadata on the
          // results request it serves the "Lost Connection" stub instead.
          "Sec-Fetch-Dest": "empty",
          "Sec-Fetch-Mode": "cors",
          "Sec-Fetch-Site": "same-origin",
          ...(this.cookies.size > 0 ? { Cookie: this.header() } : {}),
          ...(referer ? { Referer: referer } : {}),
        },
        redirect: "follow",
        signal: AbortSignal.timeout(30000),
      })
      this.absorb(response)

      if (response.status === 429 || response.status >= 500) {
        if (attempt === maxRetries) {
          throw new Error(`Request failed: ${response.status} ${response.statusText}`)
        }
        await sleep(delay + Math.floor(Math.random() * 500))
        delay = Math.min(delay * 2, 16000)
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
}

/** True when the app served its session-expired stub instead of real content. */
export function isLostConnection(html: string): boolean {
  return /Connexion interrompue|Lost Connection/i.test(html) && html.length < 6000
}

/**
 * Open a session and load page 1 of the public listing.
 *
 * The three calls are the exact sequence the site's own JavaScript performs on a
 * cold load. Dropping any of them yields the session-expired stub.
 */
export async function primeSession(session: Session, lang: Lang): Promise<string> {
  const entry = `${SEARCH_PAGE}?fromMenu=true&toggleLanguage=${lang}`

  await session.get(entry)
  if (!session.hasSession()) {
    throw new Error("GC Jobs did not issue a session cookie — the site may be unavailable")
  }
  await session.get(`${entry}&ajaxSetInternalAccess=1`, entry)
  const html = await session.get(`${entry}&isSecondPartOfPage=1&isInitialNetworkCheck=1`, entry)

  if (isLostConnection(html)) {
    throw new Error(
      "GC Jobs rejected the session (it serves a 'Lost Connection' page). The site's " +
        "request sequence may have changed — see url-reference.md.",
    )
  }
  return html
}

/** Fetch page N of the listing on an already-primed session. */
export async function fetchListingPage(
  session: Session,
  lang: Lang,
  page: number,
): Promise<string> {
  const entry = `${SEARCH_PAGE}?fromMenu=true&toggleLanguage=${lang}`
  const url =
    `${SEARCH_PAGE}?requestedPage=${page}&fromPage=1&tab=1&log=false&isSecondPartOfPage=1`
  const html = await session.get(url, entry)
  if (isLostConnection(html)) throw new Error(`GC Jobs session expired while fetching page ${page}`)
  return html
}

// ---------------------------------------------------------------------------
// HTML text helpers
// ---------------------------------------------------------------------------

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
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, dec) => numericEntity(parseInt(dec, 10)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, hex) => numericEntity(parseInt(hex, 16)))
    .replace(/&amp;/g, "&")
}

export function clean(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim()
}

export function cleanBlock(html: string): string {
  const withBreaks = html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|ul|ol|div|h\d|tr)>/gi, "\n")
  return decodeHtmlEntities(withBreaks.replace(/<[^>]+>/g, " "))
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/** Split a cell on <br> into trimmed, non-empty lines. */
function cellLines(html: string): string[] {
  return html
    .split(/<\s*br\s*\/?>/i)
    .map((part) => clean(part))
    .filter((part) => part.length > 0)
}

// ---------------------------------------------------------------------------
// Listing parsing
// ---------------------------------------------------------------------------

export interface JobCard {
  id: string
  title: string
  company: string | null
  location: string | null
  /** Contract field. GC Jobs advertises a closing date, not a posting date. */
  date: string | null
  url: string
  closingDate: string | null
  salary: string | null
  /** e.g. "English essential", "Bilingual - imperative". */
  languageRequirement: string | null
}

/**
 * Parse a listing page.
 *
 * Rows are split on `<li class="searchResult">` and parsed independently so one
 * malformed posting cannot break the page.
 */
export function parseJobCards(html: string, lang: Lang): JobCard[] {
  const results: JobCard[] = []
  const chunks = html.split(/<li class="searchResult">/).slice(1)

  for (const chunk of chunks) {
    const linkMatch = chunk.match(
      /<a[^>]*href="[^"]*page1800\?poster=(\d+)"[^>]*>([\s\S]*?)<\/a>/i,
    )
    if (!linkMatch) continue
    const id = linkMatch[1]
    const title = clean(linkMatch[2])
    if (!title) continue

    const cells = [...chunk.matchAll(/<div class="tableCell">([\s\S]*?)<\/div>/gi)].map((m) => m[1])

    // Cell 1: "Closing date: YYYY-MM-DD" / organization / location
    const left = cells[0] ? cellLines(cells[0]) : []
    const closingLine = left.find((line) => /closing date|date de fermeture/i.test(line)) ?? null
    const closingDate = closingLine
      ? (closingLine.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? closingLine.replace(/^[^:]*:\s*/, ""))
      : null
    const rest = left.filter((line) => line !== closingLine)

    // Cell 2: language requirement / salary
    const right = cells[1] ? cellLines(cells[1]) : []
    const salary = right.find((line) => /\$/.test(line)) ?? null
    const languageRequirement = right.find((line) => !/\$/.test(line)) ?? null

    results.push({
      id,
      title,
      company: rest[0] ?? null,
      location: rest[1] ?? null,
      date: closingDate,
      url: `${DETAIL_PAGE}?poster=${id}&toggleLanguage=${lang}`,
      closingDate,
      salary,
      languageRequirement,
    })
  }

  return results
}

/** Total postings open to the public, from the results tab label. */
export function parseResultCount(html: string): number | null {
  const match = html.match(
    /(?:Jobs open to the public|Emplois ouverts au public)\s*\((\d[\d,\s]*)\)/i,
  )
  if (!match) return null
  const digits = match[1].replace(/[^\d]/g, "")
  return digits ? parseInt(digits, 10) : null
}

/** Total number of listing pages, from the "N of 20" pager. */
export function parsePageCount(html: string): number | null {
  const match = html.match(/of\s+(\d+)\s*\[/i) ?? html.match(/de\s+(\d+)\s*\[/i)
  if (match) return parseInt(match[1], 10)
  const pageLinks = [...html.matchAll(/requestedPage=(\d+)/g)].map((m) => parseInt(m[1], 10))
  return pageLinks.length > 0 ? Math.max(...pageLinks) : null
}

// ---------------------------------------------------------------------------
// Client-side filtering
// ---------------------------------------------------------------------------

/** Fold accents so "Montreal" matches "Montréal". */
export function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
}

export interface Filters {
  query?: string
  location?: string
  org?: string
  languageRequirement?: string
}

export function matchesFilters(job: JobCard, filters: Filters): boolean {
  const contains = (haystack: string | null, needle: string): boolean =>
    haystack !== null && fold(haystack).includes(fold(needle))

  if (filters.query) {
    // Every whitespace-separated term must appear in the title.
    const terms = filters.query.split(/\s+/).filter(Boolean)
    if (!terms.every((term) => contains(job.title, term))) return false
  }
  if (filters.location && !contains(job.location, filters.location)) return false
  if (filters.org && !contains(job.company, filters.org)) return false
  if (
    filters.languageRequirement &&
    !contains(job.languageRequirement, filters.languageRequirement)
  ) {
    return false
  }
  return true
}

// ---------------------------------------------------------------------------
// Detail parsing
// ---------------------------------------------------------------------------

export interface JobDetail extends JobCard {
  description: string | null
  referenceNumber: string | null
  selectionProcessNumber: string | null
  classification: string | null
  whoCanApply: string | null
  /**
   * Some federal postings are advertised on the hiring organization's own site.
   * GC Jobs then serves a "You will leave the GC Jobs Web site" interstitial
   * instead of a poster, and the real description lives at this URL.
   */
  externalUrl: string | null
  hostedExternally: boolean
}

/** True when GC Jobs served the outbound-link interstitial instead of a poster. */
export function isExternalPosting(html: string): boolean {
  return /You will leave the GC Jobs Web site|Vous allez quitter le site Web d'Emplois GC/i.test(html)
}

/** Pull the single outbound job link out of that interstitial. */
export function parseExternalPosting(
  html: string,
  id: string,
  lang: Lang,
): { title: string; externalUrl: string | null } {
  const mainStart = html.indexOf("<main")
  const main = mainStart >= 0 ? html.slice(mainStart, html.indexOf("</main>")) : html
  const link = [...main.matchAll(/<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)]
    .map((m) => ({ url: decodeHtmlEntities(m[1]), text: clean(m[2]) }))
    .find((candidate) => candidate.text.length > 0 && !/gc jobs|emplois gc/i.test(candidate.text))

  void id
  void lang
  return { title: link?.text ?? "(external posting)", externalUrl: link?.url ?? null }
}

/** Read the value that follows a bold/heading label on the poster page. */
function labelled(html: string, labels: string[]): string | null {
  for (const label of labels) {
    const re = new RegExp(
      `>\\s*${label}\\s*<\\/(?:h\\d|strong|dt|span|b)>([\\s\\S]{0,600}?)(?=<h\\d|<dt|<strong|$)`,
      "i",
    )
    const match = html.match(re)
    if (match) {
      const value = clean(match[1])
      if (value) return value
    }
  }
  return null
}

export function parseJobDetail(html: string, id: string, lang: Lang): JobDetail {
  const url = `${DETAIL_PAGE}?poster=${id}&toggleLanguage=${lang}`

  if (isExternalPosting(html)) {
    const { title, externalUrl } = parseExternalPosting(html, id, lang)
    return {
      id,
      title,
      company: null,
      location: null,
      date: null,
      url,
      closingDate: null,
      salary: null,
      languageRequirement: null,
      description: externalUrl
        ? `This posting is advertised on the hiring organization's own site. Full description and application: ${externalUrl}`
        : "This posting is advertised outside GC Jobs, but the outbound link could not be read.",
      referenceNumber: null,
      selectionProcessNumber: null,
      classification: null,
      whoCanApply: null,
      externalUrl,
      hostedExternally: true,
    }
  }

  const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
  const title = titleMatch ? clean(titleMatch[1]) : "(untitled)"
  const text = cleanBlock(html)

  const grab = (pattern: RegExp): string | null => text.match(pattern)?.[1]?.trim() ?? null

  // The poster page is a long single column; anchor on the printed labels.
  const referenceNumber = grab(/Reference number\s*\n?\s*([A-Z0-9-]+)/i)
  const selectionProcessNumber = grab(/Selection process number\s*\n?\s*([A-Z0-9-]+)/i)
  const salary = grab(/Salary\s*\n?\s*(\$[^\n]+)/i)
  const location = grab(/\nLocation\s*\n\s*([^\n]+)/i)
  const classification = grab(/\nLevel\s*\n\s*([^\n]+)/i)
  const closingDate = grab(/Closing date:\s*([^\n]+)/i)

  // The hiring organization sits on the line directly above the closing date, in
  // the poster header. Anchoring on the <h1> instead would be wrong: the title
  // also appears as the page <title>, followed by the skip-links and site menu.
  // The "Organization information" blurb further down repeats the name wrapped in
  // a sentence, so it is only a fallback.
  const lines = text.split("\n").map((line) => line.trim())
  const closingIndex = lines.findIndex((line) => /^Closing date:/i.test(line))
  const aboveClosing =
    closingIndex > 0
      ? lines
          .slice(0, closingIndex)
          .reverse()
          .find((line) => line.length > 0 && line !== title)
      : undefined
  const company =
    aboveClosing ??
    labelled(html, ["Organization information"])
      ?.replace(/^.*please visit\s*/i, "")
      .replace(/\s*\.\s*$/, "") ??
    null

  // "Language requirements (essential for the job)" appears twice — once in the
  // page's own table of contents and once as the real heading — so anchoring on
  // the heading picks up the wrong one. The values are a closed set; match those.
  const languageRequirement =
    text.match(
      /(Bilingual\s*-\s*(?:imperative|non[- ]imperative)|English essential|French essential|English or French essential|Various language requirements[^\n]*)/i,
    )?.[1] ?? null

  // Skip the "On this page" table of contents: take the *last* occurrence of the
  // first body heading, which is the real section rather than its TOC entry.
  const headingRe = /About the position|À propos du poste/gi
  const occurrences = [...html.matchAll(headingRe)].map((m) => m.index ?? -1).filter((i) => i >= 0)
  const bodyStart = occurrences.length > 1 ? occurrences[occurrences.length - 1] : occurrences[0]
  const description =
    bodyStart !== undefined && bodyStart >= 0 ? cleanBlock(html.slice(bodyStart)) || null : null

  return {
    id,
    title,
    company,
    location,
    date: closingDate,
    url,
    closingDate,
    salary,
    languageRequirement,
    description,
    referenceNumber,
    selectionProcessNumber,
    classification,
    whoCanApply: grab(/Who can apply\s*\n\s*([^\n]+)/i),
    externalUrl: null,
    hostedExternally: false,
  }
}

/** Accept a bare poster id or any GC Jobs poster URL. */
export function normalizePosterId(input: string): string | null {
  const fromUrl = input.match(/poster=(\d+)/)
  if (fromUrl) return fromUrl[1]
  const bare = input.trim().match(/^\d{4,}$/)
  return bare ? bare[0] : null
}
