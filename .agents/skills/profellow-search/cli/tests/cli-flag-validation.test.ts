import { describe, test, expect } from "bun:test";
import { runCLI } from "./helpers";

function parsedStderr(stderr: string): { error?: string; code?: string } {
  try {
    return JSON.parse(stderr);
  } catch {
    return {};
  }
}

// Network-free: every case here fails (or is rejected) before any fetch.
describe("profellow CLI flag validation", () => {
  describe("missing --query", () => {
    test("search without --query exits 1 with JSON MISSING_REQUIRED on stderr", async () => {
      const result = await runCLI(["search"]);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      const err = parsedStderr(result.stderr);
      expect(err.code).toBe("MISSING_REQUIRED");
      expect(err.error).toMatch(/query/);
    });
  });

  describe("unknown flag rejection", () => {
    // add-portal.md's contract: a bogus flag exits 1 with a JSON error on
    // stderr, never silently discarded. Rejection happens before dispatch.
    test("a bogus --flag exits 1 with UNKNOWN_FLAG instead of being silently discarded", async () => {
      const result = await runCLI(["search", "-q", "test", "--bogus-flag", "xyz"]);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      const error = JSON.parse(result.stderr);
      expect(error.code).toBe("UNKNOWN_FLAG");
      expect(error.error).toContain("--bogus-flag");
    });

    test("--jobage is rejected — cards carry deadlines, no posting date", async () => {
      const result = await runCLI(["search", "-q", "test", "--jobage", "30"]);
      expect(result.exitCode).toBe(1);
      const error = JSON.parse(result.stderr);
      expect(error.code).toBe("UNKNOWN_FLAG");
      expect(error.error).toContain("--jobage");
    });

    test("--location is rejected — the portal has no server-side location param", async () => {
      const result = await runCLI(["search", "-q", "test", "--location", "USA"]);
      expect(result.exitCode).toBe(1);
      const error = JSON.parse(result.stderr);
      expect(error.code).toBe("UNKNOWN_FLAG");
      expect(error.error).toContain("--location");
    });
  });

  describe("numeric flag validation", () => {
    for (const name of ["page", "limit"]) {
      test(`--${name} fractional exits 1 with BAD_ARG instead of truncating`, async () => {
        const result = await runCLI(["search", "-q", "test", `--${name}`, "1.5"]);
        expect(result.exitCode).not.toBe(0);
        const err = parsedStderr(result.stderr);
        expect(err.code).toBe("BAD_ARG");
        expect(err.error).toMatch(new RegExp(name));
      });

      test(`--${name} 0 exits 1 with BAD_ARG`, async () => {
        const result = await runCLI(["search", "-q", "test", `--${name}`, "0"]);
        expect(result.exitCode).not.toBe(0);
        const err = parsedStderr(result.stderr);
        expect(err.code).toBe("BAD_ARG");
        expect(err.error).toMatch(new RegExp(name));
      });

      test(`--${name} boolean flag (no value) exits 1 with BAD_ARG`, async () => {
        const result = await runCLI(["search", "-q", "test", `--${name}`]);
        expect(result.exitCode).not.toBe(0);
        expect(parsedStderr(result.stderr).code).toBe("BAD_ARG");
      });
    }
  });

  describe("detail without an ID", () => {
    test("exits 1 with NO_ID on stderr", async () => {
      const result = await runCLI(["detail"]);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      const err = parsedStderr(result.stderr);
      expect(err.code).toBe("NO_ID");
    });
  });
});
