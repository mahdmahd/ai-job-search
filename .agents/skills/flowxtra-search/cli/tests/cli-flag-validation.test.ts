// Network-free: every case here fails argument validation before any fetch.
import { describe, expect, test } from "bun:test";
import { runCLI } from "./helpers";

function stderrJSON(stderr: string): { error: string; code: string } {
  return JSON.parse(stderr);
}

describe("CLI flag validation (no network)", () => {
  test("no command prints help and exits 1", async () => {
    const res = await runCLI([]);
    expect(res.exitCode).toBe(1);
    expect(res.stdout).toContain("USAGE");
  });

  test("unknown command exits 1 with a JSON error on stderr", async () => {
    const res = await runCLI(["frobnicate"]);
    expect(res.exitCode).toBe(1);
    expect(stderrJSON(res.stderr).code).toBe("BAD_CMD");
  });

  test("detail without an id exits 1 with NO_ID", async () => {
    const res = await runCLI(["detail"]);
    expect(res.exitCode).toBe(1);
    expect(stderrJSON(res.stderr).code).toBe("NO_ID");
  });

  test("detail with an unparseable id exits 1 with BAD_ID", async () => {
    const res = await runCLI(["detail", "https://example.com/not-a-flowxtra-url"]);
    expect(res.exitCode).toBe(1);
    expect(stderrJSON(res.stderr).code).toBe("BAD_ID");
  });

  test("search with a non-numeric --page exits 1 with BAD_ARG", async () => {
    const res = await runCLI(["search", "--page", "abc"]);
    expect(res.exitCode).toBe(1);
    expect(stderrJSON(res.stderr).code).toBe("BAD_ARG");
  });

  test("search with a non-numeric --jobage exits 1 with BAD_ARG", async () => {
    const res = await runCLI(["search", "--jobage", "soon"]);
    expect(res.exitCode).toBe(1);
    expect(stderrJSON(res.stderr).code).toBe("BAD_ARG");
  });

  test("search with an invalid --workplace exits 1 with BAD_ARG", async () => {
    const res = await runCLI(["search", "--workplace", "Office"]);
    expect(res.exitCode).toBe(1);
    const err = stderrJSON(res.stderr);
    expect(err.code).toBe("BAD_ARG");
    expect(err.error).toContain("On-site");
  });

  test("errors go to stderr only, never stdout", async () => {
    const res = await runCLI(["search", "--workplace", "Office"]);
    expect(res.stdout).toBe("");
  });
});
