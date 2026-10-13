// Copyright (c) 2026 AIPayList
import { apiGet, ensureContract, normalizeId, writeError, JOBS_PATH, type FetchFn, type PortalJob } from "../helpers.ts";

export interface DetailOpts {
  id: string;
  format: "json" | "plain";
  fetchImpl?: FetchFn;
}

function renderPlain(job: PortalJob): string {
  const lines = [
    job.title ?? "(untitled)",
    `${job.company ?? "—"} · ${job.location ?? "—"}`,
  ];
  if (job.date) lines.push(`Posted: ${job.date.slice(0, 10)}`);
  if (job.pay_display) {
    lines.push(
      `Pay: ${job.pay_display}${job.is_up_to ? ' (advertised ceiling, not a guaranteed rate)' : ""}`,
    );
  }
  if (job.pay_raw) lines.push(`Source wording: ${job.pay_raw}`);
  if (job.category) lines.push(`Category: ${job.category}`);
  if (job.status) lines.push(`Status: ${job.status}`);
  lines.push("", job.description ?? "(no description)", "", `URL: ${job.url ?? ""}`, `id: ${job.id ?? ""}`);
  return lines.join("\n");
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const id = normalizeId(opts.id);
  if (!id) {
    writeError(`could not parse an AIPayList job id from "${opts.id}"`, "BAD_ID");
    return 1;
  }
  try {
    const env = await apiGet(`${JOBS_PATH}?id=${encodeURIComponent(id)}`, opts.fetchImpl);
    const job = env?.results?.[0];
    if (!env || !job) {
      writeError("job not found", "NOT_FOUND");
      return 1;
    }
    const mapped = ensureContract(job);
    if (opts.format === "plain") {
      process.stdout.write(renderPlain(mapped) + "\n");
    } else {
      process.stdout.write(JSON.stringify(mapped, null, 2) + "\n");
    }
    return 0;
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "DETAIL_FAILED");
    return 1;
  }
}
