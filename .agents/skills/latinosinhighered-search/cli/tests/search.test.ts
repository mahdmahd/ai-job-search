import { afterEach, describe, expect, test } from "bun:test";
import { runSearch } from "../src/commands/search";
import { runDetail } from "../src/commands/detail";

// Offline command tests: fetch is stubbed, so these never touch the network.
// They pin the URL contract (GET /candidate/search_jobs?keywords=...), the
// single-page cap (page > 1 makes no request), and the JSON output shape
// from add-portal.md.

const originalFetch = globalThis.fetch;
const originalStdoutWrite = process.stdout.write;
const originalStderrWrite = process.stderr.write;
const originalSetTimeout = globalThis.setTimeout;

// The 500-failure test walks the full backoff ladder before giving up; stub
// timers instant (linkedin-search pattern) so it doesn't wait real seconds
// and trip the 5s test timeout.
function instantTimers() {
  globalThis.setTimeout = ((fn: () => void) =>
    originalSetTimeout(fn, 0)) as unknown as typeof setTimeout;
}

const CARD = `
<a class="job-link" tabindex="50" href="/career/179106/clinical-assistant-professor-economics-new-york-new-york"> <span class="featured-jobs-title">Clinical Assistant Professor of Economics</span> <span class="featured-jobs-location">       <span class="sp_sh_item sp_sh_employer">
New York University Arts and Science
   </span>                      <span class="sp_sh_item sp_sh_city">
New York
    </span>    <span class="sp_sh_item sp_sh_region">
New York
   </span> </span> </a>
`;

// Distinct ids: parseJobCards dedupes by id (featured rotation repeats cards).
function card(id: number, slug: string, title: string): string {
  return `
<a class="job-link" tabindex="50" href="/career/${id}/${slug}"> <span class="featured-jobs-title">${title}</span> <span class="featured-jobs-location">       <span class="sp_sh_item sp_sh_employer">
New York University Arts and Science
   </span>                      <span class="sp_sh_item sp_sh_city">
New York
    </span>    <span class="sp_sh_item sp_sh_region">
New York
   </span> </span> </a>
`;
}

const DETAIL = `
<html><head>
<script type="application/ld+json">{"@context":"http://schema.org/","@type":"JobPosting","datePosted":"2026-10-12T06:52:27","validThrough":"2027-01-10T06:52:27","title":"Clinical Assistant Professor of Economics","description":"<p>Body.</p>"}</script>
</head><body>
<tr><td class="f vac_item_employer"> Employer:&nbsp;</td><td>New York University Arts and Science</td></tr>
<tr><td class="f vac_item_city"> City:&nbsp;</td><td>New York</td></tr>
<script>var rUrl = 'https://apply.interfolio.com/194029'.replace(/&amp;/gi, "&");</script>
</body></html>
`;

function stubFetch(html: string, status = 200): { urls: string[] } {
  const urls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    urls.push(typeof input === "string" ? input : input.toString());
    return new Response(html, { status });
  }) as typeof fetch;
  return { urls };
}

function captureStdout(): { read: () => string } {
  let out = "";
  process.stdout.write = ((chunk: string | Uint8Array) => {
    out += chunk.toString();
    return true;
  }) as typeof process.stdout.write;
  return { read: () => out };
}

function captureStderr(): { read: () => string } {
  let out = "";
  process.stderr.write = ((chunk: string | Uint8Array) => {
    out += chunk.toString();
    return true;
  }) as typeof process.stderr.write;
  return { read: () => out };
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.stdout.write = originalStdoutWrite;
  process.stderr.write = originalStderrWrite;
});

