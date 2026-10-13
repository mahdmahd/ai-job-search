// Data source: EuroScienceJobs.com public search and job pages. No authentication
// required. Search returns server-rendered HTML; detail returns a single job page.
// We parse both with regex (the markup is shallow; a full DOM parser is unnecessary).

export const SEARCH_BASE = "https://www.eurosciencejobs.com/job_search";
export const SITE_BASE = "https://www.eurosciencejobs.com";

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n");
}

const UA = "Mozilla/5.0 (compatible; eurosciencejobs-cli/1.0)";

/** Fetch HTML with exponential backoff on 429/5xx. Returns "" on a 404. */
export async function htmlFetch(url: string): Promise<string> {
  const maxRetries = 6;
  let delay = 500;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });
    if (response.status === 429 || response.status >= 500) {
      if (attempt === maxRetries) {
        throw new Error(
          `Request failed: ${response.status} ${response.statusText}`,
        );
      }
      const jitter = Math.floor(Math.random() * 500);
      await new Promise((r) => setTimeout(r, delay + jitter));
      delay = Math.min(delay * 2, 8000);
      continue;
    }
    if (response.status === 404) return "";
    if (!response.ok) {
      throw new Error(
        `Request failed: ${response.status} ${response.statusText}`,
      );
    }
    return response.text();
  }
  throw new Error("Request failed after max retries");
}

export interface JobCard {
  id: string;
  title: string;
  company: string | null;
  location: string | null;
  date: string | null;
  url: string;
}

export interface JobDetail extends JobCard {
  description: string | null;
  deadline: string | null;
  salary: string | null;
  isActive: boolean;
}

/**
 * Convert a Unicode code point to a string. Uses `fromCodePoint` (not
 * `fromCharCode`) so supplementary-plane code points decode correctly, and
 * drops out-of-range values instead of throwing.
 */
function numericEntity(cp: number): string {
  return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : "";
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&hellip;/g, "…")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    // Numeric character references: decimal (&#233;) and hexadecimal (&#xE9;).
    .replace(/&#(\d+);/g, (_, dec) => numericEntity(parseInt(dec, 10)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, hex) =>
      numericEntity(parseInt(hex, 16)),
    )
    .replace(/&nbsp;/g, " ");
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function clean(html: string): string {
  return decodeHtmlEntities(stripTags(html));
}

/** Encode a search term the way the site's own JS does: lowercase, _ for space, ___ for /. */
export function siteEncode(value: string): string {
  return value
    .toLowerCase()
    .replaceAll(" ", "_")
    .replaceAll("/", "___");
}

/**
 * Parse the search response: a list of per-job `<li>` blocks, each anchored by
 * an `<h3><a href="/job_display/<id>/<slug>">Title</a></h3>` heading. Featured
 * cards (`standardJobContainer`) also carry companyName/location/salary/
 * postedDate divs; plain cards carry only the heading, so those fields are
 * null for them. Each chunk is parsed independently so one malformed card
 * cannot break the rest.
 */
export function parseJobCards(html: string): JobCard[] {
  const results: JobCard[] = [];
  const chunks = html
    .split(/<li[^>]*>/)
    .filter((c) => /\/job_display\/\d+\//.test(c));

  for (const chunk of chunks) {
    const head = chunk.match(
      /<h3><a[^>]*href="(\/job_display\/(\d+)\/[^"]*)">([\s\S]*?)<\/a><\/h3>/i,
    );
    if (!head) continue;
    const url = SITE_BASE + head[1];
    const id = head[2];
    const title = clean(head[3]);
    if (!title) continue;

    const companyMatch = chunk.match(
      /class="companyName"[^>]*>([\s\S]*?)<\/div>/i,
    );
    const locationMatch = chunk.match(
      /class="location"[^>]*>([\s\S]*?)<\/div>/i,
    );
    const dateMatch = chunk.match(
      /class="postedDate"[^>]*>([\s\S]*?)<\/div>/i,
    );

    const company = companyMatch ? clean(companyMatch[1]) || null : null;
    const location = locationMatch ? clean(locationMatch[1]) || null : null;

    let date: string | null = null;
    if (dateMatch) {
      const posted = dateMatch[1].match(/Posted\s+([^<&\n]+)/i);
      if (posted) date = posted[1].trim();
    }

    results.push({ id, title, company, location, date, url });
  }

  return results;
}

/**
 * Parse the single-job detail page. Company and location are the centered
 * `<h2>` lines following the description heading; deadline comes from the
 * "Deadline <date>" label next to the Apply button; salary from the salary
 * block when present. Description keeps paragraph breaks as newlines.
 */
export function parseJobDetail(html: string, id: string): JobDetail {
  const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const title = titleMatch ? clean(titleMatch[1]) : "(untitled)";

  // Centered h2 triple: title repeat, company, location.
  const h2s = [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)].map((m) =>
    clean(m[1]),
  );
  let company: string | null = null;
  let location: string | null = null;
  if (h2s.length >= 3) {
    company = h2s[1] || null;
    location = h2s[2] || null;
  }

  let description: string | null = null;
  const dispOpen = html.search(/<div[^>]*class="jobDisplay"[^>]*>/i);
  const dispEnd = html.search(/<!--\s*Job Description end\s*-->/i);
  if (dispOpen !== -1 && dispEnd !== -1) {
    // Start after the opening div's closing ">" so its attributes cannot
    // leak into the extracted text.
    const openEnd = html.indexOf(">", dispOpen);
    const block = html.slice(openEnd + 1, dispEnd);
    const withBreaks = block
      .replace(/<\s*br\s*\/?>/gi, "\n")
      .replace(/<\/(p|li|ul|ol|div|h\d)>/gi, "\n");
    description =
      decodeHtmlEntities(stripTags(withBreaks)).replace(/\n{3,}/g, "\n\n").trim() ||
      null;
  }

  // Deadline label next to the Apply button, e.g. "Deadline 31 December".
  const deadlineMatch = html.match(/Deadline\s+([^<'"]{1,60})/i);
  const deadline = deadlineMatch ? deadlineMatch[1].trim() || null : null;

  const salaryMatch = html.match(/class="salary"[^>]*>([\s\S]*?)<\//i);
  const salary = salaryMatch ? clean(salaryMatch[1]) || null : null;

  // A live posting carries an "Apply Now" call-to-action button.
  const isActive = /Apply Now/i.test(html);

  return {
    id,
    title,
    company,
    location,
    date: null,
    url: `${SITE_BASE}/job_display/${id}/`,
    description,
    deadline,
    salary,
    isActive,
  };
}
