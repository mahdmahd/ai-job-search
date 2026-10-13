import { afterEach, describe, expect, test } from "bun:test";
import { runDetail, normalizeId } from "../src/commands/detail";
import { SITE_ORIGIN } from "../src/helpers";
import { runCLI } from "./helpers";

// The real command path, not the parser in isolation: `detail` must never
// send a request for a URL that is not a Nature Careers job. fetch is
// stubbed throughout; no test here touches the network.

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

  test("a Nature Careers job URL builds the fetch URL from the extracted id", async () => {
    const requested = recordingFetch();
    captureStderr();

    const rc = await runDetail({
      id: "https://www.nature.com/naturecareers/job/12864992/postdoc-in-statistical-genetics/?LinkSource=PremiumListing",
      format: "json",
    });

    expect(rc).toBe(1); // stub answers 404 -> NOT_FOUND, after the request was made
    expect(requested).toEqual([`${SITE_ORIGIN}/naturecareers/job/12864992/`]);
  });

  test("a bare numeric id fetches /naturecareers/job/{id}/", async () => {
    const requested = recordingFetch();
    captureStderr();

    await runDetail({ id: "12864992", format: "json" });
    expect(requested).toEqual([`${SITE_ORIGIN}/naturecareers/job/12864992/`]);
  });

  test("a 404 response is NOT_FOUND, never a crash", async () => {
    globalThis.fetch = (async () => new Response("", { status: 404 })) as typeof fetch;
    const stderr = captureStderr();

    const rc = await runDetail({ id: "999999999", format: "json" });

    expect(rc).toBe(1);
    expect(JSON.parse(stderr.join("").trim())).toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("normalizeId", () => {
  test("accepts a bare id and a full job URL", () => {
    expect(normalizeId("12864992")).toBe("12864992");
    expect(normalizeId("https://www.nature.com/naturecareers/job/12864992/some-slug/")).toBe(
      "12864992",
    );
    expect(normalizeId("www.nature.com/naturecareers/job/12864992/x/")).toBe("12864992");
  });

  test("rejects look-alike hosts and non-job nature.com paths", () => {
    expect(normalizeId("https://nature.com.evil.io/naturecareers/job/12864992/x/")).toBeNull();
    expect(normalizeId("https://www.nature.com@evil.io/naturecareers/job/12864992/")).toBeNull();
    expect(normalizeId("https://www.nature.com/naturecareers/searchjobs/")).toBeNull();
    expect(normalizeId("https://example.com/naturecareers/job/12864992/x/")).toBeNull();
    expect(normalizeId("not-a-url")).toBeNull();
    expect(normalizeId("")).toBeNull();
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
