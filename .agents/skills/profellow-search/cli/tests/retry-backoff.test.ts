import { afterEach, describe, expect, test } from "bun:test";
import { htmlFetch } from "../src/helpers";

// The portal contract requires backoff on 429/5xx. These tests pin the retry
// loop offline: a stubbed fetch counts attempts, and a stubbed setTimeout
// fires immediately so the exhaustion case does not sleep through the real
// 500ms -> 8s backoff schedule.

const originalFetch = globalThis.fetch;
const originalSetTimeout = globalThis.setTimeout;

afterEach(() => {
  globalThis.fetch = originalFetch;
  globalThis.setTimeout = originalSetTimeout;
});

function instantTimers() {
  globalThis.setTimeout = ((fn: () => void) =>
    originalSetTimeout(fn, 0)) as unknown as typeof setTimeout;
}

function stubFetch(responses: Array<() => Response>): { calls: number } {
  const state = { calls: 0 };
  globalThis.fetch = (async () => {
    const i = Math.min(state.calls, responses.length - 1);
    state.calls++;
    return responses[i]();
  }) as unknown as typeof fetch;
  return state;
}

describe("htmlFetch retry/backoff", () => {
  test("retries a 429 and succeeds on the next attempt", async () => {
    instantTimers();
    const state = stubFetch([
      () => new Response("", { status: 429 }),
      () => new Response('<article class="open-call"></article>', { status: 200 }),
    ]);

    const body = await htmlFetch("https://www.profellow.com/open-calls/");
    expect(body).toContain("open-call");
    expect(state.calls).toBe(2);
  });

  test("returns empty string on 404 without retrying", async () => {
    const state = stubFetch([() => new Response("", { status: 404 })]);

    const body = await htmlFetch("https://www.profellow.com/open-call/no-such-slug/");
    expect(body).toBe("");
    expect(state.calls).toBe(1);
  });

  test("gives up after the initial attempt plus six retries on persistent 5xx", async () => {
    instantTimers();
    const state = stubFetch([() => new Response("", { status: 500 })]);

    await expect(htmlFetch("https://www.profellow.com/open-calls/")).rejects.toThrow(/500/);
    expect(state.calls).toBe(7);
  });
});
