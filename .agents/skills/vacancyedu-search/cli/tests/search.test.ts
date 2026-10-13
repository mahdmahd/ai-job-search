import { afterEach, describe, expect, test } from "bun:test";
import { runSearch } from "../src/commands/search";

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

const SAMPLE_POST = {
  id: 17395,
  date: "2026-10-13T13:07:49",
  link: "https://vacancyedu.com/2026/10/13/postdoctoral-fellowship-05/",
  title: { rendered: "Postdoctoral Fellowship (05) at University of British Columbia, Canada" },
};

function stubFetchWithHeaders(body: unknown, total: number): { capturedUrl: string[] } {
  const capturedUrl: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    capturedUrl.push(typeof input === "string" ? input : input.toString());
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "X-WP-Total": String(total),
        "X-WP-TotalPages": "1",
      },
    });
  }) as unknown as typeof fetch;
  return { capturedUrl };
}

describe("runSearch", () => {
  test("meta.count is X-WP-Total, not the client-side page length", async () => {
    stubFetchWithHeaders([SAMPLE_POST, SAMPLE_POST, SAMPLE_POST], 3522);
    const stdout = captureStdout();

    const code = await runSearch({ query: "postdoc", jobage: 9999, page: 1, format: "json" });

    expect(code).toBe(0);
    const payload = JSON.parse(stdout.join(""));
    expect(payload.meta.count).toBe(3522);
    expect(payload.meta.page).toBe(1);
    expect(payload.results).toHaveLength(3);
    expect(payload.results[0]).toMatchObject({
      id: 17395,
      title: "Postdoctoral Fellowship (05) at University of British Columbia, Canada",
      company: "University of British Columbia",
      location: "Canada",
      date: "2026-10-13T13:07:49",
      url: "https://vacancyedu.com/2026/10/13/postdoctoral-fellowship-05/",
    });
  });

  test("--limit 0 emits zero results", async () => {
    stubFetchWithHeaders([SAMPLE_POST], 1);
    const stdout = captureStdout();

    const code = await runSearch({ query: "test", jobage: 9999, page: 1, limit: 0, format: "json" });

    expect(code).toBe(0);
    expect(JSON.parse(stdout.join("")).results).toHaveLength(0);
  });

  test("--jobage 7 constructs after=<ISO> in the request URL", async () => {
    const { capturedUrl } = stubFetchWithHeaders([], 0);

    const code = await runSearch({ query: "PhD", jobage: 7, page: 1, format: "json" });

    expect(code).toBe(0);
    expect(capturedUrl[0]).toContain("after=");
    expect(capturedUrl[0]).toContain("search=PhD");
    expect(capturedUrl[0]).toContain("per_page=100");
    expect(capturedUrl[0]).toContain("page=1");
  });

  test("--jobage 9999 (all time) omits the after= param", async () => {
    const { capturedUrl } = stubFetchWithHeaders([], 0);

    await runSearch({ query: "PhD", jobage: 9999, page: 1, format: "json" });

    expect(capturedUrl[0]).not.toContain("after=");
  });

  test("a non-array error payload yields an empty result set, exit 0", async () => {
    stubFetchWithHeaders({ code: "rest_no_route", message: "Not found" }, 0);
    const stdout = captureStdout();

    const code = await runSearch({ query: "x", jobage: 9999, page: 1, format: "json" });

    expect(code).toBe(0);
    expect(JSON.parse(stdout.join("")).results).toEqual([]);
  });
});
