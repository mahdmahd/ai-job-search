import {
  DETAIL_PAGE,
  Session,
  isLostConnection,
  normalizePosterId,
  parseJobDetail,
  primeSession,
  writeError,
  type Lang,
} from "../helpers.js"

export interface DetailOpts {
  id: string
  lang: Lang
  format: "json" | "plain"
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const id = normalizePosterId(opts.id)
  if (!id) {
    writeError(`Could not parse a GC Jobs poster id from "${opts.id}"`, "BAD_ID")
    return 1
  }

  const session = new Session()
  try {
    // A poster page fetched without a session redirects to the login flow, so the
    // session has to be primed even to read one advertisement.
    await primeSession(session, opts.lang)

    const html = await session.get(`${DETAIL_PAGE}?poster=${id}&toggleLanguage=${opts.lang}`)
    if (!html || isLostConnection(html)) {
      writeError("Job poster not found (it may have closed)", "NOT_FOUND")
      return 1
    }

    const job = parseJobDetail(html, id, opts.lang)

    if (opts.format === "plain") {
      const lines = [
        job.title,
        `${job.company || "—"} · ${job.location || "—"}`,
        "",
        job.closingDate ? `Closes: ${job.closingDate}` : "",
        job.salary ? `Salary: ${job.salary}` : "",
        job.classification ? `Level: ${job.classification}` : "",
        job.languageRequirement ? `Language: ${job.languageRequirement}` : "",
        job.referenceNumber ? `Reference: ${job.referenceNumber}` : "",
        job.selectionProcessNumber ? `Selection process: ${job.selectionProcessNumber}` : "",
        job.whoCanApply ? `Who can apply: ${job.whoCanApply}` : "",
        job.externalUrl ? `Advertised at: ${job.externalUrl}` : "",
        "",
        job.description || "(no description)",
        "",
        `URL: ${job.url}`,
      ].filter((line) => line !== "")
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
