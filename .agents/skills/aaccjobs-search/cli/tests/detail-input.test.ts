import { afterEach, describe, expect, test } from "bun:test";
import { runDetail, normalizeId, resolveFetchUrl } from "../src/commands/detail";
import { SITE_ORIGIN } from "../src/helpers";
import { runCLI } from "./helpers";

// The real command path, not the parser in isolation: `detail` must never
// send a request for a URL that is not an AACC Jobs job. fetch is stubbed
// throughout; no test here touches the network.

const originalFetch = globalThis.fetch;
const originalStderrWrite = process.stderr.write;

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.stderr.write = originalStderrWrite;
});

function recordingFetch(): string[] {
  const requested: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    requested.push(String(input));
    return new Response("", { status: 404 });
  }) as unknown as typeof fetch;
  return requested;
}

function captureStderr(): string[] {
  const out: string[] = [];
  process.stderr.write = ((chunk: string | Uint8Array) => {
    out.push(String(chunk));
    return true;
  }) as typeof process.stderr.write;
  return out;
}

describe("detail input on the real handler path", () => {
  test("a foreign job-board URL is rejected with BAD_ID before any request", async () => {
    const requested = recordingFetch();
    const stderr = captureStderr();

    const rc = await runDetail({
      id: "https://boards.greenhouse.io/acme/jobs/4567890",
      format: "json",
    });

    expect(rc).toBe(1);
    expect(requested).toEqual([]);
    expect(JSON.parse(stderr.join("").trim())).toMatchObject({ code: "BAD_ID" });
  });

  test("a full AACC job URL is fetched as given", async () => {
    const requested = recordingFetch();
    captureStderr();
    const url =
      "https://jobs.aacc.nche.edu/jobs/623296164-superintendent-president-at-imperial-valley-college";

    const rc = await runDetail({ id: url, format: "json" });

    expect(rc).toBe(1); // stub answers 404 -> NOT_FOUND, after the request was made
    expect(requested).toEqual([url]);
  });

  test("a bare numeric id fetches /jobs/{id}", async () => {
    const requested = recordingFetch();
    captureStderr();

    await runDetail({ id: "623296164", format: "json" });
    expect(requested).toEqual([`${SITE_ORIGIN}/jobs/623296164`]);
  });

  test("a 404 response is NOT_FOUND, never a crash", async () => {
    globalThis.fetch = (async () => new Response("", { status: 404 })) as typeof fetch;
    const stderr = captureStderr();

    const rc = await runDetail({ id: "999999999", format: "json" });

    expect(rc).toBe(1);
    expect(JSON.parse(stderr.join("").trim())).toMatchObject({ code: "NOT_FOUND" });
  });

  test("a 200 response without JobPosting JSON-LD is NOT_FOUND, not a job", async () => {
    globalThis.fetch = (async () =>
      new Response("<html><body><h1>AACC Jobs</h1></body></html>", {
        status: 200,
      })) as typeof fetch;
    const stderr = captureStderr();

    const rc = await runDetail({ id: "999999999", format: "json" });

    expect(rc).toBe(1);
    expect(JSON.parse(stderr.join("").trim())).toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("normalizeId / resolveFetchUrl", () => {
  test("accepts a bare id and full AACC job URLs", () => {
    expect(normalizeId("623296164")).toBe("623296164");
    expect(
      normalizeId(
        "https://jobs.aacc.nche.edu/jobs/623296164-superintendent-president-at-imperial-valley-college",
      ),
    ).toBe("623296164");
    expect(
      normalizeId("jobs.aacc.nche.edu/jobs/623296164/something"),
    ).toBe("623296164");
  });

  test("rejects look-alike hosts and non-job AACC paths", () => {
    expect(normalizeId("https://jobs.aacc.nche.edu.evil.io/jobs/623296164/x")).toBeNull();
    expect(normalizeId("https://jobs.aacc.nche.edu@evil.io/jobs/623296164")).toBeNull();
    expect(normalizeId("https://jobs.aacc.nche.edu/jobs/search/faculty-jobs")).toBeNull();
    expect(normalizeId("https://example.com/jobs/623296164/x")).toBeNull();
    expect(normalizeId("not-a-url")).toBeNull();
    expect(normalizeId("")).toBeNull();
  });

  test("resolveFetchUrl fetches a full URL as given, builds one for a bare id", () => {
    expect(resolveFetchUrl("623296164")).toBe(`${SITE_ORIGIN}/jobs/623296164`);
    const full =
      "https://jobs.aacc.nche.edu/jobs/623296164-superintendent-president-at-imperial-valley-college";
    expect(resolveFetchUrl(full)).toBe(full);
    expect(resolveFetchUrl("https://example.com/jobs/1")).toBeNull();
  });
});

describe("detail input through the CLI", () => {
  test("exits 1 with the stderr-JSON BAD_ID contract for a foreign URL", async () => {
    const result = await runCLI(["detail", "https://jobs.lever.co/acme/1234567"]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr)).toMatchObject({ code: "BAD_ID" });
  });
});
