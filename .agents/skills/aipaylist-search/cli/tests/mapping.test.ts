import { test } from "node:test";
import assert from "node:assert/strict";
import { apiGet, ensureContract, normalizeId, USER_AGENT } from "../src/helpers.ts";
import type { PortalJob } from "../src/helpers.ts";

test("accepts a bare UUID", () => {
  assert.equal(
    normalizeId("AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE"),
    "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  );
});

test("extracts the UUID from an aipaylist job URL", () => {
  assert.equal(
    normalizeId("https://aipaylist.com/jobs/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee?src=cli"),
    "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  );
});

test("rejects junk ids", () => {
  assert.equal(normalizeId("mercor-apply-xyz"), null);
});

test("missing fields become null rather than omitted", () => {
  const out = ensureContract({ title: "Writer" } as PortalJob);
  assert.equal(out.id, null);
  assert.equal(out.company, null);
  assert.equal(out.location, null);
  assert.equal(out.date, null);
  assert.equal(out.url, null);
  assert.equal(out.title, "Writer");
});

test("does not invent a salary from is_up_to / pay_max", () => {
  const out = ensureContract({
    id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    title: "Evaluator",
    company: "Mercor",
    location: "Worldwide",
    date: "2026-09-01T00:00:00Z",
    url: "https://aipaylist.com/jobs/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    is_up_to: true,
    pay_max: 65,
    pay_min: null,
    pay_raw: "Up to $65/hr",
  });
  assert.equal("salary" in out, false);
  assert.equal(out.is_up_to, true);
  assert.equal(out.pay_max, 65);
  assert.equal(JSON.stringify(out).includes('"salary"'), false);
  assert.equal(out.url, "https://aipaylist.com/jobs/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");
});

test("sends the honest User-Agent and Accept json", async () => {
  const seen: string[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    seen.push(String(input));
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("User-Agent"), USER_AGENT);
    assert.equal(headers.get("Accept"), "application/json");
    return new Response(JSON.stringify({ meta: { count: 0, page: 1 }, results: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  const body = await apiGet("/jobs.json?q=writer", fetchImpl);
  assert.deepEqual(body?.results, []);
  assert.match(seen[0], /\/jobs\.json\?q=writer/);
});
