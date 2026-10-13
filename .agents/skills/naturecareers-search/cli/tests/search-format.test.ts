import { afterEach, describe, expect, test } from "bun:test";
import { runSearch } from "../src/commands/search";

// fetch is stubbed throughout; no test here touches the network.

const originalFetch = globalThis.fetch;
const originalStdoutWrite = process.stdout.write;

function card(id: string, title: string): string {
  return `<li class="lister__item cf" id="item-${id}">
    <h3 class="lister__header"><a
 href="/naturecareers/job/${id}/slug/"
 class="x"><span>${title}</span></a></h3>
    <ul class="lister__meta">
      <li class="lister__meta-item lister__meta-item--location">Boston (US)</li>
      <li class="lister__meta-item lister__meta-item--recruiter">Acme Institute</li>
    </ul>
    <p class="lister__description js-clamp-2">A snippet.</p>
    <ul><li class="job-actions__action pipe">3 days ago</li></ul>
  </li>`;
}

const PAGE = `<html><body>
<ul id="listing" class="lister cf block">
${card("111", "Postdoc A")}
${card("222", "Postdoc B")}
</ul>
<script>var cfg = [{'returned\\x2dresults': '159'}];</script>
</body></html>`;

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

async function runWith(
  opts: Partial<Parameters<typeof runSearch>[0]>,
  html: string,
): Promise<{ code: number; stdout: string; url: string }> {
  let url = "";
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    url = typeof input === "string" ? input : String(input);
    return new Response(html);
  }) as typeof fetch;
  const cap = captureStdout();
  const code = await runSearch({
    query: "postdoc",
    page: 1,
    sort: "relevance",
    format: "json",
    ...opts,
  });
  return { code, stdout: cap.read(), url };
}

describe("runSearch output formats", () => {
  test("json: meta.count from the page signal, contract keys present", async () => {
    const { code, stdout } = await runWith({}, PAGE);
    expect(code).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.meta).toEqual({ count: 159, page: 1 });
    expect(parsed.results).toHaveLength(2);
    const first = parsed.results[0];
    expect(first.id).toBe("111");
    expect(first.title).toBe("Postdoc A");
    expect(first.company).toBe("Acme Institute");
    expect(first.location).toBe("Boston (US)");
    expect(first.date).toBe("3 days ago");
    expect(first.url).toBe("https://www.nature.com/naturecareers/job/111/slug/");
    expect(first.salary).toBeNull();
    expect(first.snippet).toBe("A snippet.");
  });

  test("json: count falls back to page length when no signal exists", async () => {
    const { stdout } = await runWith({}, "<html>nothing here</html>");
    const parsed = JSON.parse(stdout);
    expect(parsed.meta.count).toBe(0);
    expect(parsed.results).toEqual([]);
  });

  test("--limit caps results client-side but meta.count stays the total", async () => {
    const { stdout } = await runWith({ limit: 1 }, PAGE);
    const parsed = JSON.parse(stdout);
    expect(parsed.results).toHaveLength(1);
    expect(parsed.meta.count).toBe(159);
  });

  test("--limit 0 emits zero results", async () => {
    const { code, stdout } = await runWith({ limit: 0 }, PAGE);
    expect(code).toBe(0);
    expect(JSON.parse(stdout).results).toHaveLength(0);
  });

  test("table: header row plus one line per result", async () => {
    const { stdout } = await runWith({ format: "table" }, PAGE);
    expect(stdout).toContain("TITLE");
    expect(stdout).toContain("Postdoc A");
    expect(stdout).toContain("Postdoc B");
    expect(stdout).toContain("111");
    expect(stdout.trim().split("\n").length).toBe(4); // header, dashes, 2 rows (trim the trailing newline the CLI always emits)
  });

  test("plain: title, org, id and url per result", async () => {
    const { stdout } = await runWith({ format: "plain" }, PAGE);
    expect(stdout).toContain("Postdoc A");
    expect(stdout).toContain("Acme Institute · Boston (US) · 3 days ago");
    expect(stdout).toContain("id: 222");
  });

  test("table with zero results prints a friendly message", async () => {
    const { stdout } = await runWith({ format: "table" }, "<html></html>");
    expect(stdout.trim()).toBe("No results.");
  });
});

describe("runSearch request URL", () => {
  test("builds Keywords + Page and omits countrycode", async () => {
    const { url } = await runWith({ query: "PhD candidate", page: 3 }, PAGE);
    expect(url).toContain("https://www.nature.com/naturecareers/searchjobs/?");
    expect(url).toContain("Keywords=PhD+candidate");
    expect(url).toContain("Page=3");
    expect(url).not.toContain("countrycode");
    expect(url).not.toContain("sort="); // default sort is relevance — param omitted
  });

  test("--sort date adds sort=Date", async () => {
    const { url } = await runWith({ sort: "date" }, PAGE);
    expect(url).toContain("sort=Date");
  });

  test("a fetch failure surfaces as SEARCH_FAILED on stderr, exit 1", async () => {
    globalThis.fetch = (async () => {
      throw new Error("Request failed: 503 Service Unavailable");
    }) as typeof fetch;
    const cap = captureStdout();
    const originalStderrWrite = process.stderr.write;
    let stderr = "";
    process.stderr.write = ((chunk: string | Uint8Array) => {
      stderr += chunk.toString();
      return true;
    }) as typeof process.stderr.write;
    try {
      const code = await runSearch({
        query: "postdoc",
        page: 1,
        sort: "relevance",
        format: "json",
      });
      expect(code).toBe(1);
      expect(cap.read()).toBe("");
      const err = JSON.parse(stderr.trim());
      expect(err.code).toBe("SEARCH_FAILED");
      expect(err.error).toContain("503");
    } finally {
      process.stderr.write = originalStderrWrite;
    }
  });
});
