import {
  baseUrl,
  formatSalary,
  normalizePostingId,
  parseJobDetail,
  politeFetch,
  writeError,
  type Lang,
} from "../helpers.js"

export interface DetailOpts {
  id: string
  lang: Lang
  format: "json" | "plain"
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const id = normalizePostingId(opts.id)
  if (!id) {
    writeError(`Could not parse a Job Bank posting id from "${opts.id}"`, "BAD_ID")
    return 1
  }

  try {
    const html = await politeFetch(`${baseUrl(opts.lang)}/jobsearch/jobposting/${id}`, {
      immediate: true,
    })
    if (!html) {
      writeError("Job posting not found (it may have expired)", "NOT_FOUND")
      return 1
    }

    const job = parseJobDetail(html, id, opts.lang)

    if (opts.format === "plain") {
      const salary = formatSalary(job.salaryMin, job.salaryMax, job.salaryUnit, job.salaryCurrency)

      const lines = [
        job.title,
        `${job.company || "—"} · ${job.location || "—"}`,
        "",
        job.date ? `Posted: ${job.date}` : "",
        job.deadline ? `Closes: ${job.deadline}` : "",
        salary ? `Salary: ${salary}` : "",
        job.workHours ? `Hours: ${job.workHours}` : "",
        job.employmentType ? `Terms: ${job.employmentType}` : "",
        job.vacancies ? `Vacancies: ${job.vacancies}` : "",
        job.languages ? `Languages: ${job.languages}` : "",
        "",
        job.description || "(no description)",
        "",
        job.howToApply ? `How to apply:\n${job.howToApply}` : "",
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
