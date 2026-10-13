import { BASE_URL, htmlFetch, normalizeId, parseJobDetail, writeError } from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const id = normalizeId(opts.id)
  if (!id) {
    writeError(`Could not parse a job ID from "${opts.id}" (expected a numeric id or a latinosinhighered.com /career/ URL)`, "BAD_ID")
    return 1
  }
  try {
    // JobMount serves the full job page (including JSON-LD) at /career/<id>/
    // regardless of slug, so an id alone is enough; a foreign host never is.
    const html = await htmlFetch(`${BASE_URL}/career/${id}/`)
    if (!html) {
      writeError("Job not found", "NOT_FOUND")
      return 1
    }
    const job = parseJobDetail(html, id)

    if (opts.format === "plain") {
      const head = [job.title, `${job.company || "—"} · ${job.location || "—"}`]
      if (job.datePosted) head.push(`Posted: ${job.datePosted}`)
      if (job.validThrough) head.push(`Open through: ${job.validThrough}`)
      if (job.category) head.push(`Category: ${job.category}`)
      if (job.jobType) head.push(`Employment: ${job.jobType}`)
      if (job.salary) head.push(`Salary: ${job.salary}`)
      if (job.requiredEducation) head.push(`Required education: ${job.requiredEducation}`)
      if (job.requiredExperience) head.push(`Required experience: ${job.requiredExperience}`)
      const tail: string[] = []
      if (job.applyUrl) tail.push(`Apply: ${job.applyUrl}`)
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
