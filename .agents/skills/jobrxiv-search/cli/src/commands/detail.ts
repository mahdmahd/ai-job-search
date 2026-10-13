import { SITE_ORIGIN, htmlFetch, parseJobDetail, writeError } from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

const JOBRXIV_HOST = /(^|\.)jobrxiv\.org$/i

/**
 * Accept a raw numeric WP post ID (from `search` results), a `?p=ID` /
 * `?post_type=job_listing&p=ID` URL (the permalink shape expired postings
 * fall back to), a `/job/{slug}/` permalink (any jobrxiv.org host, with or
 * without scheme), or the full slug itself.
 *
 * A URL on any other host is rejected before any request: host and path
 * are read through real URL parsing, so look-alike hosts
 * (jobrxiv.org.evil.io) and userinfo tricks (jobrxiv.org@evil.io) fall on
 * the reject side too.
 *
 * Numeric IDs resolve via `GET /?post_type=job_listing&p=<id>` (WordPress
 * redirects to the canonical permalink, expired postings included — the
 * bare `?p=<id>` form 301s to the homepage on this install, so the post
 * type must be spelled out); slugs resolve via `GET /job/<slug>/`.
 */
export interface DetailRef {
  kind: "id" | "url"
  value: string
}

export function normalizeId(input: string): DetailRef | null {
  const trimmed = input.trim()
  if (/^\d+$/.test(trimmed)) return { kind: "id", value: trimmed }

  const hasScheme = /^https?:\/\//i.test(trimmed)
  const looksLikeUrl = hasScheme || /^[a-z0-9.-]+\.[a-z]{2,}(\/|$|\?)/i.test(trimmed)
  if (looksLikeUrl) {
    let parsed: URL
    try {
      parsed = new URL(hasScheme ? trimmed : `https://${trimmed}`)
    } catch {
      return null
    }
    if (!JOBRXIV_HOST.test(parsed.hostname)) return null
    const queryId = parsed.searchParams.get("p")
    if (queryId && /^\d+$/.test(queryId)) return { kind: "id", value: queryId }
    const segments = parsed.pathname.split("/").filter(Boolean)
    if (segments[0] === "job" && segments[1]) {
      try {
        return { kind: "url", value: `${SITE_ORIGIN}/job/${decodeURIComponent(segments[1])}/` }
      } catch {
        return null
      }
    }
    return null
  }

  // A bare slug ("some-phd-position" or "some-position-27778-x").
  if (/^[a-z0-9][a-z0-9-]*[a-z0-9]$/i.test(trimmed) && trimmed.includes("-")) {
    return { kind: "url", value: `${SITE_ORIGIN}/job/${trimmed}/` }
  }
  return null
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const ref = normalizeId(opts.id)
  if (!ref) {
    writeError(`Could not parse a jobRxiv job ID or /job/ URL from "${opts.id}"`, "BAD_ID")
    return 1
  }
  try {
    const url = ref.kind === "id" ? `${SITE_ORIGIN}/?post_type=job_listing&p=${ref.value}` : ref.value
    const html = await htmlFetch(url)
    if (!html) {
      writeError("Job not found", "NOT_FOUND")
      return 1
    }
    const id = ref.kind === "id" ? ref.value : opts.id.trim()
    const canonical = html.match(/<link\s[^>]*rel="canonical"[^>]*href="([^"]+)"/i)?.[1]
    const job = parseJobDetail(html, id, canonical ?? url)

    if (opts.format === "plain") {
      const lines = [
        job.title,
        `${job.company || "—"} · ${job.location || "—"}`,
        `Posted: ${job.date || "—"}`,
        job.type ? `Type: ${job.type}` : "",
        `Status: ${job.isActive ? "ACTIVE" : "CLOSED / EXPIRED"}`,
        job.applyUrl ? `Apply: ${job.applyUrl}` : "",
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
