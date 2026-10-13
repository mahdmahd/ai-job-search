import { BASE, htmlFetch, parseJobDetail, writeError } from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

const CHRONICLE_JOBS_HOST = "jobs.chronicle.com"

/**
 * Accept a raw numeric job ID (e.g. "38047649") or a jobs.chronicle.com
 * job URL (with or without scheme, slug, or query string). The fetch target is
 * always rebuilt as the canonical `https://jobs.chronicle.com/job/<id>/` —
 * the site serves that form directly (verified live 2026-10-13), so the slug
 * never has to round-trip.
 *
 * A URL on any other host is rejected. Taking the first digits from ANY URL
 * would fetch whatever Chronicle posting happened to carry that number and
 * print it with exit 0; host and path are read through real URL parsing, so
 * look-alike hosts (jobs.chronicle.com.evil.io) and userinfo tricks
 * (jobs.chronicle.com@evil.io) fall on the reject side too.
 */
export function normalizeId(input: string): string | null {
  const trimmed = input.trim()
  if (/^\d{4,}$/.test(trimmed)) return trimmed

  const hasScheme = /^https?:\/\//i.test(trimmed)
  if (hasScheme || /^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(trimmed)) {
    let parsed: URL
    try {
      parsed = new URL(hasScheme ? trimmed : `https://${trimmed}`)
    } catch {
      return null
    }
    if (parsed.hostname !== CHRONICLE_JOBS_HOST) return null
    const m = parsed.pathname.match(/^\/job\/(\d+)(?:\/|$)/)
    return m ? m[1] : null
  }
  return null
}

export function jobUrlFor(id: string): string {
  return `${BASE}/job/${id}/`
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const id = normalizeId(opts.id)
  if (!id) {
    writeError(`Could not parse a Chronicle jobs ID from "${opts.id}"`, "BAD_ID")
    return 1
  }
  try {
    const html = await htmlFetch(jobUrlFor(id))
    if (!html) {
      writeError("Job not found", "NOT_FOUND")
      return 1
    }
    const job = parseJobDetail(html, id)
    if (!job) {
      writeError("No JobPosting data found on the page", "NO_JOB_DATA")
      return 1
    }

    if (opts.format === "plain") {
      const lines = [
        job.title ?? "(untitled)",
        `${job.company ?? "—"} · ${job.location ?? "—"}`,
        `Posted: ${job.date ?? "—"}`,
        `Closes: ${job.validThrough ?? "—"}`,
        `Employment: ${job.employmentType ?? "—"}`,
        `Salary: ${job.salary ?? "—"}`,
        `Apply: ${job.applyUrl ?? "—"}`,
        "",
        job.description ?? "(no description)",
        "",
        `URL: ${job.url}`,
      ]
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
