import { describe, test, expect } from "bun:test";
import { runCLI } from "./helpers";

// All validation paths fail before any network fetch, so these tests are
// network-free. add-portal.md's contract: "a bogus flag or missing required
// arg exits 1 with a JSON error on stderr."

function parsedStderr(stderr: string): { error?: string; code?: string } {
  try {
    return JSON.parse(stderr);
  } catch {
    return {};
  }
}

describe("chroniclejobs CLI flag validation", () => {
  describe("required query", () => {
    test("missing --query exits 1 with NO_QUERY", async () => {
      const result = await runCLI(["search"]);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      const err = parsedStderr(result.stderr);
      expect(err.code).toBe("NO_QUERY");
      expect(err.error).toMatch(/--query/);
    });

    test("--query with no value is parsed as a boolean and exits 1 with NO_QUERY", async () => {
      const result = await runCLI(["search", "-q"]);
      expect(result.exitCode).toBe(1);
      expect(parsedStderr(result.stderr).code).toBe("NO_QUERY");
    });
  });

  describe("numeric flag validation", () => {
    test("--page non-numeric exits 1 with BAD_ARG", async () => {
      const result = await runCLI(["search", "-q", "dean", "--page", "abc"]);
      expect(result.exitCode).toBe(1);
      const err = parsedStderr(result.stderr);
      expect(err.code).toBe("BAD_ARG");
      expect(err.error).toMatch(/page/);
    });

    test("--limit non-numeric exits 1 with BAD_ARG", async () => {
      const result = await runCLI(["search", "-q", "dean", "--limit", "xyz"]);
      expect(result.exitCode).toBe(1);
      expect(parsedStderr(result.stderr).code).toBe("BAD_ARG");
    });

    // Fractional values must be rejected, not truncated: parseInt("0.5") is 0,
    // and page 0 would silently request the portal's default page instead of
    // the one the user asked for.
    for (const name of ["page", "limit"]) {
      test(`--${name} fractional exits 1 with BAD_ARG instead of truncating`, async () => {
        const result = await runCLI(["search", "-q", "dean", `--${name}`, "1.5"]);
        expect(result.exitCode).toBe(1);
        const err = parsedStderr(result.stderr);
        expect(err.code).toBe("BAD_ARG");
        expect(err.error).toMatch(new RegExp(name));
      });

      test(`--${name} 0 exits 1 with BAD_ARG`, async () => {
        const result = await runCLI(["search", "-q", "dean", `--${name}`, "0"]);
        expect(result.exitCode).toBe(1);
        expect(parsedStderr(result.stderr).code).toBe("BAD_ARG");
      });
    }
  });

  describe("--format validation", () => {
    test("an unsupported format exits 1 with BAD_ARG instead of silently falling back", async () => {
      const result = await runCLI(["search", "-q", "dean", "--format", "xml"]);
      expect(result.exitCode).toBe(1);
      const err = parsedStderr(result.stderr);
      expect(err.code).toBe("BAD_ARG");
      expect(err.error).toMatch(/xml/);
    });

    test("detail rejects formats outside json|plain", async () => {
      const result = await runCLI(["detail", "38047649", "--format", "table"]);
      expect(result.exitCode).toBe(1);
      const err = parsedStderr(result.stderr);
      expect(err.code).toBe("BAD_ARG");
    });
  });

  describe("unknown flag rejection", () => {
    // There is deliberately no --jobage or --location flag on this portal: the
    // site exposes no posting-age filter, and there is no implemented location
    // parameter. A wrong flag name must error, not be silently discarded — on
    // jobdanmark a discarded flag once returned the entire database as if it
    // matched the query (review finding F13, 2026-08-19).
    test("a bogus --flag exits 1 with a JSON error instead of being silently discarded", async () => {
      const result = await runCLI(["search", "-q", "dean", "--bogus-flag", "xyz"]);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      const err = JSON.parse(result.stderr);
      expect(err.code).toBe("UNKNOWN_FLAG");
      expect(err.error).toContain("--bogus-flag");
    });

    for (const flag of ["--jobage", "--location", "--remote"]) {
      test(`${flag} is rejected with UNKNOWN_FLAG (unsupported on this portal)`, async () => {
        const result = await runCLI(["search", "-q", "dean", flag, "7"]);
        expect(result.exitCode).toBe(1);
        expect(parsedStderr(result.stderr).code).toBe("UNKNOWN_FLAG");
      });
    }
  });

  describe("detail input", () => {
    test("missing id exits 1 with NO_ID", async () => {
      const result = await runCLI(["detail"]);
      expect(result.exitCode).toBe(1);
      expect(parsedStderr(result.stderr).code).toBe("NO_ID");
    });
  });

  describe("commands", () => {
    test("unknown command exits 1 with BAD_CMD", async () => {
      const result = await runCLI(["frobnicate"]);
      expect(result.exitCode).toBe(1);
      expect(parsedStderr(result.stderr).code).toBe("BAD_CMD");
    });

    test("--help exits 0 and prints usage without hitting the network", async () => {
      const result = await runCLI(["search", "--help"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("USAGE");
    });
  });
});
