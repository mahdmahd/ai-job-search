import { htmlFetch, normalizeId, parseJobDetail, writeError } from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const id = normalizeId(opts.id)
  if (!id) {
    writeError(`Could not parse a job ID from "${opts.id}" (expected a numeric id or a careers.insidehighered.com /job/ URL)`, "BAD_ID")
    return 1
  }
  try {
    // Madgex serves the full job page (including JSON-LD) at /job/<id>/ — no
    // slug required — so an id alone is enough; a foreign host never is.
    const html = await htmlFetch(`https://careers.insidehighered.com/job/${id}/`)
    if (!html) {
      writeError("Job not found", "NOT_FOUND")
      return 1
    }
    const job = parseJobDetail(html, id)

    if (opts.format === "plain") {
      const head = [job.title, `${job.company || "—"} · ${job.location || "—"}`]
      if (job.date) head.push(`Posted: ${job.date}`)
      if (job.validThrough) head.push(`Open through: ${job.validThrough}`)
      if (job.employmentType) head.push(`Employment: ${job.employmentType}`)
      const tail: string[] = []
      if (job.applyUrl) tail.push(`Apply: ${job.applyUrl}`)
      if (job.externalApplyUrl) tail.push(`Apply on website: ${job.externalApplyUrl}`)
      tail.push(`URL: ${job.url}`)
      const lines = [...head, "", job.description || "(no description)", "", ...tail]
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
