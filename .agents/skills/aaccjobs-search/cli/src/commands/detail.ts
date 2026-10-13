import {
  SITE_ORIGIN,
  extractJobPosting,
  fetchText,
  parseJobDetail,
  writeError,
} from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

const AACC_HOST = /(^|\.)jobs\.aacc\.nche\.edu$/i

/**
 * Accept a raw numeric job ID, a /jobs/{id}[-{slug}] path, or a full AACC Jobs
 * URL (with or without scheme). A URL on any other host is rejected before any
 * request: taking digits out of an arbitrary URL would fetch an unrelated job
 * page and print it with exit 0. Host and path are read through real URL
 * parsing, so look-alike hosts and userinfo tricks fall on the reject side
 * too.
 *
 * NOTE: a bare id fetches /jobs/{id} directly and follows the slug redirect;
 * the returned url field carries the canonical URL.
 */
export function normalizeId(input: string): string | null {
  const trimmed = input.trim()
  if (/^\d+$/.test(trimmed)) return trimmed

  const hasScheme = /^https?:\/\//i.test(trimmed)
  if (hasScheme || /^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(trimmed)) {
    let parsed: URL
    try {
      parsed = new URL(hasScheme ? trimmed : `https://${trimmed}`)
    } catch {
      return null
    }
    if (!AACC_HOST.test(parsed.hostname)) return null
    // {id} may be followed by a slug joined with "-" (jobboard.io style).
    const m = parsed.pathname.match(/^\/jobs\/(\d+)(?:[-\/]|$)/)
    return m ? m[1] : null
  }
  return null
}

/**
 * Resolve the caller's input to a fetchable URL. A full /jobs/{id}-{slug} URL
 * is fetched as given; a bare id fetches /jobs/{id}, letting the server
 * redirect to the slugged canonical URL.
 */
export function resolveFetchUrl(input: string): string | null {
  const id = normalizeId(input)
  if (!id) return null
  const trimmed = input.trim()
  const hasScheme = /^https?:\/\//i.test(trimmed)
  if (hasScheme || /^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(trimmed)) {
    try {
      return new URL(hasScheme ? trimmed : `https://${trimmed}`).toString()
    } catch {
      return `${SITE_ORIGIN}/jobs/${id}`
    }
  }
  return `${SITE_ORIGIN}/jobs/${id}`
}
export async function runDetail(opts: DetailOpts): Promise<number> {
  const target = resolveFetchUrl(opts.id)
  const id = normalizeId(opts.id)
  if (!target || !id) {
    writeError(`Could not parse a job ID from "${opts.id}"`, "BAD_ID")
    return 1
  }
  try {
    const { body: html, url } = await fetchText(target)
    if (!html) {
      writeError("Job not found", "NOT_FOUND")
      return 1
    }
    const fetchedId = url.match(/\/jobs\/(\d+)/)?.[1]
    if (fetchedId && fetchedId !== id) {
      // Redirected to a different posting: the requested job is gone
      // (expired/invalid ids collapse onto the homepage on this platform).
      writeError("Job not found", "NOT_FOUND")
      return 1
    }
    // A non-job page has no JobPosting JSON-LD (homepage, search, category
    // pages). A page without it is not a job — never print page chrome as a
    // result with exit 0.
    if (!extractJobPosting(html)) {
      writeError("Job not found", "NOT_FOUND")
      return 1
    }
    const job = parseJobDetail(html, id, url)

    if (opts.format === "plain") {
      const lines = [
        job.title,
        `${job.company || "—"} · ${job.location || "—"}`,
        "",
        job.date ? `Posted: ${job.date}` : "",
        job.deadline ? `Deadline: ${job.deadline}` : "",
        job.employmentType ? `Employment: ${job.employmentType}` : "",
        "",
        job.description || "(no description)",
        "",
        `URL: ${job.url}`,
        job.applyUrl ? `Apply: ${job.applyUrl}` : "",
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
