import { describe, test, expect } from "bun:test";
import { runCLI } from "./helpers";

// Contract tests from add-portal.md: a bogus flag or a missing required arg
// exits 1 with a JSON error on stderr. All of these fail before any network
// request, so they are offline-safe.

describe("insidehighered CLI flag validation", () => {
  test("search without --query exits 1 with NO_QUERY on stderr", async () => {
    const result = await runCLI(["search"]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr)).toMatchObject({ code: "NO_QUERY" });
  });

  test("search with a blank --query exits 1 with NO_QUERY", async () => {
    const result = await runCLI(["search", "-q", "   "]);
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stderr)).toMatchObject({ code: "NO_QUERY" });
  });

  test("a bogus --flag exits 1 with UNKNOWN_FLAG instead of being silently discarded", async () => {
    const result = await runCLI(["search", "-q", "test", "--bogus-flag", "xyz"]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    const error = JSON.parse(result.stderr);
    expect(error.code).toBe("UNKNOWN_FLAG");
    expect(error.error).toContain("--bogus-flag");
  });

  for (const name of ["page", "limit"]) {
    test(`--${name} non-numeric exits 1 with BAD_ARG`, async () => {
      const result = await runCLI(["search", "-q", "test", `--${name}`, "foo"]);
      expect(result.exitCode).not.toBe(0);
      const err = JSON.parse(result.stderr);
      expect(err.code).toBe("BAD_ARG");
      expect(err.error).toMatch(new RegExp(name));
    });

    test(`--${name} fractional exits 1 with BAD_ARG instead of truncating`, async () => {
      const result = await runCLI(["search", "-q", "test", `--${name}`, "1.5"]);
      expect(result.exitCode).not.toBe(0);
      expect(JSON.parse(result.stderr).code).toBe("BAD_ARG");
    });

    test(`--${name} 0 exits 1 with BAD_ARG`, async () => {
      const result = await runCLI(["search", "-q", "test", `--${name}`, "0"]);
      expect(result.exitCode).not.toBe(0);
      expect(JSON.parse(result.stderr).code).toBe("BAD_ARG");
    });
  }

  test("detail without an id exits 1 with NO_ID", async () => {
    const result = await runCLI(["detail"]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr)).toMatchObject({ code: "NO_ID" });
  });

  test("an unknown command exits 1 with BAD_CMD", async () => {
    const result = await runCLI(["frobnicate"]);
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stderr)).toMatchObject({ code: "BAD_CMD" });
  });
});
