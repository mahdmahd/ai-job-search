import { JOB_PATH, SITE_ORIGIN, htmlFetch, parseJobDetail, writeError } from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

const NATURE_HOST = /(^|\.)nature\.com$/i

/**
 * Accept a raw job ID or a Nature Careers job URL (any nature.com host, with
 * or without scheme). A URL on any other host is rejected before any request:
 * taking digits out of an arbitrary URL would fetch an unrelated job page and
 * print it with exit 0. Host and path are read through real URL parsing, so
 * look-alike hosts and userinfo tricks fall on the reject side too.
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
    if (!NATURE_HOST.test(parsed.hostname)) return null
    const m = parsed.pathname.match(/\/naturecareers\/job\/(\d+)(?:\/|$)/)
    return m ? m[1] : null
  }
  return null
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const id = normalizeId(opts.id)
  if (!id) {
    writeError(`Could not parse a job ID from "${opts.id}"`, "BAD_ID")
    return 1
  }
  try {
    // Bare id works: /naturecareers/job/{id}/ answers 200 (verified live).
    // A full URL with slug is also accepted via normalizeId above.
    const html = await htmlFetch(`${SITE_ORIGIN}${JOB_PATH}${id}/`)
    if (!html) {
      writeError("Job not found", "NOT_FOUND")
      return 1
    }
    const job = parseJobDetail(html, id)

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
