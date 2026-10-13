import { describe, test, expect } from "bun:test";
import { runCLI } from "./helpers";

function parsedStderr(stderr: string): { error?: string; code?: string } {
  try {
    return JSON.parse(stderr);
  } catch {
    return {};
  }
}

describe("Consortium LGBT CLI flag validation", () => {
  test("missing --query exits 1 with NO_QUERY", async () => {
    const result = await runCLI(["search"]);
    expect(result.exitCode).not.toBe(0);
    expect(parsedStderr(result.stderr).code).toBe("NO_QUERY");
  });

  test("--page 0 exits 1 with BAD_ARG", async () => {
    const result = await runCLI(["search", "-q", "x", "--page", "0"]);
    expect(result.exitCode).not.toBe(0);
    expect(parsedStderr(result.stderr).code).toBe("BAD_ARG");
  });

  test("--limit fractional exits 1 with BAD_ARG instead of truncating", async () => {
    const result = await runCLI(["search", "-q", "x", "--limit", "1.5"]);
    expect(result.exitCode).not.toBe(0);
    expect(parsedStderr(result.stderr).code).toBe("BAD_ARG");
  });

  test("a bogus --flag exits 1 with UNKNOWN_FLAG", async () => {
    const result = await runCLI(["search", "-q", "test", "--bogus-flag", "xyz"]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    const error = JSON.parse(result.stderr);
    expect(error.code).toBe("UNKNOWN_FLAG");
    expect(error.error).toContain("--bogus-flag");
  });

  test("detail without an id exits 1 with NO_ID", async () => {
    const result = await runCLI(["detail"]);
    expect(result.exitCode).not.toBe(0);
    expect(parsedStderr(result.stderr).code).toBe("NO_ID");
  });

  test("detail rejects a foreign-host URL with BAD_ID (network-free)", async () => {
    const result = await runCLI(["detail", "https://boards.greenhouse.io/acme/jobs/4567890"]);
    expect(result.exitCode).toBe(1);
    expect(parsedStderr(result.stderr).code).toBe("BAD_ID");
  });
});
