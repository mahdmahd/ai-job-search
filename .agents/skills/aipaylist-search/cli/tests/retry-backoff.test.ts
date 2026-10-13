import { test } from "node:test";
import assert from "node:assert/strict";
import { apiGet } from "../src/helpers.ts";

test("retries a 429 then returns the JSON body", async () => {
  let calls = 0;
  const fetchImpl: typeof fetch = async () => {
    calls++;
    if (calls === 1) {
      return new Response("slow down", { status: 429, headers: { "Retry-After": "0" } });
    }
    return new Response(JSON.stringify({ meta: { count: 1, page: 1 }, results: [{ id: "x" }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  const body = await apiGet("/jobs.json", fetchImpl);
  assert.equal(calls, 2);
  assert.equal(body?.results?.[0]?.id, "x");
});

test("a 404 is null rather than a throw", async () => {
  const fetchImpl: typeof fetch = async () => new Response("gone", { status: 404 });
  assert.equal(await apiGet("/jobs.json?id=aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", fetchImpl), null);
});

test("a connection failure fails fast", async () => {
  const fetchImpl: typeof fetch = async () => {
    throw new Error("connect ECONNREFUSED");
  };
  await assert.rejects(apiGet("/jobs.json", fetchImpl), /could not reach AIPayList/);
});
