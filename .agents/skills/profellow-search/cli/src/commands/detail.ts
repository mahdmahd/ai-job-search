import { DETAIL_BASE, htmlFetch, parseOpenCallDetail, writeError } from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

const PROFELLOW_HOST = /(^|\.)profellow\.com$/i

/**
 * Accept a bare open-call slug or a profellow.com /open-call/<slug>/ URL
 * (with or without scheme). A slug on the bare archive path
 * (/open-calls/…) or a foreign host is rejected: fetching a foreign URL as
 * if it were a fellowship would print the wrong page with exit 0.
 */
export function normalizeId(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  // Bare slug: lowercase kebab, no scheme, no slashes, no spaces.
  if (/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(trimmed)) return trimmed.toLowerCase()

  const hasScheme = /^https?:\/\//i.test(trimmed)
  if (hasScheme || /^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(trimmed)) {
    let parsed: URL
    try {
      parsed = new URL(hasScheme ? trimmed : `https://${trimmed}`)
    } catch {
      return null
    }
    if (!PROFELLOW_HOST.test(parsed.hostname)) return null
    const m = parsed.pathname.match(/^\/open-call\/([^/?#]+)\/?$/i)
    return m ? decodeURIComponent(m[1]).toLowerCase() : null
  }

  return null
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const slug = normalizeId(opts.id)
  if (!slug) {
    writeError(
      `Could not parse an open-call slug from "${opts.id}" (expected a slug like "my-fellowship" or a https://www.profellow.com/open-call/<slug>/ URL)`,
      "BAD_ID",
    )
    return 1
  }
  try {
    const html = await htmlFetch(`${DETAIL_BASE}/${slug}/`)
    if (!html) {
      writeError("Fellowship not found", "NOT_FOUND")
      return 1
    }
    const call = parseOpenCallDetail(html, slug)

    if (opts.format === "plain") {
      const lines = [
        call.title,
        `${call.company ? `Host: ${call.company}` : "Host: —"} · ${call.deadline ? `Deadline: ${call.deadline}` : "no deadline listed"}`,
        "",
        call.eligibility ? `Eligibility:\n${call.eligibility}` : "",
        "",
        call.description || "(no description)",
        "",
        ...(call.applyLinks.length > 0 ? [`Apply: ${call.applyLinks.join(", ")}`] : []),
        `URL: ${call.url}`,
      ].filter((l) => l !== "")
      process.stdout.write(lines.join("\n") + "\n")
    } else {
      process.stdout.write(JSON.stringify(call, null, 2) + "\n")
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "DETAIL_FAILED")
    return 1
  }
}
