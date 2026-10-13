import { describe, test, expect } from "bun:test";
import { normalizeId } from "../src/commands/detail";

describe("normalizeId", () => {
  test("accepts a bare REF", () => {
    expect(normalizeId("DSL474")).toEqual({ kind: "ref", value: "DSL474" });
    expect(normalizeId("  dtg082 ")).toEqual({ kind: "ref", value: "dtg082" });
  });

  test("accepts a full jobs.ac.uk URL with or without scheme", () => {
    expect(
      normalizeId("https://www.jobs.ac.uk/job/DSL474/some-slug"),
    ).toEqual({ kind: "ref", value: "DSL474" });
    expect(normalizeId("www.jobs.ac.uk/job/DSL474/some-slug")).toEqual({
      kind: "ref",
      value: "DSL474",
    });
  });

  test("accepts a bare /job/REF path", () => {
    expect(normalizeId("/job/DSL474/some-slug")).toEqual({ kind: "ref", value: "DSL474" });
  });

  test("accepts a numeric advert-id", () => {
    expect(normalizeId("1083631")).toEqual({ kind: "advert", value: "1083631" });
  });

  test("rejects foreign hosts and userinfo tricks before any request", () => {
    expect(normalizeId("https://evil.com/job/DSL474/x")).toBeNull();
    expect(normalizeId("https://jobs.ac.uk.evil.io/job/DSL474/x")).toBeNull();
    expect(normalizeId("https://jobs.ac.uk@evil.io/job/DSL474/x")).toBeNull();
  });

  test("rejects non-job paths and garbage", () => {
    expect(normalizeId("https://www.jobs.ac.uk/search/?keywords=x")).toBeNull();
    expect(normalizeId("not a ref at all!!")).toBeNull();
    expect(normalizeId("")).toBeNull();
  });
});
