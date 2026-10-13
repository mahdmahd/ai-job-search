import { BASE_URL, htmlFetch, parseJobDetail, writeError } from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

const CONSORTIUM_HOST = /(^|\.)consortium\.lgbt$/i

/**
 * Accept a numeric post id, a consortium.lgbt /job/<slug>/ URL (absolute or
 * scheme-less), or a site-relative /job/<slug>/ path.
 *
 * A slug URL always costs one extra request: slugs are not reversible to ids,
 * so the CLI fetches the page and reports the canonical URL. A URL on any
 * other host is rejected rather than fetched.
 */
export function normalizeId(input: string): { id?: string; url?: string } | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  if (/^\d+$/.test(trimmed)) return { id: trimmed }

  // Site-relative /job/<slug>/ path on this board.
  if (/^\/job\/[^/]+\/?$/.test(trimmed)) {
    return { url: `${BASE_URL}${trimmed}` }
  }

  let parsed: URL
  try {
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
    parsed = new URL(withScheme)
  } catch {
    return null
  }
  if (!CONSORTIUM_HOST.test(parsed.hostname)) return null
  if (/^\/job\/[^/]+\/?$/.test(parsed.pathname)) {
    return { url: `${BASE_URL}${parsed.pathname}` }
  }
  return null
}

async function resolveNumericId(id: string): Promise<string | null> {
  // ?p=<id> 301-redirects to the canonical /job/<slug>/ URL.
  const response = await fetch(`${BASE_URL}/?p=${encodeURIComponent(id)}`, {
    method: "HEAD",
    headers: { "User-Agent": "Mozilla/5.0 (compatible; consortiumlgbt-cli/1.0)" },
    redirect: "follow",
    signal: AbortSignal.timeout(15000),
  })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`Request failed: ${response.status} ${response.statusText}`)
  const final = response.url
  return /\/job\/[^/]+\/?$/.test(new URL(final).pathname) ? final : null
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const parsed = normalizeId(opts.id)
  if (!parsed) {
    writeError(`Could not parse a job id or Consortium job URL from "${opts.id}"`, "BAD_ID")
    return 1
  }
  try {
    let url = parsed.url
    let id = parsed.id
    if (id && !url) {
      const resolved = await resolveNumericId(id)
      if (!resolved) {
        writeError("Job not found", "NOT_FOUND")
        return 1
      }
      url = resolved
    }
    const html = await htmlFetch(url as string)
    if (!html) {
      writeError("Job not found", "NOT_FOUND")
      return 1
    }
    // When the input was a slug URL there is no numeric id; use the canonical
    // URL's slug as the stable identifier.
    if (!id) {
      const slug = new URL(url as string).pathname.match(/^\/job\/([^/]+)\/?$/)?.[1] ?? url
      id = slug
    }
    const job = parseJobDetail(html, id as string, url as string)

    if (opts.format === "plain") {
      const lines = [
        job.title,
        `${job.company || "—"} · ${job.location || "—"}`,
        "",
        job.date ? `Posted: ${job.date}` : "",
        job.validThrough ? `Closes: ${job.validThrough}` : "",
        job.employmentType ? `Employment: ${job.employmentType}` : "",
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
