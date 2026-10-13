import { describe, expect, test } from "bun:test";
import { runCLI } from "./helpers";

// Flag validation runs the real CLI as a subprocess — no network is touched
// because validation fails before any request is built.

describe("cli flag validation", () => {
  test("search without -q exits 1 with MISSING_REQUIRED", async () => {
    const r = await runCLI(["search"]);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toBe("");
    const err = JSON.parse(r.stderr) as { error: string; code: string };
    expect(err.code).toBe("MISSING_REQUIRED");
    expect(err.error).toContain("--query/-q");
  });

  test("empty -q is treated as missing", async () => {
    const r = await runCLI(["search", "-q", "   "]);
    expect(r.exitCode).toBe(1);
    expect(JSON.parse(r.stderr).code).toBe("MISSING_REQUIRED");
  });

  test("--location is rejected with UNKNOWN_FLAG (unsupported on EURAXESS)", async () => {
    const r = await runCLI(["search", "-q", "postdoc", "--location", "Delft"]);
    expect(r.exitCode).toBe(1);
    const err = JSON.parse(r.stderr) as { error: string; code: string };
    expect(err.code).toBe("UNKNOWN_FLAG");
    expect(err.error).toContain("--location");
  });

  test("--jobage is rejected with UNKNOWN_FLAG (unsupported on EURAXESS)", async () => {
    const r = await runCLI(["search", "-q", "postdoc", "--jobage", "30"]);
    expect(r.exitCode).toBe(1);
    expect(JSON.parse(r.stderr).code).toBe("UNKNOWN_FLAG");
  });

  test("non-integer --page is rejected with VALIDATION", async () => {
    const r = await runCLI(["search", "-q", "postdoc", "--page", "1.5"]);
    expect(r.exitCode).toBe(1);
    const err = JSON.parse(r.stderr) as { error: string; code: string };
    expect(err.code).toBe("VALIDATION");
    expect(err.error).toContain("--page");
  });

  test("non-integer --limit (NaN) is rejected with VALIDATION", async () => {
    const r = await runCLI(["search", "-q", "postdoc", "--limit", "abc"]);
    expect(r.exitCode).toBe(1);
    expect(JSON.parse(r.stderr).code).toBe("VALIDATION");
  });

  test("zero --page is rejected with VALIDATION (1-indexed)", async () => {
    const r = await runCLI(["search", "-q", "postdoc", "--page", "0"]);
    expect(r.exitCode).toBe(1);
    expect(JSON.parse(r.stderr).code).toBe("VALIDATION");
  });

  test("detail without an id exits 1 with MISSING_REQUIRED", async () => {
    const r = await runCLI(["detail"]);
    expect(r.exitCode).toBe(1);
    expect(JSON.parse(r.stderr).code).toBe("MISSING_REQUIRED");
  });

  test("detail with a non-EURAXESS id exits 1 with BAD_ID", async () => {
    const r = await runCLI(["detail", "not-a-job"]);
    expect(r.exitCode).toBe(1);
    expect(JSON.parse(r.stderr).code).toBe("BAD_ID");
  });

  test("unknown command exits 1 with BAD_CMD", async () => {
    const r = await runCLI(["frobnicate"]);
    expect(r.exitCode).toBe(1);
    expect(JSON.parse(r.stderr).code).toBe("BAD_CMD");
  });

  test("--help prints usage and exits 0", async () => {
    const r = await runCLI(["search", "--help"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("euraxess-cli");
    expect(r.stdout).toContain("PERSONAL USE ONLY");
  });
});
