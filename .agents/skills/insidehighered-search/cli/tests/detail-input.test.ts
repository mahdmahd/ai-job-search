import { afterEach, describe, expect, test } from "bun:test";
import { runDetail } from "../src/commands/detail";
import { runCLI } from "./helpers";

// The real command path, not the parser in isolation: `detail` must never
// send a request for a URL that is not an Inside Higher Ed job page. Before
// the host check, a foreign board URL could be reduced to its digits and
// fetched as an Inside Higher Ed posting. fetch is stubbed throughout; no
// test here touches the network.

const originalFetch = globalThis.fetch;
const originalStderrWrite = process.stderr.write;

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.stderr.write = originalStderrWrite;
});

function recordingFetch(status = 404): string[] {
  const requested: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    requested.push(String(input));
    return new Response("", { status });
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

    const rc = await runDetail({ id: "https://boards.greenhouse.io/acme/jobs/4567890", format: "json" });

    expect(rc).toBe(1);
    expect(requested).toEqual([]);
    expect(JSON.parse(stderr.join("").trim())).toMatchObject({ code: "BAD_ID" });
  });

  test("a careers.insidehighered.com job URL fetches /job/<id>/ (slug not required)", async () => {
    const requested = recordingFetch();
    captureStderr();

    const rc = await runDetail({
      id: "https://careers.insidehighered.com/job/3509752/postdoc-in-cancer-immunology/",
      format: "json",
    });

    expect(rc).toBe(1); // the stub answers 404 -> NOT_FOUND, after the request was made
    expect(requested).toEqual(["https://careers.insidehighered.com/job/3509752/"]);
  });

  test("a bare numeric id fetches /job/<id>/", async () => {
    const requested = recordingFetch();
    captureStderr();

    await runDetail({ id: "3509752", format: "json" });

    expect(requested).toEqual(["https://careers.insidehighered.com/job/3509752/"]);
  });
});

describe("detail input through the CLI", () => {
  test("exits 1 with the stderr-JSON BAD_ID contract for a foreign URL", async () => {
    const result = await runCLI(["detail", "https://jobs.lever.co/acme/1234567"]);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stderr)).toMatchObject({ code: "BAD_ID" });
  });

  test("a 404 (stubbed via empty response path) reports NOT_FOUND", async () => {
    const requested = recordingFetch(404);
    const stderr = captureStderr();

    const rc = await runDetail({ id: "999999999", format: "json" });

    expect(requested).toEqual(["https://careers.insidehighered.com/job/999999999/"]);
    expect(rc).toBe(1);
    expect(JSON.parse(stderr.join("").trim())).toMatchObject({ code: "NOT_FOUND" });
  });
});
