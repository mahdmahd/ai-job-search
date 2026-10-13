// aipaylist-search CLI helpers
// Copyright (c) 2026 AIPayList
//
// Fetch/backoff and stderr JSON errors follow the portal-skill contract in
// Mads Lorentzen's ai-job-search (MIT, Copyright (c) 2026 Mads Lorentzen).

export const DEFAULT_BASE_URL = "https://aipaylist.com";
export const USER_AGENT = "Mozilla/5.0 (compatible; aipaylist-search-cli/1.0; +https://aipaylist.com)";
export const JOBS_PATH = "/jobs.json";

export type FetchFn = typeof fetch;

export function baseUrl(): string {
  const raw = (process.env.AIPAYLIST_API_URL ?? "").trim();
  return (raw || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n");
}

export interface PortalJob {
  id: string | null;
  title: string | null;
  company: string | null;
  location: string | null;
  date: string | null;
  url: string | null;
  description?: string | null;
  pay_raw?: string | null;
  is_up_to?: boolean | null;
  pay_unit?: string | null;
  pay_min?: number | null;
  pay_max?: number | null;
  currency?: string | null;
  pay_display?: string | null;
  category?: string | null;
  platform?: string | null;
  status?: string | null;
  [k: string]: unknown;
}

export interface SearchEnvelope {
  meta?: { count?: number; page?: number; limit?: number; total?: number | null };
  results?: PortalJob[];
  error?: string;
  code?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * GET JSON from AIPayList. Retries 429/5xx with exponential backoff + jitter
 * (max 6 retries). Connection failures fail fast so an outage degrades this
 * source instead of hanging /scrape. 404 returns null.
 */
export async function apiGet(
  path: string,
  fetchImpl: FetchFn = fetch,
): Promise<SearchEnvelope | null> {
  const url = path.startsWith("http") ? path : `${baseUrl()}${path}`;
  const maxRetries = 6;
  let delay = 500;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let response: Response;
    try {
      response = await fetchImpl(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        redirect: "follow",
        signal: AbortSignal.timeout(15000),
      });
    } catch (e) {
      throw new Error(
        `could not reach AIPayList at ${baseUrl()} (${e instanceof Error ? e.message : String(e)})`,
      );
    }

    if (response.status === 429 || response.status >= 500) {
      if (attempt === maxRetries) {
        throw new Error(`AIPayList request failed: ${response.status} ${response.statusText}`);
      }
      const retryAfter = Number(response.headers.get("Retry-After"));
      const wait =
        Number.isFinite(retryAfter) && retryAfter >= 0
          ? retryAfter * 1000
          : delay + Math.floor(Math.random() * 500);
      await sleep(wait);
      delay = Math.min(delay * 2, 8000);
      continue;
    }
    if (response.status === 404) return null;

    const body = (await response.json().catch(() => null)) as SearchEnvelope | null;
    if (!response.ok) {
      throw new Error(body?.error || `AIPayList request failed: ${response.status} ${response.statusText}`);
    }
    if (!body) throw new Error("AIPayList returned an unparseable response body");
    return body;
  }
  throw new Error("AIPayList request failed after retries");
}

/** A job UUID, or one extracted from an aipaylist.com/jobs/{uuid} URL. */
export function normalizeId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const m = trimmed.match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
  );
  return m ? m[0].toLowerCase() : null;
}

/** Missing contract fields become null, never omitted. */
export function ensureContract(j: PortalJob): PortalJob {
  return {
    ...j,
    id: j.id ?? null,
    title: j.title ?? null,
    company: j.company ?? null,
    location: j.location ?? null,
    date: j.date ?? null,
    url: j.url ?? null,
  };
}
