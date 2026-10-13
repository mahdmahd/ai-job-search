// Data source: profellow.com's public WordPress pages. The WP `?s=` search
// endpoint is blocked by CleanTalk anti-spam ("Sender blacklisted"), so the
// search command fetches the structured /open-calls/ archive (paginated via
// /open-calls/page/N/) and filters client-side over each card's title,
// excerpt, and eligibility text. No authentication; robots.txt allows both
// paths. We parse both with regex (shallow stable markup; no DOM parser).

export const ARCHIVE_BASE = "https://www.profellow.com/open-calls"
export const DETAIL_BASE = "https://www.profellow.com/open-call"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA = "Mozilla/5.0 (compatible; profellow-cli/1.0)"

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

export interface OpenCall {
  id: string // the detail slug (no numeric id exists on cards)
  title: string
  company: string | null // "Sponsored by X" host, when the card carries one
  location: string | null // cards carry no location — always null
  date: string | null // card deadline prose ("October 30, 2026"), else null
  url: string
}

export interface OpenCallDetail extends OpenCall {
  description: string | null
  deadline: string | null
  eligibility: string | null
  applyLinks: string[]
}

/** Convert a Unicode code point to a string (same as sibling portal CLIs). */
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
    .replace(/<\/(p|li|ul|ol|div|h\d|tr|blockquote)>/gi, "\n")
  return decodeHtmlEntities(withBreaks.replace(/<[^>]+>/g, " "))
    .replace(/[ \t]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/** Card slug out of an /open-call/<slug>/ URL. */
function slugFromUrl(url: string): string | null {
  const m = url.match(/\/open-call\/([^/?#]+)\/?(?:[?#]|$)/i)
  return m ? decodeURIComponent(m[1]) : null
}

/**
 * Parse the search/archive response: a flat list of <article class="open-call">
 * cards. We split on the article tag and parse each chunk independently so one
 * malformed card cannot break the rest. Title lives in an h2 (featured) or h4
 * (normal) carrying class open-call-content__title; the permalink doubles as
 * the only card link, the deadline as `.open-call-deadline` prose, and the
 * host ("company") as the optional `Sponsored by X` div.
 */
export function parseOpenCallCards(html: string): OpenCall[] {
  const results: OpenCall[] = []
  const chunks = html.split(/<article\s+class="open-call">/i).slice(1)

  for (const chunk of chunks) {
    try {
      const titleMatch = chunk.match(
        /<h[24][^>]*class="[^"]*open-call-content__title[^"]*"[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i,
      )
      if (!titleMatch) continue
      const url = decodeHtmlEntities(titleMatch[1]).trim()
      const slug = slugFromUrl(url)
      if (!slug) continue
      const title = clean(titleMatch[2])
      if (!title) continue

      // Host: "Sponsored by X" (featured cards only); strip the prefix.
      let company: string | null = null
      const sponsor = chunk.match(/class="open-call__sponsor[^"]*"[^>]*>\s*([\s\S]*?)</i)
      if (sponsor) {
        const raw = clean(sponsor[1]).replace(/^Sponsored by\s+/i, "").trim()
        company = raw || null
      }

      // Deadline prose: "Deadline: October 30, 2026" — keep the date part.
      let date: string | null = null
      const deadline = chunk.match(/class="open-call-deadline"[^>]*>([\s\S]*?)<\/div>/i)
      if (deadline) {
        const text = clean(deadline[1]).replace(/^Deadline:\s*/i, "").trim()
        date = text || null
      }

      results.push({ id: slug, title, company, location: null, date, url })
    } catch {
      // A single malformed card must never break the rest of the page.
      continue
    }
  }

  return results
}

/**
 * Client-side keyword filter over a card's title, excerpt, and eligibility
 * text (the archive has no server-side keyword parameter). All query words
 * must appear somewhere in the haystack (AND semantics), case-insensitive.
 */
export function matchesQuery(
  title: string,
  cardChunk: string | null,
  query: string,
): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const haystack = (
    title +
    " " +
    (cardChunk ? clean(cardChunk.slice(0, 4000)) : "")
  ).toLowerCase()
  return words.every((w) => haystack.includes(w))
}

/**
 * Split the archive HTML into per-card chunks aligned with parseOpenCallCards
 * (for the client-side keyword filter). Index i of the returned chunks
 * corresponds to card i of parseOpenCallCards's output — EXCEPT chunks that
 * fail to parse produce no card, so callers must filter by re-matching the
 * title instead of relying on positional alignment. Prefer filterCards().
 */
export function splitCardChunks(html: string): string[] {
  return html.split(/<article\s+class="open-call">/i).slice(1)
}

/**
 * Keyword-filter parsed cards against their own raw chunks. Cards whose
 * chunk carries no query words are dropped. This keeps the parse/filter pair
 * consistent without trusting positional alignment.
 */
export function filterCards(
  html: string,
  query: string,
  cards?: OpenCall[],
): OpenCall[] {
  const parsed = cards ?? parseOpenCallCards(html)
  const chunks = splitCardChunks(html)
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return parsed
  return parsed.filter((card) => {
    const chunk = chunks.find((c) => c.includes(card.url) || c.includes(card.id))
    const haystack = (
      card.title +
      " " +
      (chunk ? clean(chunk.slice(0, 4000)) : "")
    ).toLowerCase()
    return words.every((w) => haystack.includes(w))
  })
}

/** Parse a single /open-call/<slug>/ detail page. */
export function parseOpenCallDetail(html: string, slug: string): OpenCallDetail {
  const titleMatch = html.match(
    /<h1[^>]*class="[^"]*entry-title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i,
  )
  const title = titleMatch ? clean(titleMatch[1]) : "(untitled)"

  // Sponsor line near the body ("Sponsored by X").
  let company: string | null = null
  const sponsor = html.match(/class="single-post__sponsor"[^>]*>([\s\S]*?)<\/div>/i)
  if (sponsor) {
    const raw = clean(sponsor[1]).replace(/^Sponsored by\s+/i, "").trim()
    company = raw || null
  }

  // Deadline from the meta block.
  let deadline: string | null = null
  const metaDeadline = html.match(/class="open-call-meta__deadline"[^>]*>([\s\S]*?)<\/div>/i)
  if (metaDeadline) {
    deadline = clean(metaDeadline[1]).trim() || null
  }

  // Body: Program Benefits / Eligibility / How to Apply / deadlines.
  let description: string | null = null
  let eligibility: string | null = null
  const body = html.match(/<div class="single-post__body">([\s\S]*?)<\/div>\s*<div class="open-call__meta open-call__meta--bottom"/i)
    ?? html.match(/<div class="single-post__body">([\s\S]*)/i)
  if (body) {
    const bodyHtml = body[1]
    description = htmlToText(bodyHtml) || null
    // Eligibility section: from the Eligibility heading to the next h2.
    const elig = bodyHtml.match(/<h2[^>]*>\s*Eligibility\s*<\/h2>([\s\S]*?)(?:<h2|$)/i)
    if (elig) eligibility = htmlToText(elig[1]) || null
  }

  // Outbound apply links from the meta CTA buttons (btn--primary Apply links).
  const applyLinks: string[] = []
  const ctaRe = /<a[^>]*class="[^"]*btn--primary[^"]*"[^>]*href="(https?:\/\/[^"]+)"[^>]*>/gi
  let m: RegExpExecArray | null
  while ((m = ctaRe.exec(html)) !== null) {
    const href = decodeHtmlEntities(m[1])
    if (!applyLinks.includes(href)) applyLinks.push(href)
  }

  return {
    id: slug,
    title,
    company,
    location: null,
    date: deadline,
    url: `${DETAIL_BASE}/${slug}/`,
    description,
    deadline,
    eligibility,
    applyLinks,
  }
}
