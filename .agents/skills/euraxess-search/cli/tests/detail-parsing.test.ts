import { afterEach, describe, expect, test } from "bun:test";
import { normalizeId, runDetail } from "../src/commands/detail";
import { parseJobDetail } from "../src/helpers";
import { DETAIL_PAGE, SEARCH_AS_DETAIL } from "./fixtures";

describe("normalizeId", () => {
  test("accepts a bare numeric id", () => {
    expect(normalizeId("472465")).toBe("472465");
  });

  test("accepts a EURAXESS job URL with or without scheme", () => {
    expect(normalizeId("https://euraxess.ec.europa.eu/jobs/472465")).toBe(
      "472465",
    );
    expect(normalizeId("euraxess.ec.europa.eu/jobs/472465")).toBe("472465");
    expect(normalizeId("/jobs/472465")).toBe("472465");
  });

  test("rejects look-alike hosts and userinfo tricks", () => {
    expect(normalizeId("https://euraxess.ec.europa.eu.evil.io/jobs/1")).toBeNull();
    expect(normalizeId("https://euraxess.ec.europa.eu@evil.io/jobs/1")).toBeNull();
    expect(normalizeId("https://greenhouse.io/jobs/472465")).toBeNull();
  });

  test("rejects junk", () => {
    expect(normalizeId("not-a-job")).toBeNull();
    expect(normalizeId("")).toBeNull();
  });
});

describe("parseJobDetail (fixture markup)", () => {
  const job = parseJobDetail(DETAIL_PAGE, "472465");
  test("parses the detail page", () => {
    expect(job).not.toBeNull();
  });
  if (!job) throw new Error("fixture detail page failed to parse");

  test("extracts title, organisation, country and posted date", () => {
    expect(job.title).toBe("PhD Candidate on Resilient Coastal Structures");
    expect(job.company).toBe("TU Delft");
    expect(job.country).toBe("Netherlands");
    expect(job.location).toBe("Netherlands");
    expect(job.date).toBe("13 Oct 2026");
  });

  test("prefers the ISO deadline attribute", () => {
    expect(job.deadline).toBe("2026-11-01T23:59:59+00:00");
  });

  test("extracts job-information fields", () => {
    expect(job.department).toBe("Hydraulic Engineering");
    expect(job.researcherProfile).toBe("First Stage Researcher (R1)");
    expect(job.positions).toBe("PhD Positions");
    expect(job.contractType).toBe("Temporary");
    expect(job.jobStatus).toBe("Full-time");
    expect(job.researchField).toContain("Engineering");
  });

  test("keeps paragraph breaks in the offer description, entities decoded", () => {
    expect(job.description).toContain(
      "hydraulic engineering & coastal resilience",
    );
    expect(job.description).toMatch(/resilience\.\n+The PhD will develop/);
    // Heading text must not leak into the section content.
    expect(job.description).not.toContain("Offer Description");
    expect(job.workLocations).not.toContain("Work Location");
  });

  test("extracts apply email and work locations", () => {
    expect(job.applyEmail).toBe("bureau-tud@tudelft.nl");
    expect(job.workLocations).toContain("Stevinweg 1");
  });
});

describe("DETAIL_BLOCKED path", () => {
  test("a search-page body (redirect landing / stub) parses to null", () => {
    expect(parseJobDetail(SEARCH_AS_DETAIL, "472465")).toBeNull();
  });

  test("runDetail writes the documented stderr JSON and exits 1", async () => {
    const originalFetch = globalThis.fetch;
    const originalWrite = process.stderr.write.bind(process.stderr);
    let stderr = "";
    process.stderr.write = ((chunk: string | Uint8Array) => {
      stderr += String(chunk);
      return true;
    }) as typeof process.stderr.write;
    globalThis.fetch = (async () =>
      new Response(SEARCH_AS_DETAIL, { status: 200 })) as unknown as typeof fetch;

    try {
      const code = await runDetail({ id: "472465", format: "plain" });
      expect(code).toBe(1);
      const err = JSON.parse(stderr.trim()) as { error: string; code: string };
      expect(err.code).toBe("DETAIL_BLOCKED");
      expect(err.error).toContain("did not serve a detail page");
      expect(err.error).toContain("472465");
    } finally {
      globalThis.fetch = originalFetch;
      process.stderr.write = originalWrite;
    }
  });

  test("404 (empty body) yields NOT_FOUND, never a crash", async () => {
    const originalFetch = globalThis.fetch;
    const originalWrite = process.stderr.write.bind(process.stderr);
    let stderr = "";
    process.stderr.write = ((chunk: string | Uint8Array) => {
      stderr += String(chunk);
      return true;
    }) as typeof process.stderr.write;
    globalThis.fetch = (async () =>
      new Response("", { status: 404 })) as unknown as typeof fetch;

    try {
      const code = await runDetail({ id: "999999", format: "plain" });
      expect(code).toBe(1);
      const err = JSON.parse(stderr.trim()) as { error: string; code: string };
      expect(err.code).toBe("NOT_FOUND");
    } finally {
      globalThis.fetch = originalFetch;
      process.stderr.write = originalWrite;
    }
  });
});
