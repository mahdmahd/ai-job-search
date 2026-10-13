import { API_BASE, apiFetch, parsePostDetail, writeError } from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

/**
 * What normalizeId could extract from the user's input: a numeric post ID
 * (direct REST lookup) or a post slug (resolved via the REST ?slug= filter).
 * Exactly one of the two fields is set.
 */
export interface DetailRef {
  id?: string
  slug?: string
}

const VACANCYEDU_HOST = /(^|\.)vacancyedu\.com$/i

/**
 * Accept a raw post ID, a `?p=ID` URL, or a vacancyedu permalink
 * (/YYYY/MM/DD/slug/). Pretty permalinks do NOT contain the numeric post ID —
 * the path segments are year/month/day — so a slug URL is resolved through
 * the WP REST `?slug=` filter rather than by scraping digits out of the date.
 *
 * A URL on any other host is rejected before any request: host and path are
 * read through real URL parsing, so look-alike hosts (vacancyedu.com.evil.io)
 * and userinfo tricks (vacancyedu.com@evil.io) fall on the reject side too.
 */
export function normalizeId(input: string): DetailRef | null {
  const trimmed = input.trim()
  if (/^\d+$/.test(trimmed)) return { id: trimmed }

  const hasScheme = /^https?:\/\//i.test(trimmed)
  if (hasScheme || /^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(trimmed)) {
    let parsed: URL
    try {
      parsed = new URL(hasScheme ? trimmed : `https://${trimmed}`)
    } catch {
      return null
    }
    if (!VACANCYEDU_HOST.test(parsed.hostname)) return null
    const queryId = parsed.searchParams.get("p")
    if (queryId && /^\d+$/.test(queryId)) return { id: queryId }
    const segments = parsed.pathname.split("/").filter(Boolean)
    const tail = segments[segments.length - 1]
    if (tail && !/^\d+$/.test(tail)) {
      try {
        return { slug: decodeURIComponent(tail) }
      } catch {
        return null
      }
    }
    // A numeric-only path (/2026/10/13/) carries no post identity.
    return null
  }

  return null
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const ref = normalizeId(opts.id)
  if (!ref) {
    writeError(`Could not parse a vacancyedu post ID or permalink from "${opts.id}"`, "BAD_ID")
    return 1
  }
  try {
    const fields = "_fields=id,date,link,title,content"
    let data: unknown = null
    if (ref.id) {
      const result = await apiFetch<unknown>(`${API_BASE}/${ref.id}?${fields}`)
      data = result?.data ?? null
    } else if (ref.slug) {
      const result = await apiFetch<unknown>(
        `${API_BASE}?slug=${encodeURIComponent(ref.slug)}&${fields}`,
      )
      data =
        Array.isArray(result?.data) && (result!.data as unknown[]).length > 0
          ? (result!.data as unknown[])[0]
          : null
    }
    if (data === null || data === undefined) {
      writeError("Post not found", "NOT_FOUND")
      return 1
    }
    const job = parsePostDetail(data)
    if (!job) {
      writeError("Post not found", "NOT_FOUND")
      return 1
    }

    if (opts.format === "plain") {
      const lines = [
        job.title,
        `${job.company || "—"} · ${job.location || "—"}`,
        `Posted: ${job.date || "—"}`,
        "",
        ...(job.deadlines.length > 0 ? job.deadlines.map((d) => `Deadline: ${d}`) : []),
        ...(job.applyLinks.length > 0
          ? ["", "Apply links:", ...job.applyLinks.map((l) => `  ${l}`)]
          : []),
        "",
        job.description || "(no description)",
        "",
        `URL: ${job.url || "—"}`,
      ].filter((l) => l !== "")
      process.stdout.write(lines.join("\n") + "\n")
    } else {
      process.stdout.write(JSON.stringify(job, null, 2) + "\n")
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "DETAIL_FAILED")
    return 1
  }
}
