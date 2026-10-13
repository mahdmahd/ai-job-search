import { describe, expect, test } from "bun:test";
import { jobUrlFor, normalizeId } from "../src/commands/detail";

// normalizeId is the gate between a stored (untrusted) URL and a network fetch.
// It must yield a numeric Chronicle job id or null (-> BAD_ID) — never fetch a
// URL verbatim. The unguarded variant fetched any http(s) URL as given, so a
// non-posting page came back as a well-formed fake posting with exit 0 (the
// jobindex #447 failure mode this guard exists to prevent).

describe("chroniclejobs detail input parsing", () => {
  test("bare numeric id is accepted as-is", () => {
    expect(normalizeId("38047649")).toBe("38047649");
    expect(normalizeId("  38047649  ")).toBe("38047649");
  });

  test("canonical URL with title slug", () => {
    expect(
      normalizeId("https://jobs.chronicle.com/job/38047649/assistant-professor-of-statistics/"),
    ).toBe("38047649");
  });

  test("trailing slash, no slug, and query-string variants", () => {
    expect(normalizeId("https://jobs.chronicle.com/job/38047649/")).toBe("38047649");
    expect(normalizeId("https://jobs.chronicle.com/job/38047649")).toBe("38047649");
    expect(
      normalizeId("https://jobs.chronicle.com/job/38047649/slug?LinkSource=SearchResults"),
    ).toBe("38047649");
  });

  test("scheme- and www-less URL is accepted", () => {
    expect(normalizeId("jobs.chronicle.com/job/38047649/slug/")).toBe("38047649");
  });

  test("an off-host URL is rejected, not fetched", () => {
    expect(normalizeId("https://evil.example/job/38047649/slug/")).toBeNull();
  });

  test("look-alike and userinfo hosts are rejected", () => {
    expect(normalizeId("https://jobs.chronicle.com.evil.example/job/1/s/")).toBeNull();
    expect(normalizeId("https://jobs.chronicle.com@evil.example/job/1/s/")).toBeNull();
  });

  test("an own-host URL without a /job/<id> path is rejected (the fake-posting repro)", () => {
    expect(normalizeId("https://jobs.chronicle.com/")).toBeNull();
    expect(normalizeId("https://jobs.chronicle.com/searchjobs/?Keywords=x")).toBeNull();
  });

  test("garbage bare input is rejected", () => {
    expect(normalizeId("not a slug!")).toBeNull();
    expect(normalizeId("ftp://jobs.chronicle.com/job/1/")).toBeNull();
    expect(normalizeId("job/38047649")).toBeNull();
  });

  test("jobUrlFor rebuilds the canonical slug-free fetch target", () => {
    expect(jobUrlFor("38047649")).toBe("https://jobs.chronicle.com/job/38047649/");
  });
});
