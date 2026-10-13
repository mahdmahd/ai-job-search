import { describe, test, expect } from "bun:test";
import { runCLI } from "./helpers";

function parsedStderr(stderr: string): { error?: string; code?: string } {
  try {
    return JSON.parse(stderr);
  } catch {
    return {};
  }
}

describe("EuroScienceJobs CLI flag validation", () => {
  test("search without -q exits 1 with NO_QUERY", async () => {
    const result = await runCLI(["search"]);
    expect(result.exitCode).toBe(1);
    expect(parsedStderr(result.stderr).code).toBe("NO_QUERY");
  });

  test("detail without id exits 1 with NO_ID", async () => {
    const result = await runCLI(["detail"]);
    expect(result.exitCode).toBe(1);
    expect(parsedStderr(result.stderr).code).toBe("NO_ID");
  });

  test("bogus flag exits 1 with UNKNOWN_FLAG (never silently ignored)", async () => {
    const result = await runCLI([
      "search",
      "-q",
      "postdoc",
      "--bogus-flag",
      "xyz",
    ]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    const error = JSON.parse(result.stderr);
    expect(error.code).toBe("UNKNOWN_FLAG");
    expect(error.error).toContain("--bogus-flag");
  });

  for (const name of ["jobage", "page", "limit"]) {
    test(`--${name} fractional exits 1 with BAD_ARG instead of truncating`, async () => {
      const result = await runCLI(["search", "-q", "postdoc", `--${name}`, "1.5"]);
      expect(result.exitCode).toBe(1);
      const err = parsedStderr(result.stderr);
      expect(err.code).toBe("BAD_ARG");
      expect(err.error).toMatch(new RegExp(name));
    });

    test(`--${name} 0 exits 1 with BAD_ARG`, async () => {
      const result = await runCLI(["search", "-q", "postdoc", `--${name}`, "0"]);
      expect(result.exitCode).toBe(1);
      expect(parsedStderr(result.stderr).code).toBe("BAD_ARG");
    });

    test(`--${name} non-numeric exits 1 with BAD_ARG`, async () => {
      const result = await runCLI(["search", "-q", "postdoc", `--${name}`, "abc"]);
      expect(result.exitCode).toBe(1);
      expect(parsedStderr(result.stderr).code).toBe("BAD_ARG");
    });
  }

  test("detail with unparseable id exits 1 with BAD_ID", async () => {
    const result = await runCLI(["detail", "not-a-job"]);
    expect(result.exitCode).toBe(1);
    expect(parsedStderr(result.stderr).code).toBe("BAD_ID");
  });

  test("unknown command exits 1 with BAD_CMD", async () => {
    const result = await runCLI(["frobnicate"]);
    expect(result.exitCode).toBe(1);
    expect(parsedStderr(result.stderr).code).toBe("BAD_CMD");
  });
});
