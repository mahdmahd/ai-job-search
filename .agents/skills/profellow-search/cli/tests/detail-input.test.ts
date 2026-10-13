import { afterEach, describe, expect, test } from "bun:test";
import { runDetail, normalizeId } from "../src/commands/detail";
import { DETAIL_BASE } from "../src/helpers";
import { runCLI } from "./helpers";

// The real command path, not the parser in isolation: `detail` must never
// send a request for a URL that is not a profellow open call. fetch is
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

describe("normalizeId", () => {
  test("accepts a bare slug", () => {
    expect(normalizeId("2027-princeton-in-asia")).toBe("2027-princeton-in-asia");
  });

  test("accepts a full open-call URL and extracts the slug", () => {
    expect(
      normalizeId("https://www.profellow.com/open-call/2027-princeton-in-asia/")
    ).toBe("2027-princeton-in-asia");
  });

  test("accepts a scheme-less profellow open-call URL", () => {
    expect(normalizeId("profellow.com/open-call/some-fellowship")).toBe(
      "some-fellowship"
    );
  });

  test("rejects the bare archive path, foreign hosts, look-alikes, and userinfo tricks", () => {
    expect(normalizeId("https://www.profellow.com/open-calls/")).toBeNull();
    expect(normalizeId("https://www.linkedin.com/jobs/view/1234567890")).toBeNull();
    expect(normalizeId("https://profellow.com.evil.io/open-call/x/")).toBeNull();
    expect(normalizeId("https://profellow.com@evil.io/open-call/x/")).toBeNull();
    expect(normalizeId("not a slug!!")).toBeNull();
    expect(normalizeId("")).toBeNull();
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

  test("a bare slug hits the open-call endpoint directly", async () => {
    const requested = recordingFetch();
    captureStderr();

    const rc = await runDetail({ id: "2027-princeton-in-asia", format: "json" });

    expect(rc).toBe(1); // the stub answers 404 -> NOT_FOUND, after the request was made
    expect(requested).toEqual([`${DETAIL_BASE}/2027-princeton-in-asia/`]);
  });

  test("a 404 from the detail page surfaces NOT_FOUND, never a crash", async () => {
    recordingFetch();
    const stderr = captureStderr();

    const rc = await runDetail({ id: "no-such-fellowship", format: "json" });

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
