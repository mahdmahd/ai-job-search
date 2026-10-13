import { test } from "node:test";
import assert from "node:assert/strict";
import { main } from "../src/cli.ts";

function parsedStderr(stderr: string): { error?: string; code?: string } {
  try {
    return JSON.parse(stderr);
  } catch {
    return {};
  }
}

async function run(args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  const out: string[] = [];
  const err: string[] = [];
  const so = process.stdout.write;
  const se = process.stderr.write;
  process.stdout.write = ((chunk: string | Uint8Array) => {
    out.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: string | Uint8Array) => {
    err.push(String(chunk));
    return true;
  }) as typeof process.stderr.write;
  try {
    const code = await main(args);
    return { stdout: out.join("").trim(), stderr: err.join("").trim(), code };
  } finally {
    process.stdout.write = so;
    process.stderr.write = se;
  }
}

test("non-numeric jobage/page/limit exit 1 with BAD_ARG", async () => {
  for (const name of ["jobage", "page", "limit"]) {
    const result = await run(["search", `--${name}`, "foo"]);
    assert.notEqual(result.code, 0);
    const err = parsedStderr(result.stderr);
    assert.equal(err.code, "BAD_ARG");
    assert.match(err.error ?? "", new RegExp(name));
  }
});

test("fractional jobage/page/limit exit 1 with BAD_ARG instead of truncating", async () => {
  for (const name of ["jobage", "page", "limit"]) {
    const result = await run(["search", `--${name}`, "1.5"]);
    assert.notEqual(result.code, 0);
    assert.equal(parsedStderr(result.stderr).code, "BAD_ARG");
  }
});

test("--jobage 0 exits 1 with BAD_ARG", async () => {
  const result = await run(["search", "--jobage", "0"]);
  assert.notEqual(result.code, 0);
  assert.equal(parsedStderr(result.stderr).code, "BAD_ARG");
});

test("missing detail id exits 1 with NO_ID", async () => {
  const result = await run(["detail"]);
  assert.equal(result.code, 1);
  assert.equal(parsedStderr(result.stderr).code, "NO_ID");
});

test("an unparseable id exits 1 with BAD_ID (no network)", async () => {
  const result = await run(["detail", "not a slug!"]);
  assert.equal(result.code, 1);
  assert.equal(parsedStderr(result.stderr).code, "BAD_ID");
});

test("unknown command exits 1 with BAD_CMD", async () => {
  const result = await run(["frobnicate"]);
  assert.equal(result.code, 1);
  assert.equal(parsedStderr(result.stderr).code, "BAD_CMD");
});

test("no command prints help and exits 1", async () => {
  const result = await run([]);
  assert.equal(result.code, 1);
  assert.match(result.stdout, /USAGE/);
});

test("a bogus --flag exits 1 with UNKNOWN_FLAG instead of being silently discarded", async () => {
  const result = await run(["search", "--query", "test", "--bogus-flag", "xyz"]);
  assert.equal(result.code, 1);
  assert.equal(result.stdout, "");
  const error = JSON.parse(result.stderr);
  assert.equal(error.code, "UNKNOWN_FLAG");
  assert.match(error.error, /--bogus-flag/);
});

test("--format junk exits 1 with BAD_ARG", async () => {
  const result = await run(["search", "--format", "yaml"]);
  assert.equal(result.code, 1);
  assert.equal(parsedStderr(result.stderr).code, "BAD_ARG");
});
