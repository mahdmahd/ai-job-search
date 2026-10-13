import { afterEach, describe, expect, test } from "bun:test";
import { runDetail, normalizeId } from "../src/commands/detail";
import { API_BASE } from "../src/helpers";
import { runCLI } from "./helpers";

// The real command path, not the parser in isolation: `detail` must never
// send a request for a URL that is not a vacancyedu post. fetch is stubbed
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

describe("normalizeId", () => {
  test("accepts a bare numeric post ID", () => {
    expect(normalizeId("17395")).toEqual({ id: "17395" });
  });

  test("accepts a ?p=ID URL", () => {
    expect(normalizeId("https://vacancyedu.com/?p=17395")).toEqual({ id: "17395" });
  });

  test("accepts a pretty permalink and extracts the slug (not the date segments)", () => {
    // WP permalinks are /YYYY/MM/DD/slug/ — the numeric path segments are a
    // date, never the post ID. The slug is resolved via REST ?slug= later.
    expect(
      normalizeId("https://vacancyedu.com/2026/10/13/postdoctoral-fellowship-05-at-ubc-canada/"),
    ).toEqual({ slug: "postdoctoral-fellowship-05-at-ubc-canada" });
  });

  test("accepts a scheme-less vacancyedu URL", () => {
    expect(normalizeId("vacancyedu.com/2026/10/13/some-postdoc-role/")).toEqual({
      slug: "some-postdoc-role",
    });
  });

  test("rejects foreign hosts, look-alikes, and userinfo tricks", () => {
    expect(normalizeId("https://www.linkedin.com/jobs/view/1234567890")).toBeNull();
    expect(normalizeId("https://vacancyedu.com.evil.io/2026/10/13/x/")).toBeNull();
    expect(normalizeId("https://vacancyedu.com@evil.io/x")).toBeNull();
    expect(normalizeId("not-a-url")).toBeNull();
  });
});

describe("detail input on the real handler path", () => {
  test("a foreign job-board URL is rejected with BAD_ID before any request", async () => {
    const requested = recordingFetch();
    const stderr = captureStderr();

    const rc = await runDetail({
      id: "https://www.linkedin.com/jobs/view/1234567890",
      format: "json",
    });

    expect(rc).toBe(1);
    expect(requested).toEqual([]);
    expect(JSON.parse(stderr.join("").trim())).toMatchObject({ code: "BAD_ID" });
  });

  test("a vacancyedu permalink resolves through the REST slug filter", async () => {
    const requested = recordingFetch();
    captureStderr();

    const rc = await runDetail({
      id: "https://vacancyedu.com/2026/10/13/postdoctoral-fellowship-05-at-ubc-canada/",
      format: "json",
    });

    expect(rc).toBe(1); // the stub answers 404 -> NOT_FOUND, after the request was made
    expect(requested).toHaveLength(1);
    expect(requested[0]).toContain(`${API_BASE}?slug=postdoctoral-fellowship-05-at-ubc-canada`);
    expect(requested[0]).toContain("_fields=id,date,link,title,content");
  });

  test("a numeric id hits the post endpoint directly", async () => {
    const requested = recordingFetch();
    captureStderr();

    await runDetail({ id: "17395", format: "json" });

    expect(requested).toEqual([`${API_BASE}/17395?_fields=id,date,link,title,content`]);
  });

  test("a 404 from the API surfaces NOT_FOUND, never a crash", async () => {
    recordingFetch();
    const stderr = captureStderr();

    const rc = await runDetail({ id: "999999999", format: "json" });

    expect(rc).toBe(1);
    expect(JSON.parse(stderr.join("").trim())).toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("detail input through the CLI", () => {
  test("exits 1 with the stderr-JSON BAD_ID contract for a foreign URL", async () => {
    const result = await runCLI(["detail", "https://jobs.lever.co/acme/1234567"]);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stderr)).toMatchObject({ code: "BAD_ID" });
  });

  test("exits 1 with NO_ID when the argument is missing", async () => {
    const result = await runCLI(["detail"]);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stderr)).toMatchObject({ code: "NO_ID" });
  });
});
