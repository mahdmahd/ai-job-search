import { describe, test, expect } from "bun:test";
import { runCLI } from "./helpers";

function err(result: { stderr: string }): { error?: string; code?: string } {
  try {
    return JSON.parse(result.stderr);
  } catch {
    return {};
  }
}

describe("jobsacuk CLI flag validation", () => {
  test("search without --query exits 1 with MISSING_REQUIRED", async () => {
    const result = await runCLI(["search", "--limit", "1"]);
    expect(result.exitCode).toBe(1);
    expect(err(result).code).toBe("MISSING_REQUIRED");
    expect(err(result).error).toMatch(/--query/);
  });

  test("unknown flag exits 1 with UNKNOWN_FLAG", async () => {
    const result = await runCLI(["search", "-q", "x", "--bogus", "1"]);
    expect(result.exitCode).toBe(1);
    expect(err(result).code).toBe("UNKNOWN_FLAG");
  });

  test("--jobage is rejected as unknown (portal has no posting-age param)", async () => {
    const result = await runCLI(["search", "-q", "x", "--jobage", "7"]);
    expect(result.exitCode).toBe(1);
    expect(err(result).code).toBe("UNKNOWN_FLAG");
  });

  test("--page fractional exits 1 (no silent truncation to page 1)", async () => {
    const result = await runCLI(["search", "-q", "x", "--page", "1.5"]);
    expect(result.exitCode).toBe(1);
    expect(err(result).code).toBe("VALIDATION");
  });

  test("--page 0 exits 1", async () => {
    const result = await runCLI(["search", "-q", "x", "--page", "0"]);
    expect(result.exitCode).toBe(1);
    expect(err(result).code).toBe("VALIDATION");
  });

  test("--limit non-numeric exits 1", async () => {
    const result = await runCLI(["search", "-q", "x", "--limit", "many"]);
    expect(result.exitCode).toBe(1);
    expect(err(result).code).toBe("VALIDATION");
  });

  test("bad --format exits 1", async () => {
    const result = await runCLI(["search", "-q", "x", "--format", "xml"]);
    expect(result.exitCode).toBe(1);
    expect(err(result).code).toBe("VALIDATION");
  });

  test("detail without an id exits 1", async () => {
    const result = await runCLI(["detail"]);
    expect(result.exitCode).toBe(1);
    expect(err(result).code).toBe("MISSING_REQUIRED");
  });

  test("unknown command exits 1 with BAD_CMD", async () => {
    const result = await runCLI(["frobnicate"]);
    expect(result.exitCode).toBe(1);
    expect(err(result).code).toBe("BAD_CMD");
  });

  test("no command prints help and exits 1", async () => {
    const result = await runCLI([]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toMatch(/USAGE/);
  });
});
