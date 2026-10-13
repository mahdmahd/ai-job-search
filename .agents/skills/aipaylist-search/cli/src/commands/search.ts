// Copyright (c) 2026 AIPayList
import { apiGet, ensureContract, writeError, JOBS_PATH, type FetchFn, type PortalJob } from "../helpers.ts";

export interface SearchOpts {
  query?: string;
  jobage?: number;
  page: number;
  limit: number;
  format: "json" | "table" | "plain";
  country?: string;
  category?: string;
  min?: number;
  platform?: string;
  fetchImpl?: FetchFn;
}

function buildQuery(opts: SearchOpts): URLSearchParams {
  const p = new URLSearchParams();
  if (opts.query) p.set("q", opts.query);
  p.set("page", String(opts.page));
  p.set("limit", String(opts.limit));
  if (opts.jobage) p.set("jobage", String(opts.jobage));
  if (opts.country) p.set("country", opts.country);
  if (opts.category) p.set("category", opts.category);
  if (opts.min != null) p.set("min", String(opts.min));
  if (opts.platform) p.set("platform", opts.platform);
  return p;
}

function shortDate(date: string | null): string {
  return date ? date.slice(0, 10) : "—";
}

function renderTable(rows: PortalJob[]): string {
  if (rows.length === 0) return "No results.";
  const widths = {
    id: Math.max(2, ...rows.map((r) => (r.id ?? "").length)),
    title: 38,
    company: 18,
    location: 18,
    date: 10,
    pay: 16,
  };
  const cell = (s: string, w: number) => s.slice(0, w).padEnd(w);
  const line = (r: PortalJob) =>
    [
      cell(r.id ?? "—", widths.id),
      cell(r.title ?? "—", widths.title),
      cell(r.company ?? "—", widths.company),
      cell(r.location ?? "—", widths.location),
      cell(shortDate(r.date), widths.date),
      cell(String(r.pay_display ?? r.pay_raw ?? "—"), widths.pay),
    ].join(" ");
  const header = [
    cell("ID", widths.id),
    cell("TITLE", widths.title),
    cell("COMPANY", widths.company),
    cell("LOCATION", widths.location),
    cell("DATE", widths.date),
    cell("PAY", widths.pay),
  ].join(" ");
  return [header, "-".repeat(header.length), ...rows.map(line)].join("\n");
}

function renderPlain(rows: PortalJob[]): string {
  if (rows.length === 0) return "No results.";
  return rows
    .map((r) =>
      [
        r.title ?? "(untitled)",
        `  ${r.company ?? "—"} · ${r.location ?? "—"} · ${shortDate(r.date)}`,
        r.pay_display ? `  ${r.pay_display}${r.is_up_to ? " (advertised ceiling, not a guaranteed rate)" : ""}` : "",
        `  id: ${r.id ?? "—"}`,
        `  ${r.url ?? ""}`,
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const env = await apiGet(`${JOBS_PATH}?${buildQuery(opts).toString()}`, opts.fetchImpl);
    if (!env) {
      writeError(`${JOBS_PATH} not found`, "SEARCH_FAILED");
      return 1;
    }
    const rows = (env.results ?? []).map(ensureContract);
    const total = env.meta?.total ?? rows.length;
    if (opts.format === "table") {
      process.stdout.write(renderTable(rows) + "\n");
    } else if (opts.format === "plain") {
      process.stdout.write(renderPlain(rows) + "\n");
    } else {
      process.stdout.write(
        JSON.stringify({ meta: { count: rows.length, page: opts.page, total }, results: rows }, null, 2) + "\n",
      );
    }
    return 0;
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "SEARCH_FAILED");
    return 1;
  }
}
