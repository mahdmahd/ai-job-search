import { describe, test, expect } from "bun:test";
import { runCLI } from "./helpers";

// Every case here fails during flag validation — before any network request —
// so the whole file is offline.

function parsedStderr(stderr: string): { error?: string; code?: string } {
  try {
    return JSON.parse(stderr);
  } catch {
    return {};
  }
}

describe("AACC Jobs CLI flag validation", () => {
  describe("required --query", () => {
    test("missing --query exits 1 with MISSING_REQUIRED and JSON on stderr", async () => {
      const result = await runCLI(["search"]);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      const err = parsedStderr(result.stderr);
      expect(err.code).toBe("MISSING_REQUIRED");
      expect(err.error).toMatch(/query/);
    });

    test("empty --query is treated as missing", async () => {
      const result = await runCLI(["search", "-q", ""]);
      expect(result.exitCode).toBe(1);
      expect(parsedStderr(result.stderr).code).toBe("MISSING_REQUIRED");
    });

    test("--query flag with no value exits 1 with MISSING_REQUIRED", async () => {
      const result = await runCLI(["search", "--query"]);
      expect(result.exitCode).toBe(1);
      expect(parsedStderr(result.stderr).code).toBe("MISSING_REQUIRED");
    });
  });

  describe("numeric flag validation", () => {
    for (const name of ["page", "limit"]) {
      test(`--${name} non-numeric string exits 1 with VALIDATION`, async () => {
        const result = await runCLI(["search", "-q", "adjunct", `--${name}`, "abc"]);
        expect(result.exitCode).toBe(1);
        expect(result.stdout).toBe("");
        const err = parsedStderr(result.stderr);
        expect(err.code).toBe("VALIDATION");
        expect(err.error).toMatch(new RegExp(name));
      });

      // Number(), not parseInt(): truncation would silently drop the flag
      // (e.g. "1.5" -> 1) and change what the search returns.
      test(`--${name} fractional exits 1 with VALIDATION instead of truncating`, async () => {
        const result = await runCLI(["search", "-q", "adjunct", `--${name}`, "1.5"]);
        expect(result.exitCode).toBe(1);
        const err = parsedStderr(result.stderr);
        expect(err.code).toBe("VALIDATION");
        expect(err.error).toMatch(new RegExp(name));
      });

      test(`--${name} 0 exits 1 with VALIDATION`, async () => {
        const result = await runCLI(["search", "-q", "adjunct", `--${name}`, "0"]);
        expect(result.exitCode).toBe(1);
        expect(parsedStderr(result.stderr).code).toBe("VALIDATION");
      });

      test(`--${name} boolean (no value) exits 1 with VALIDATION`, async () => {
        const result = await runCLI(["search", "-q", "adjunct", `--${name}`]);
        expect(result.exitCode).toBe(1);
        expect(parsedStderr(result.stderr).code).toBe("VALIDATION");
      });
    }
  });

  describe("--format validation", () => {
    test("--format yaml exits 1 with VALIDATION", async () => {
      const result = await runCLI(["search", "-q", "adjunct", "--format", "yaml"]);
      expect(result.exitCode).toBe(1);
      expect(parsedStderr(result.stderr).code).toBe("VALIDATION");
    });
  });

  describe("unknown flag rejection", () => {
    // add-portal.md's contract: "a bogus flag or missing required arg exits 1
    // with a JSON error on stderr". A silently discarded flag is worse than an
    // error: a wrong flag name silently changes what the search returns.
    test("a bogus --flag exits 1 with a JSON error instead of being silently discarded", async () => {
      const result = await runCLI(["search", "-q", "adjunct", "--bogus-flag", "xyz"]);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      const error = JSON.parse(result.stderr);
      expect(error.code).toBe("UNKNOWN_FLAG");
      expect(error.error).toContain("--bogus-flag");
    });

    test("--location is rejected loudly (no server-side location param; put the place in --query)", async () => {
      const result = await runCLI(["search", "-q", "adjunct", "--location", "Texas"]);
      expect(result.exitCode).toBe(1);
      expect(parsedStderr(result.stderr).code).toBe("UNKNOWN_FLAG");
    });
  });

  describe("detail input validation", () => {
    test("detail without an id exits 1 with MISSING_REQUIRED", async () => {
      const result = await runCLI(["detail"]);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      const err = parsedStderr(result.stderr);
      expect(err.code).toBe("MISSING_REQUIRED");
      expect(err.error).toMatch(/id/);
    });

    test("detail --format yaml exits 1 with VALIDATION", async () => {
      const result = await runCLI(["detail", "623296164", "--format", "yaml"]);
      expect(result.exitCode).toBe(1);
      expect(parsedStderr(result.stderr).code).toBe("VALIDATION");
    });
  });

  describe("unknown command", () => {
    test("a bogus command exits 1 with BAD_CMD", async () => {
      const result = await runCLI(["frobnicate"]);
      expect(result.exitCode).toBe(1);
      expect(parsedStderr(result.stderr).code).toBe("BAD_CMD");
    });
  });
});
