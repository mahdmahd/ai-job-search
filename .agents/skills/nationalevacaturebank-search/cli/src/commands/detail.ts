import { JOBS_PATH, apiGet, normalizeId, toResult, writeError, type NationaleVacaturebankJob } from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

function renderPlain(job: NationaleVacaturebankJob): string {
  const result = toResult(job)
  const salary = job.salary && (job.salary.min !== null || job.salary.max !== null)
    ? `Salary: ${job.salary.min ?? "—"}–${job.salary.max ?? "—"}`
    : ""
  const lines = [
    result.title,
    `${result.company ?? "—"} · ${result.location ?? "—"}`,
    result.date ? `Posted: ${result.date}` : "",
    result.contractType ? `Contract: ${result.contractType}` : "",
    result.careerLevel ? `Career level: ${result.careerLevel}` : "",
    salary,
    result.categories.length ? `Categories: ${result.categories.join(", ")}` : "",
    "",
    job.description ?? "(no description)",
    "",
    `URL: ${result.url}`,
    `id: ${result.id}`,
  ].filter((line) => line !== "")
  return lines.join("\n")
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const id = normalizeId(opts.id)
  if (!id) {
    writeError(`could not parse a Nationale Vacaturebank job ID from "${opts.id}"`, "BAD_ID")
    return 1
  }

  try {
    const job = await apiGet<NationaleVacaturebankJob>(`${JOBS_PATH}/${encodeURIComponent(id)}`)
    if (!job) {
      writeError("job not found", "NOT_FOUND")
      return 1
    }

    if (opts.format === "plain") {
      process.stdout.write(renderPlain(job) + "\n")
    } else {
      process.stdout.write(JSON.stringify(job, null, 2) + "\n")
    }
    return 0
  } catch (error) {
    writeError(error instanceof Error ? error.message : String(error), "DETAIL_FAILED")
    return 1
  }
}
