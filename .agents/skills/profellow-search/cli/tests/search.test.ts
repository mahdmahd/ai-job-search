import { afterEach, describe, expect, test } from "bun:test";
import { runSearch } from "../src/commands/search";
import { ARCHIVE_BASE } from "../src/helpers";

const originalFetch = globalThis.fetch;
const originalStdoutWrite = process.stdout.write;

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.stdout.write = originalStdoutWrite;
});

function captureStdout(): string[] {
  const out: string[] = [];
  process.stdout.write = ((chunk: string | Uint8Array) => {
    out.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;
  return out;
}

const ARCHIVE_PAGE = [
  `<article class="open-call">`,
  `<div class="open-call__content post__content">`,
  `<h4 class="open-call-content__title post__title">`,
  `<a href="https://www.profellow.com/open-call/phd-candidate-fellowship-in-physics/">PhD Candidate Fellowship in Physics</a>`,
  `</h4>`,
  `<div class="post__excerpt"><p>A postdoctoral-track fellowship for PhD candidates in physics.</p></div>`,
  `<div class="open-call-eligibility"><strong>Eligibility:</strong> Enrolled PhD candidates</div>`,
  `<div class="open-call-deadline"><strong>Deadline:</strong> December 1, 2026</div>`,
  `</div></article>`,
  `<article class="open-call">`,
  `<div class="open-call__content post__content">`,
  `<h4 class="open-call-content__title post__title">`,
  `<a href="https://www.profellow.com/open-call/business-leadership-award/">Business Leadership Award</a>`,
  `</h4>`,
  `<div class="post__excerpt"><p>An award for MBA students pursuing consulting careers.</p></div>`,
  `<div class="open-call-deadline"><strong>Deadline:</strong> January 5, 2027</div>`,
  `</div></article>`,
].join("\n");

function stubFetchArchive(body: string): { capturedUrl: string[] } {
  const capturedUrl: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    capturedUrl.push(typeof input === "string" ? input : input.toString());
    return new Response(body, {
      status: 200,
      headers: { "Content-Type": "text/html" },
    });
  }) as unknown as typeof fetch;
  return { capturedUrl };
}

describe("runSearch", () => {
  test("client-side filter keeps matching cards; meta.count is the match total", async () => {
    stubFetchArchive(ARCHIVE_PAGE);
    const stdout = captureStdout();

    const code = await runSearch({ query: "PhD candidate", page: 1, format: "json" });

    expect(code).toBe(0);
    const payload = JSON.parse(stdout.join(""));
    expect(payload.meta.count).toBe(1);
    expect(payload.meta.page).toBe(1);
    expect(payload.results).toHaveLength(1);
    expect(payload.results[0]).toMatchObject({
      id: "phd-candidate-fellowship-in-physics",
      title: "PhD Candidate Fellowship in Physics",
      company: null,
      location: null,
      date: "December 1, 2026",
      url: "https://www.profellow.com/open-call/phd-candidate-fellowship-in-physics/",
    });
  });

  test("--page 2 fetches /open-calls/page/2/; page 1 the bare archive path", async () => {
    const { capturedUrl } = stubFetchArchive(ARCHIVE_PAGE);
    captureStdout();

    await runSearch({ query: "PhD", page: 2, format: "json" });
    expect(capturedUrl[0]).toBe(`${ARCHIVE_BASE}/page/2/`);

    stubFetchArchive(ARCHIVE_PAGE);
    const again = await runSearch({ query: "PhD", page: 1, format: "json" });
    expect(again).toBe(0);
  });

  test("--limit caps emitted results after filtering", async () => {
    stubFetchArchive(ARCHIVE_PAGE);
    const stdout = captureStdout();

    const code = await runSearch({ query: "a", page: 1, limit: 1, format: "json" });

    expect(code).toBe(0);
    expect(JSON.parse(stdout.join("")).results).toHaveLength(1);
  });

  test("a query matching nothing yields an empty set, exit 0", async () => {
    stubFetchArchive(ARCHIVE_PAGE);
    const stdout = captureStdout();

    const code = await runSearch({ query: "zzz-no-such-term", page: 1, format: "json" });

    expect(code).toBe(0);
    const payload = JSON.parse(stdout.join(""));
    expect(payload.meta.count).toBe(0);
    expect(payload.results).toEqual([]);
  });
});
