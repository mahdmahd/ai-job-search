import {
  SITE_ORIGIN,
  htmlFetch,
  looksLikeAdvertPage,
  parseJobDetail,
  refFromUrl,
  writeError,
} from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

const JOBSACUK_HOST = /(^|\.)jobs\.ac\.uk$/i

export interface NormalizedDetail {
  kind: "ref" | "advert"
  value: string
}

/**
 * Accept a REF (DSL474), a full jobs.ac.uk /job/REF/slug URL (any jobs.ac.uk
 * host, with or without scheme), a bare /job/REF path, or the numeric
 * advert-id from search results. A URL on any other host is rejected before
 * any request: taking a REF-looking token out of an arbitrary URL would fetch
 * an unrelated advert and print it with exit 0. Host and path go through real
 * URL parsing, so look-alike hosts (jobs.ac.uk.evil.io) and userinfo tricks
 * (jobs.ac.uk@evil.io) fall on the reject side too.
 */
export function normalizeId(input: string): NormalizedDetail | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  if (/^\d+$/.test(trimmed)) return { kind: "advert", value: trimmed }

  const hasScheme = /^https?:\/\//i.test(trimmed)
  if (trimmed.startsWith("/job/")) {
    const ref = refFromUrl(trimmed)
    return ref ? { kind: "ref", value: ref } : null
  }
  if (hasScheme || /^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(trimmed)) {
    let parsed: URL
    try {
      parsed = new URL(hasScheme ? trimmed : `https://${trimmed}`)
    } catch {
      return null
    }
    if (!JOBSACUK_HOST.test(parsed.hostname)) return null
    const ref = refFromUrl(parsed.pathname)
    return ref ? { kind: "ref", value: ref } : null
  }

  // A bare REF such as DSL474.
  const ref = /^[A-Za-z0-9]{2,16}$/.test(trimmed) ? trimmed : null
  return ref ? { kind: "ref", value: ref } : null
}

/**
 * Resolve a numeric advert-id to its REF via the search page (the advert id
 * is not part of the detail URL scheme). The portal's search form has no
 * advert-id filter, so we scan the newest-first default listing only when the
 * direct search on the id itself comes up empty.
 */
async function refFromAdvertId(advertId: string): Promise<string | null> {
  const direct = await htmlFetch(
    `${SITE_ORIGIN}/search/?keywords=${encodeURIComponent(advertId)}&pageSize=25&startIndex=1`,
    SITE_ORIGIN + "/",
  )
  const hit = direct.match(
    new RegExp(`data-advert-id="${advertId}"[\\s\\S]{0,2000}?href="(\\/job\\/[A-Za-z0-9]+\\/)`),
  )
  if (hit) return refFromUrl(hit[1])
  return null
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const norm = normalizeId(opts.id)
  if (!norm) {
    writeError(`Could not parse a job REF or advert id from "${opts.id}"`, "BAD_ID")
    return 1
  }
  try {
    let ref = norm.kind === "ref" ? norm.value : await refFromAdvertId(norm.value)
    if (!ref) {
      writeError(
        norm.kind === "advert"
          ? `No live advert found for advert id "${norm.value}"`
          : `No live advert found for REF "${norm.value}"`,
        "NOT_FOUND",
      )
      return 1
    }
    // REF-only works: /job/DSL474 redirects to the slugged canonical URL.
    const html = await htmlFetch(`${SITE_ORIGIN}/job/${ref}`, SITE_ORIGIN + "/search/")
    if (!html) {
      writeError(`No live advert found for REF "${ref}"`, "NOT_FOUND")
      return 1
    }
    if (!looksLikeAdvertPage(html)) {
      writeError(
        "detail page returned no advert markup — the portal may be challenging this client; back off and retry later, never try to solve challenges",
        "BLOCKED_CHALLENGE",
      )
      return 1
    }
    const job = parseJobDetail(html, ref)

    if (opts.format === "plain") {
      const lines = [
        job.title,
        `${job.company || "—"} · ${job.location || "—"}`,
        "",
        job.date ? `Placed: ${job.date}` : "",
        job.deadline ? `Deadline: ${job.deadline}` : "",
        job.salary ? `Salary: ${job.salary}` : "",
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
