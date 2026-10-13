import { test } from "node:test";
import assert from "node:assert/strict";
import { runSearch } from "../src/commands/search.ts";
import { runDetail } from "../src/commands/detail.ts";

const JOB = {
  id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  title: "AI Writing Evaluator",
  company: "Mercor",
  location: "Worldwide",
  date: "2026-09-01T12:00:00Z",
  url: "https://aipaylist.com/jobs/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  description:
    'Grade essays. Pay: up to $65/hr. This figure is an advertised ceiling ("up to"), not a guaranteed rate.',
  is_up_to: true,
  pay_raw: "Up to $65/hr",
  pay_unit: "hourly",
  pay_min: null,
  pay_max: 65,
  pay_display: "up to $65/hr",
};

function jsonFetch(body: unknown, status = 200): typeof fetch {
  return async () =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

test("search json is { meta, results } with contract fields and no salary", async () => {
  const chunks: string[] = [];
  const orig = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: string | Uint8Array) => {
    chunks.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;
  try {
    const code = await runSearch({
      query: "writer",
      page: 1,
      limit: 5,
      format: "json",
      fetchImpl: jsonFetch({ meta: { count: 1, page: 1, total: 1 }, results: [JOB] }),
    });
    assert.equal(code, 0);
  } finally {
    process.stdout.write = orig;
  }
  const parsed = JSON.parse(chunks.join(""));
  assert.equal(parsed.meta.count, 1);
  assert.equal(parsed.results[0].id, JOB.id);
  assert.equal(parsed.results[0].url, JOB.url);
  assert.equal(parsed.results[0].company, "Mercor");
  assert.equal(parsed.results[0].is_up_to, true);
  assert.equal(JSON.stringify(parsed).includes('"salary"'), false);
});

test("detail 404 is NOT_FOUND on stderr", async () => {
  const err: string[] = [];
  const orig = process.stderr.write.bind(process.stderr);
  process.stderr.write = ((chunk: string | Uint8Array) => {
    err.push(String(chunk));
    return true;
  }) as typeof process.stderr.write;
  try {
    const code = await runDetail({
      id: JOB.id,
      format: "json",
      fetchImpl: jsonFetch({ error: "job not found", code: "NOT_FOUND" }, 404),
    });
    assert.equal(code, 1);
  } finally {
    process.stderr.write = orig;
  }
  assert.equal(JSON.parse(err.join("")).code, "NOT_FOUND");
});
