import { describe, test, expect } from "bun:test";
import { runCLI } from "./helpers";

// Network-free contract checks: missing required arg, bogus flag, bad numeric
// values. Rejection happens before dispatch (or with a stubbed-free guard), so
// these never touch latinosinhighered.com.

function parsedStderr(stderr: string): { error?: string; code?: string } {
  try {
    return JSON.parse(stderr);
  } catch {
    return {};
  }
}

describe("CLI flag validation", () => {
  test("missing --query exits 1 with NO_QUERY and empty stdout", async () => {
    const result = await runCLI(["search"]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    const err = parsedStderr(result.stderr);
    expect(err.code).toBe("NO_QUERY");
    expect(err.error).toContain("--query");
  });

  test("blank --query exits 1 with NO_QUERY", async () => {
    const result = await runCLI(["search", "-q", "   "]);
    expect(result.exitCode).toBe(1);
    expect(parsedStderr(result.stderr).code).toBe("NO_QUERY");
  });

  test("detail without an id exits 1 with NO_ID", async () => {
    const result = await runCLI(["detail"]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(parsedStderr(result.stderr).code).toBe("NO_ID");
  });

  test("unknown command exits 1 with BAD_CMD", async () => {
    const result = await runCLI(["frobnicate"]);
    expect(result.exitCode).toBe(1);
    expect(parsedStderr(result.stderr).code).toBe("BAD_CMD");
  });

  for (const name of ["page", "limit"]) {
    test(`--${name} fractional exits 1 with BAD_ARG instead of truncating`, async () => {
      const result = await runCLI(["search", "-q", "test", `--${name}`, "1.5"]);
      expect(result.exitCode).toBe(1);
      const err = parsedStderr(result.stderr);
      expect(err.code).toBe("BAD_ARG");
      expect(err.error).toMatch(new RegExp(name));
    });

    test(`--${name} 0 exits 1 with BAD_ARG`, async () => {
      const result = await runCLI(["search", "-q", "test", `--${name}`, "0"]);
      expect(result.exitCode).toBe(1);
      expect(parsedStderr(result.stderr).code).toBe("BAD_ARG");
    });

    test(`--${name} non-numeric exits 1 with BAD_ARG`, async () => {
      const result = await runCLI(["search", "-q", "test", `--${name}`, "abc"]);
      expect(result.exitCode).toBe(1);
      expect(parsedStderr(result.stderr).code).toBe("BAD_ARG");
    });
  }

  test("valid numeric flags pass validation (proven offline via the unknown-flag guard)", async () => {
    // The guard runs before dispatch, so naming a bogus flag alongside valid
    // ones proves the valid ones parsed without reaching the network: the
    // error must name only --bogus-flag.
    const result = await runCLI(["search", "-q", "test", "--page", "1", "--limit", "5", "--bogus-flag", "xyz"]);
    expect(result.exitCode).toBe(1);
    const err = parsedStderr(result.stderr);
    expect(err.code).toBe("UNKNOWN_FLAG");
    expect(err.error).toContain("--bogus-flag");
    expect(err.error).not.toContain("--page");
    expect(err.error).not.toContain("--limit");
  });

  test("a bogus --flag exits 1 with a JSON error instead of being silently discarded", async () => {
    const result = await runCLI(["search", "-q", "test", "--bogus-flag", "xyz"]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    const err = parsedStderr(result.stderr);
    expect(err.code).toBe("UNKNOWN_FLAG");
    expect(err.error).toContain("--bogus-flag");
  });

  test("an undeclared short flag exits 1 with a JSON error", async () => {
    const result = await runCLI(["search", "-z", "bogus"]);
    expect(result.exitCode).toBe(1);
    expect(parsedStderr(result.stderr).code).toBe("UNKNOWN_FLAG");
  });

  test("detail rejects unknown flags too", async () => {
    const result = await runCLI(["detail", "179106", "--bogus", "x"]);
    expect(result.exitCode).toBe(1);
    expect(parsedStderr(result.stderr).code).toBe("UNKNOWN_FLAG");
  });

  test("-h prints help with exit 0", async () => {
    const result = await runCLI(["search", "-h"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("USAGE");
  });

  test("bare invocation prints help with exit 1", async () => {
    const result = await runCLI([]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("USAGE");
  });
});
