import { afterEach, describe, expect, test } from "bun:test";
import { runSearch } from "../src/commands/search";

// fetch is stubbed throughout; no test here touches the network.

const originalFetch = globalThis.fetch;
const originalStdoutWrite = process.stdout.write;
const originalStderrWrite = process.stderr.write;

const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
<item>
<guid>https://jobs.aacc.nche.edu/jobs/111-adjunct-biology</guid>
<link>https://jobs.aacc.nche.edu/jobs/111-adjunct-biology</link>
<title>Adjunct Faculty, Biology at Desert College (Palm Desert, CA, USA)</title>
<description>Teach introductory biology labs.</description>
<pubDate>Mon, 12 Oct 2026 22:51:08 +0000</pubDate>
</item>
<item>
<guid>https://jobs.aacc.nche.edu/jobs/222-president</guid>
<link>https://jobs.aacc.nche.edu/jobs/222-president</link>
<title>President at Lake College (Grayslake, IL, USA)</title>
<description>Lead the college as president.</description>
<pubDate>Fri, 09 Oct 2026 15:00:41 +0000</pubDate>
</item>
</channel>
</rss>`;

const HOME = `<ul class="jobList">
<li class="job-listing  logo">
<div class="jobList-introWrap"><div class="jobList-intro">
<a class="jobList-title" href="/jobs/111-adjunct-biology"><strong>Adjunct Faculty, Biology</strong></a>
<ul class="jobList-introMeta">
<li><i class="text-muted fas fa-building"></i>Desert College</li>
<li><i class="text-muted fas fa-map-marker-alt"></i>Palm Desert, CA, USA</li>
<li></li>
</ul>
</div></div>
<div class="jobList-date text-muted u-textNoWrap">Oct 12</div>
</li>
<li class="job-listing ">
<div class="jobList-introWrap"><div class="jobList-intro">
<a class="jobList-title" href="/jobs/333-dean-nursing"><strong>Dean of Nursing</strong></a>
<ul class="jobList-introMeta">
<li><i class="text-muted fas fa-building"></i>River College</li>
<li><i class="text-muted fas fa-map-marker-alt"></i>Austin, TX, USA</li>
<li></li>
</ul>
</div></div>
<div class="jobList-date text-muted u-textNoWrap">Oct 10</div>
</li>
</ul>`;

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.stdout.write = originalStdoutWrite;
});

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
  const original = process.stderr.write;
  process.stderr.write = ((chunk: string | Uint8Array) => {
    out += chunk.toString();
    return true;
  }) as typeof process.stderr.write;
  return { read: () => out };
}

async function runWith(
  opts: Partial<Parameters<typeof runSearch>[0]>,
  rss = RSS,
  home = HOME,
): Promise<{ code: number; stdout: string; stderr: string; urls: string[] }> {
  const urls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : String(input);
    urls.push(url);
    const body = url.endsWith("/jobs.rss") ? rss : home;
    return new Response(body, { status: 200 });
  }) as typeof fetch;
  const cap = captureStdout();
  const errCap = captureStderr();
  const code = await runSearch({
    query: "adjunct",
    page: 1,
    format: "json",
    ...opts,
  });
  process.stderr.write = originalStderrWrite;
  return { code, stdout: cap.read(), stderr: errCap.read(), urls };
}

describe("runSearch fetching", () => {
  test("fetches exactly RSS + homepage, no server-search path", async () => {
    const { urls } = await runWith({});
    expect(urls).toHaveLength(2);
    expect(urls[0]).toBe("https://jobs.aacc.nche.edu/jobs.rss");
    expect(urls[1]).toBe("https://jobs.aacc.nche.edu/");
    expect(urls.join(" ")).not.toContain("search");
  });
});

describe("runSearch filtering and merging", () => {
  test("json: client-side filter matches, RSS entry wins the merge, contract keys present", async () => {
    const { code, stdout } = await runWith({});
    expect(code).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.meta.count).toBe(1);
    expect(parsed.meta.page).toBe(1);
    expect(parsed.results).toHaveLength(1);
    const first = parsed.results[0];
    expect(first.id).toBe("111");
    expect(first.title).toBe("Adjunct Faculty, Biology");
    expect(first.company).toBe("Desert College");
    expect(first.location).toBe("Palm Desert, CA, USA");
    expect(first.date).toBe("2026-10-12"); // RSS ISO date, not the "Oct 12" label
    expect(first.url).toBe("https://jobs.aacc.nche.edu/jobs/111-adjunct-biology");
    expect(first.snippet).toContain("biology labs");
    for (const key of ["id", "title", "company", "location", "date", "url"]) {
      expect(first).toHaveProperty(key);
    }
  });

  test("json: dean query surfaces the homepage-only card", async () => {
    const { stdout } = await runWith({ query: "dean" });
    const parsed = JSON.parse(stdout);
    expect(parsed.meta.count).toBe(1);
    expect(parsed.results[0]).toMatchObject({ id: "333", company: "River College" });
  });

  test("json: no matches emit count 0 and an empty list", async () => {
    const { stdout } = await runWith({ query: "astrophysics" });
    const parsed = JSON.parse(stdout);
    expect(parsed.meta.count).toBe(0);
    expect(parsed.results).toEqual([]);
  });

  test("--limit caps results client-side but meta.count stays the match total", async () => {
    const { stdout } = await runWith({ query: "college", limit: 1 });
    const parsed = JSON.parse(stdout);
    expect(parsed.results).toHaveLength(1);
    expect(parsed.meta.count).toBe(3);
  });

  test("table: header row plus one line per result", async () => {
    const { stdout } = await runWith({ query: "college", format: "table" });
    expect(stdout).toContain("TITLE");
    expect(stdout).toContain("Adjunct Faculty, Biology");
    expect(stdout).toContain("222");
    expect(stdout.trim().split("\n").length).toBe(5); // header, dashes, 3 rows (trim the trailing newline the CLI always emits)
  });

  test("plain: title, org, id and url per result", async () => {
    const { stdout } = await runWith({ query: "president", format: "plain" });
    expect(stdout).toContain("President");
    expect(stdout).toContain("Lake College · Grayslake, IL, USA · 2026-10-09");
    expect(stdout).toContain("id: 222");
  });

  test("table with zero results prints a friendly message", async () => {
    const { stdout } = await runWith({ query: "astrophysics", format: "table" });
    expect(stdout.trim()).toBe("No results.");
  });
});

describe("runSearch failure path", () => {
  test("a fetch failure surfaces as SEARCH_FAILED on stderr, exit 1", async () => {
    globalThis.fetch = (async () => {
      throw new Error("Request failed: 503 Service Unavailable");
    }) as typeof fetch;
    const cap = captureStdout();
    const errCap = captureStderr();
    try {
      const code = await runSearch({ query: "adjunct", page: 1, format: "json" });
      expect(code).toBe(1);
      expect(cap.read()).toBe("");
      const err = JSON.parse(errCap.read().trim());
      expect(err.code).toBe("SEARCH_FAILED");
      expect(err.error).toContain("503");
    } finally {
      process.stderr.write = originalStderrWrite;
    }
  });
});