describe("runSearch", () => {
  test("builds the GET search URL: keywords param on latinosinhighered.com", async () => {
    const { urls } = stubFetch(CARD);
    const out = captureStdout();

    const code = await runSearch({ query: "PhD candidate", page: 1, format: "json" });

    expect(code).toBe(0);
    expect(urls).toHaveLength(1);
    expect(urls[0]).toBe(
      "https://latinosinhighered.com/candidate/search_jobs?keywords=PhD+candidate",
    );
    out.read();
  });

  test("page > 1 makes NO request and emits zero results (single-page portal)", async () => {
    const { urls } = stubFetch(CARD);
    const out = captureStdout();

    const code = await runSearch({ query: "postdoc", page: 2, format: "json" });

    expect(code).toBe(0);
    expect(urls).toHaveLength(0);
    const parsed = JSON.parse(out.read());
    expect(parsed.meta).toEqual({ count: 0, page: 2 });
    expect(parsed.results).toEqual([]);
  });

  test("emits the { meta: { count, page }, results } shape with all keys present", async () => {
    stubFetch(
      card(179106, "clinical-assistant-professor-economics-new-york-new-york", "Clinical Assistant Professor of Economics") +
      card(178894, "bersoff-faculty-fellow-department-philosophy-new-york-new-york", "Bersoff Faculty Fellow, Department of Philosophy") +
      card(179124, "technician-maintenance-texas-austin", "Technician, Maintenance"),
    );
    const out = captureStdout();

    const code = await runSearch({ query: "postdoc", page: 1, limit: 2, format: "json" });

    expect(code).toBe(0);
    const parsed = JSON.parse(out.read());
    expect(parsed.meta).toEqual({ count: 2, page: 1 });
    expect(parsed.results).toHaveLength(2);
    for (const r of parsed.results) {
      for (const k of ["id", "title", "company", "location", "date", "url"]) {
        expect(k in r).toBe(true);
      }
    }
  });

  test("--limit 0 emits zero results", async () => {
    stubFetch(CARD);
    const out = captureStdout();

    const code = await runSearch({ query: "postdoc", page: 1, limit: 0, format: "json" });

    expect(code).toBe(0);
    expect(JSON.parse(out.read()).results).toHaveLength(0);
  });

  test("an empty result page still exits 0 with count 0", async () => {
    stubFetch("<html><body>no jobs here</body></html>");
    const out = captureStdout();

    const code = await runSearch({ query: "zzzznothing", page: 1, format: "json" });

    expect(code).toBe(0);
    const parsed = JSON.parse(out.read());
    expect(parsed.meta.count).toBe(0);
    expect(parsed.results).toEqual([]);
  });

  test("a failed fetch exits 1 with a JSON error on stderr and nothing on stdout", async () => {
    instantTimers();
    stubFetch("boom", 500);
    const out = captureStdout();
    const errOut = captureStderr();

    const code = await runSearch({ query: "postdoc", page: 1, format: "json" });

    expect(code).toBe(1);
    expect(out.read()).toBe("");
    const err = JSON.parse(errOut.read());
    expect(err.code).toBe("SEARCH_FAILED");
    expect(typeof err.error).toBe("string");
  });
});

describe("runDetail", () => {
  test("fetches /career/<id>/ and emits the JSON detail with all keys present", async () => {
    const { urls } = stubFetch(DETAIL);
    const out = captureStdout();

    const code = await runDetail({ id: "179106", format: "json" });

    expect(code).toBe(0);
    expect(urls).toEqual(["https://latinosinhighered.com/career/179106/"]);
    const job = JSON.parse(out.read());
    expect(job.title).toBe("Clinical Assistant Professor of Economics");
    expect(job.company).toBe("New York University Arts and Science");
    expect(job.location).toBe("New York");
    expect(job.datePosted).toBe("2026-10-12T06:52:27");
    expect(job.applyUrl).toBe("https://apply.interfolio.com/194029");
    for (const k of [
      "id", "title", "company", "location", "date", "url", "description",
      "datePosted", "validThrough", "category", "jobType", "salary",
      "requiredEducation", "requiredExperience", "applyUrl",
    ]) {
      expect(k in job).toBe(true);
    }
  });

  test("a 404 becomes a NOT_FOUND JSON error with exit 1, not a crash", async () => {
    stubFetch("not found", 404);
    const out = captureStdout();
    const errOut = captureStderr();

    const code = await runDetail({ id: "999999", format: "json" });

    expect(code).toBe(1);
    expect(out.read()).toBe("");
    expect(JSON.parse(errOut.read()).code).toBe("NOT_FOUND");
  });

  test("an unparseable id exits 1 with BAD_ID before any request", async () => {
    const { urls } = stubFetch(DETAIL);
    const errOut = captureStderr();

    const code = await runDetail({ id: "https://boards.greenhouse.io/acme/jobs/4567890", format: "json" });

    expect(code).toBe(1);
    expect(urls).toHaveLength(0);
    expect(JSON.parse(errOut.read()).code).toBe("BAD_ID");
  });
});
