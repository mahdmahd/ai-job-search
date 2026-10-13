import { afterEach, describe, expect, test } from "bun:test";
import { apiFetch } from "../src/helpers";

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

describe("apiFetch retry/backoff", () => {
  test("retries a 429 and succeeds on the next attempt", async () => {
    instantTimers();
    const state = stubFetch([
      () => new Response("", { status: 429 }),
      () => new Response(JSON.stringify([{ id: 1 }]), {
        status: 200,
        headers: { "X-WP-Total": "1" },
      }),
    ]);

    const result = await apiFetch<unknown[]>("https://vacancyedu.com/wp-json/wp/v2/posts?search=x");
    expect(result).not.toBeNull();
    expect(result!.total).toBe(1);
    expect(state.calls).toBe(2);
  });

  test("returns null on 404 without retrying", async () => {
    const state = stubFetch([() => new Response("", { status: 404 })]);

    const result = await apiFetch("https://vacancyedu.com/wp-json/wp/v2/posts/999999");
    expect(result).toBeNull();
    expect(state.calls).toBe(1);
  });

  test("gives up after the initial attempt plus six retries on persistent 5xx", async () => {
    instantTimers();
    const state = stubFetch([() => new Response("", { status: 500 })]);

    await expect(apiFetch("https://vacancyedu.com/wp-json/wp/v2/posts?search=x")).rejects.toThrow(/500/);
    expect(state.calls).toBe(7);
  });
});
