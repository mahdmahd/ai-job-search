import { afterEach, describe, expect, test } from "bun:test";
import { runSearch } from "../src/commands/search";

// Offline search-command tests: fetch is stubbed, so these never touch the
// network. They pin the Madgex URL contract (Keywords + 1-based Page) and
// the JSON output shape from add-portal.md.

const originalFetch = globalThis.fetch;
const originalStdoutWrite = process.stdout.write;

const CARD = `
<li class="lister__item cf" id="item-3509752">
  <div class="lister__details cf js-clickable">
    <h3 class="lister__header"><a

 href="
	/job/3509752/postdoc-in-cancer-immunology/



" class="js-clickable-area-link"><span>Postdoc in Cancer Immunology</span></a></h3>
    <ul class="lister__meta">
      <li class="lister__meta-item lister__meta-item--location">Philadelphia, PA</li>
      <li class="lister__meta-item lister__meta-item--recruiter">University of Pennsylvania</li>
    </ul>
    <p class="lister__description js-clamp-2">Snippet</p>
  </div>
</li>`;

function stubFetch(html: string): { urls: string[] } {
  const urls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    urls.push(typeof input === "string" ? input : input.toString());
    return new Response(html);
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

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.stdout.write = originalStdoutWrite;
});

describe("runSearch", () => {
  test("builds the Madgex URL: Keywords + 1-based Page on careers.insidehighered.com", async () => {
    const { urls } = stubFetch("");
    const out = captureStdout();

    const code = await runSearch({ query: "PhD candidate", page: 2, format: "json" });

    expect(code).toBe(0);
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain("https://careers.insidehighered.com/searchjobs/?");
    expect(urls[0]).toContain("Keywords=PhD+candidate");
    expect(urls[0]).toContain("Page=2");
    out.read();
  });

  test("emits the { meta: { count, page }, results } shape with all keys present", async () => {
    stubFetch(CARD + CARD + CARD);
    const out = captureStdout();

    const code = await runSearch({ query: "postdoc", page: 1, limit: 2, format: "json" });

    expect(code).toBe(0);
    const parsed = JSON.parse(out.read());
    expect(parsed.meta).toEqual({ count: 2, page: 1 });
    expect(parsed.results).toHaveLength(2);
    for (const r of parsed.results) {
      for (const k of ["id", "title", "company", "location", "date", "url", "salary", "snippet"]) {
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
});
