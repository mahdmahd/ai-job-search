import { describe, test, expect, afterEach } from "bun:test";
import { runSearch, buildUrl } from "../src/commands/search";

const originalFetch = globalThis.fetch;
const originalStdoutWrite = process.stdout.write;

function searchPage(): string {
  return `<html><body><strong class="job-count">582</strong> Jobs Found
<div class="j-search-result__result ie-border-left" data-advert-id="1083631">
    <div class="j-search-result__text">
        <a href="/job/DSL474/fully-funded-phd-studentship">
            Fully Funded PhD Studentship
        </a>
        <div class="j-search-result__department">
            Materials
        </div>
        <div class="j-search-result__employer">
            <b>The University of Manchester</b>
        </div>
        <div>Location:
            Manchester
        </div>
        <div class="j-search-result__info">
            <strong>Salary: </strong>
                            £21,805
                    </div>
        <div>
            <strong>Date Placed: </strong>31 Jul
        </div>
    </div>
    <div class="j-search-result__date-logos">
        <div class="j-search-result__date">
            <span class="j-search-result__date-span j-search-result__date">Closes</span>
            <span class="j-search-result__date-span j-search-result__date--blue ">30 Mar</span>
        </div>
    </div>
</div>
<div class="j-search-result__result ie-border-left" data-advert-id="1087927">
    <div class="j-search-result__text">
        <a href="/job/DSY182/research-assistant">Research Assistant</a>
        <div class="j-search-result__employer"><b>Imperial College London</b></div>
    </div>
</div>
</body></html>`;
}

function captureStdout(): { release: () => string } {
  let stdout = "";
  process.stdout.write = ((chunk: string | Uint8Array) => {
    stdout += chunk.toString();
    return true;
  }) as typeof process.stdout.write;
  return { release: () => stdout };
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.stdout.write = originalStdoutWrite;
});

describe("buildUrl", () => {
  test("page 1 uses startIndex=1, page 3 uses startIndex=51, pageSize=25", () => {
    expect(buildUrl({ query: "x", page: 1, format: "json" })).toContain(
      "startIndex=1",
    );
    expect(buildUrl({ query: "x", page: 3, format: "json" })).toContain(
      "startIndex=51",
    );
    expect(buildUrl({ query: "x", page: 1, format: "json" })).toContain("pageSize=25");
  });

  test("location maps to the location param, omitted when unset", () => {
    const withLoc = buildUrl({ query: "x", location: "Edinburgh", page: 1, format: "json" });
    expect(withLoc).toContain("location=Edinburgh");
    const without = buildUrl({ query: "x", page: 1, format: "json" });
    expect(without).not.toContain("location=");
  });
});

describe("runSearch (stubbed fetch, offline)", () => {
  test("emits meta.count from the page and respects --limit", async () => {
    globalThis.fetch = (async () => new Response(searchPage())) as typeof fetch;
    const cap = captureStdout();
    const code = await runSearch({ query: "PhD", page: 1, limit: 1, format: "json" });
    expect(code).toBe(0);
    const out = JSON.parse(cap.release());
    expect(out.meta).toEqual({ count: 582, page: 1 });
    expect(out.results).toHaveLength(1);
    expect(out.results[0].ref).toBe("DSL474");
  });

  test("--limit 0 emits zero results", async () => {
    globalThis.fetch = (async () => new Response(searchPage())) as typeof fetch;
    const cap = captureStdout();
    const code = await runSearch({ query: "PhD", page: 1, limit: 0, format: "json" });
    expect(code).toBe(0);
    expect(JSON.parse(cap.release()).results).toHaveLength(0);
  });
});
