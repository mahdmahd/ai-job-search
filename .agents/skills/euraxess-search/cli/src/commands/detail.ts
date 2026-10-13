import { BASE_URL, htmlFetch, parseJobDetail, writeError, type JobDetail } from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

const EURAXESS_HOST = /(^|\.)euraxess\.ec\.europa\.eu$/i

/**
 * Accept a raw numeric job ID, a /jobs/<id> path, or a full EURAXESS job URL
 * (any euraxess.ec.europa.eu host, with or without scheme). A URL on any other
 * host is rejected: a posting's own third-party apply link must never be
 * resolved against EURAXESS by its number. Host and path are read through real
 * URL parsing, so look-alike hosts (euraxess.ec.europa.eu.evil.io) and
 * userinfo tricks (euraxess.ec.europa.eu@evil.io) fall on the reject side too.
 */
export function normalizeId(input: string): string | null {
  const trimmed = input.trim()
  if (/^\d+$/.test(trimmed)) return trimmed

  const pathOnly = trimmed.match(/^\/jobs\/(\d+)\/?$/)
  if (pathOnly) return pathOnly[1]

  const hasScheme = /^https?:\/\//i.test(trimmed)
  if (hasScheme || /^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(trimmed)) {
    let parsed: URL
    try {
      parsed = new URL(hasScheme ? trimmed : `https://${trimmed}`)
    } catch {
      return null
    }
    if (!EURAXESS_HOST.test(parsed.hostname)) return null
    const path = parsed.pathname.match(/^\/jobs\/(\d+)\/?$/)
    return path ? path[1] : null
  }
  return null
}

/**
 * Fetch a single job's detail page. EURAXESS serves detail pages only
 * intermittently to non-browser clients (it can 307-redirect /jobs/<id> to
 * /jobs/search behind CloudFront); a response without job-detail markup —
 * whether a redirect landing or a stub page — yields DETAIL_BLOCKED rather
 * than fabricated empty fields. 404 yields NOT_FOUND.
 */
export async function runDetail(opts: DetailOpts): Promise<number> {
  const id = normalizeId(opts.id)
  if (!id) {
    writeError(`Could not parse a EURAXESS job ID from "${opts.id}"`, "BAD_ID")
    return 1
  }
  try {
    const html = await htmlFetch(`${BASE_URL}/jobs/${id}`)
    if (!html) {
      writeError("Job not found", "NOT_FOUND")
      return 1
    }
    const job: JobDetail | null = parseJobDetail(html, id)
    if (!job) {
      writeError(
        `EURAXESS did not serve a detail page for job ${id} to this client (it 307-redirects /jobs/<id> to /jobs/search for some non-browser requests, and serves only a stub page in others). Open https://euraxess.ec.europa.eu/jobs/${id} in a browser instead.`,
        "DETAIL_BLOCKED",
      )
      return 1
    }

    if (opts.format === "plain") {
      const lines = [
        job.title,
        `${job.company || "—"} · ${job.location || "—"} · posted: ${job.date || "—"}`,
        "",
        job.deadline ? `Deadline: ${job.deadline}` : "",
        job.positions ? `Positions: ${job.positions}` : "",
        job.researcherProfile ? `Profile: ${job.researcherProfile}` : "",
        job.researchField ? `Research field: ${job.researchField}` : "",
        job.contractType ? `Contract: ${job.contractType}` : "",
        job.jobStatus ? `Status: ${job.jobStatus}` : "",
        job.applyEmail ? `Apply: ${job.applyEmail}` : "",
        "",
        job.description || "(no description)",
        "",
        `URL: ${job.url}`,
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
