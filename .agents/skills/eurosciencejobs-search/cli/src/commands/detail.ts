import {
  SITE_BASE,
  htmlFetch,
  parseJobDetail,
  writeError,
} from "../helpers.js";

export interface DetailOpts {
  id: string;
  format: "json" | "plain";
}

export function normalizeId(input: string): string | null {
  const trimmed = input.trim();

  // Bare numeric id.
  if (/^\d+$/.test(trimmed)) return trimmed;

  // Full job_display URL. Read through real URL parsing and require a
  // eurosciencejobs.com host, so a `/job_display/<digits>` path on any other
  // host (e.g. an apply link carrying a job number) cannot silently resolve
  // to an unrelated posting.
  const hasScheme = /^https?:\/\//i.test(trimmed);
  if (hasScheme || /^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(trimmed)) {
    let parsed: URL;
    try {
      parsed = new URL(hasScheme ? trimmed : `https://${trimmed}`);
    } catch {
      return null;
    }
    if (!/(^|\.)eurosciencejobs\.com$/i.test(parsed.hostname)) return null;
    const path = parsed.pathname.match(/\/job_display\/(\d+)(?:\/|$)/);
    return path ? path[1] : null;
  }

  return null;
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const id = normalizeId(opts.id);
  if (!id) {
    writeError(`Could not parse a job ID from "${opts.id}"`, "BAD_ID");
    return 1;
  }
  try {
    // The slug after the id is decorative server-side; requesting the id with
    // a trailing slash returns the full posting.
    const html = await htmlFetch(`${SITE_BASE}/job_display/${id}/`);
    if (!html) {
      writeError("Job not found", "NOT_FOUND");
      return 1;
    }
    const job = parseJobDetail(html, id);

    if (opts.format === "plain") {
      const lines = [
        job.title,
        `${job.company || "—"} · ${job.location || "—"}`,
        "",
        job.deadline ? `Deadline: ${job.deadline}` : "",
        job.salary ? `Salary: ${job.salary}` : "",
        `Status: ${job.isActive ? "ACTIVE" : "CLOSED / EXPIRED"}`,
        "",
        job.description || "(no description)",
        "",
        `URL: ${job.url}`,
      ].filter((l) => l !== "");
      process.stdout.write(lines.join("\n") + "\n");
    } else {
      process.stdout.write(JSON.stringify(job, null, 2) + "\n");
    }
    return 0;
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "DETAIL_FAILED");
    return 1;
  }
}
