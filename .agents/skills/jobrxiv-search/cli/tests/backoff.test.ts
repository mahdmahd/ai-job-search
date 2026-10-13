import { afterEach, describe, expect, test } from "bun:test";

// Backoff behavior lives in helpers.ts (listingsFetch/htmlFetch share the
// same retry loop). We verify the loop logic offline by stubbing globalThis
// fetch — no network in tests. setTimeout is stubbed to fire instantly (the
// linkedin-search pattern) so the max-retries path doesn't wait ~24s of real
// backoff and trip the 5s test timeout.

const REAL_FETCH = globalThis.fetch;
const REAL_SET_TIMEOUT = globalThis.setTimeout;

function instantTimers() {
  globalThis.setTimeout = ((fn: () => void) =>
    REAL_SET_TIMEOUT(fn, 0)) as unknown as typeof setTimeout;
}

afterEach(() => {
  globalThis.fetch = REAL_FETCH;
  globalThis.setTimeout = REAL_SET_TIMEOUT;
});

function fetchSequence(responses: Array<{ status: number }>): Array<{ status: number }> {
  let i = 0;
  globalThis.fetch = (async () => {
    const r = responses[Math.min(i, responses.length - 1)];
    i++;
    return new Response("{}", { status: r.status, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  return responses;
}

describe("backoff on 429/5xx", () => {
  test("retries a 429 and succeeds on the next attempt", async () => {
    const { listingsFetch } = await import("../src/helpers");
    fetchSequence([{ status: 429 }, { status: 200 }]);
    const envelope = await listingsFetch("https://jobrxiv.org/jm-ajax/get_listings/?search_keywords=x");
    expect(envelope).not.toBeNull();
  });

  test("retries a 503 and succeeds", async () => {
    const { htmlFetch } = await import("../src/helpers");
    fetchSequence([{ status: 503 }, { status: 200 }]);
    const html = await htmlFetch("https://jobrxiv.org/job/x/");
    expect(html).toBe("{}"); // stub body proves the 200 attempt ran
  });

  test("gives up after max retries and throws", async () => {
    instantTimers();
    const { listingsFetch } = await import("../src/helpers");
    fetchSequence([{ status: 500 }]);
    await expect(listingsFetch("https://jobrxiv.org/jm-ajax/get_listings/?q=x")).rejects.toThrow(
      /Request failed/,
    );
  });

  test("a 404 returns empty string (never a crash)", async () => {
    const { htmlFetch } = await import("../src/helpers");
    fetchSequence([{ status: 404 }]);
    expect(await htmlFetch("https://jobrxiv.org/job/does-not-exist/")).toBe("");
  });

  test("a 404 on the listings endpoint returns null", async () => {
    const { listingsFetch } = await import("../src/helpers");
    fetchSequence([{ status: 404 }]);
    expect(await listingsFetch("https://jobrxiv.org/jm-ajax/get_listings/?q=x")).toBeNull();
  });
});
