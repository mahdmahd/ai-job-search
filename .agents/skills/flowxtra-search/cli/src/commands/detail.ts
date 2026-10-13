import {
  apiGet,
  normalizeId,
  toDetail,
  writeError,
  type FlowxtraDetailEnvelope,
  type JobDetailResult,
} from "../helpers.js"

export interface DetailOpts {
  id: string // a Flowxtra has_id or an apply/career-page URL
  format: "json" | "plain"
}

/** A human-readable rendering of one job: header, present fields, description. */
function renderPlain(job: JobDetailResult): string {
  const lines = [job.title, `${job.company ?? "—"} · ${job.location ?? "—"} (${job.workplace ?? "—"})`]

  const field = (label: string, value: string | null) => {
    if (value) lines.push(`${label}: ${value}`)
  }
  field("Website", job.company_website)
  field("Seniority", job.seniority)
  field("Employment", job.employment_types.length ? job.employment_types.join(", ") : null)
  field("Salary", job.salary)

  lines.push("", job.description ?? "(no description)", "", `Apply: ${job.url}`, `id: ${job.id}`)
  return lines.join("\n")
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const hasId = normalizeId(opts.id)
  if (!hasId) {
    writeError(`could not parse a Flowxtra job id from "${opts.id}"`, "BAD_ID")
    return 1
  }
  try {
    const env = await apiGet<FlowxtraDetailEnvelope>(`/candidate/jobs/${encodeURIComponent(hasId)}`)
    if (!env) {
      writeError("job not found (it may have expired)", "NOT_FOUND")
      return 1
    }
    const job = toDetail(env.data)

    if (opts.format === "plain") {
      process.stdout.write(renderPlain(job) + "\n")
    } else {
      process.stdout.write(JSON.stringify(job, null, 2) + "\n")
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "DETAIL_FAILED")
    return 1
  }
}
