import { describe, expect, test } from "bun:test";
import { runCLI } from "./helpers";

describe("CLI flag contract", () => {
  test("search without a query fails with JSON on stderr, exit 1", async () => {
    const result = await runCLI(["search"]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    const err = JSON.parse(result.stderr);
    expect(err.code).toBe("MISSING_REQUIRED");
    expect(err.error).toContain("--query");
  });

  test("an unknown flag fails with UNKNOWN_FLAG before making a request", async () => {
    const result = await runCLI(["search", "-q", "postdoc", "--location", "Bogus"]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    const err = JSON.parse(result.stderr);
    expect(err.code).toBe("UNKNOWN_FLAG");
    expect(err.error).toContain("location");
  });

  test("detail without an ID fails with JSON on stderr, exit 1", async () => {
    const result = await runCLI(["detail"]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    const err = JSON.parse(result.stderr);
    expect(err.code).toBe("NO_ID");
  });

  test("a non-integer --page fails with BAD_ARG before making a request", async () => {
    const result = await runCLI(["search", "-q", "postdoc", "--page", "0.5"]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    const err = JSON.parse(result.stderr);
    expect(err.code).toBe("BAD_ARG");
    expect(err.error).toContain("page");
  });

  test("a non-integer --limit fails with BAD_ARG", async () => {
    const result = await runCLI(["search", "-q", "postdoc", "--limit", "abc"]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    const err = JSON.parse(result.stderr);
    expect(err.code).toBe("BAD_ARG");
  });

  test("unknown command fails with BAD_CMD", async () => {
    const result = await runCLI(["frobnicate"]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    const err = JSON.parse(result.stderr);
    expect(err.code).toBe("BAD_CMD");
  });

  test("detail with an off-site URL is rejected without a request", async () => {
    const result = await runCLI(["detail", "https://evil.example.org/job/x-12345/"]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    const err = JSON.parse(result.stderr);
    expect(err.code).toBe("BAD_ID");
  });

  test("--help prints usage and exits 0", async () => {
    const result = await runCLI(["--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("USAGE");
  });
});

describe("normalizeId (via offline detail rejection paths)", () => {
  test("userinfo tricks on the host are rejected", async () => {
    const result = await runCLI(["detail", "https://jobrxiv.org@evil.example.org/job/x/"]);
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stderr).code).toBe("BAD_ID");
  });

  test("look-alike hosts are rejected", async () => {
    const result = await runCLI(["detail", "https://jobrxiv.org.evil.io/job/x/"]);
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stderr).code).toBe("BAD_ID");
  });

  test("a bare slug without dashes is rejected", async () => {
    const result = await runCLI(["detail", "notasluginanycase"]);
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stderr).code).toBe("BAD_ID");
  });
});
