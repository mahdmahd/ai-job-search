import { describe, expect, test } from "bun:test";
import {
  extractJobPosting,
  normalizeEmploymentType,
  parseJobDetail,
  descriptionToText,
} from "../src/helpers";

const JSONLD_FIXTURE = `
<html><head>
<script type="application/ld+json">
{"@context":"http://schema.org/","@type":"Organization","name":"AACC Jobs"}
</script>
<script type="application/ld+json">
{"@context":"http://schema.org/","@type":"JobPosting",
 "title":"Adjunct Faculty, Biology",
 "datePosted":"2026-10-09",
 "validThrough":"2026-12-09T00:00:00.000Z",
 "employmentType":"Part Time",
 "description":"<p>Teach <strong>introductory biology</strong> labs.</p><p>Apply today.</p>",
 "hiringOrganization":{"@type":"Organization","name":"Desert College"},
 "jobLocation":{"@type":"Place","address":{"@type":"PostalAddress","addressLocality":"Palm Desert","addressRegion":"California","addressCountry":"US"}}}
</script>
</head><body>
<h1>Adjunct Faculty, Biology</h1>
<a class="apply-button btn btn-success external_apply" href="https://apptrkr.com/12345">Apply to this Job</a>
</body></html>`;

describe("JSON-LD detail parsing (offline fixture)", () => {
  test("picks the JobPosting script, skipping the Organization one", () => {
    const posting = extractJobPosting(JSONLD_FIXTURE);
    expect(posting).not.toBeNull();
    expect(posting?.["@type"]).toBe("JobPosting");
    expect(posting?.["title"]).toBe("Adjunct Faculty, Biology");
  });

  test("parseJobDetail prefers JSON-LD structured fields", () => {
    const job = parseJobDetail(JSONLD_FIXTURE, "621000001", "https://jobs.aacc.nche.edu/jobs/621000001");
    expect(job).toMatchObject({
      id: "621000001",
      title: "Adjunct Faculty, Biology",
      company: "Desert College",
      location: "Palm Desert, California, US",
      date: "2026-10-09",
      deadline: "2026-12-09T00:00:00.000Z",
      employmentType: "Part Time",
      applyUrl: "https://apptrkr.com/12345",
    });
    expect(job.description).toContain("introductory biology");
    expect(job.description).not.toContain("<p>");
  });

  test("invalid JSON-LD scripts are skipped, not fatal", () => {
    const html = `<script type="application/ld+json">{broken</script>` + JSONLD_FIXTURE;
    expect(extractJobPosting(html)?.["@type"]).toBe("JobPosting");
  });

  test("no JSON-LD degrades to HTML fallbacks without crashing", () => {
    const job = parseJobDetail("<html><body><h1>Some Role</h1></body></html>", "1", "https://x/jobs/1");
    expect(job.title).toBe("Some Role");
    expect(job.company).toBeNull();
    expect(job.location).toBeNull();
    expect(job.date).toBeNull();
  });
});

describe("normalizeEmploymentType", () => {
  test("plain strings pass through; arrays join", () => {
    expect(normalizeEmploymentType("Full Time")).toBe("Full Time");
    expect(normalizeEmploymentType(["FULL_TIME", "PART_TIME"])).toBe("FULL_TIME, PART_TIME");
  });
  test("JSON-encoded array string is decoded", () => {
    expect(normalizeEmploymentType('["FULL_TIME"]')).toBe("FULL_TIME");
  });
  test("null/empty degrades to null", () => {
    expect(normalizeEmploymentType(null)).toBeNull();
    expect(normalizeEmploymentType("  ")).toBeNull();
  });
});

describe("descriptionToText", () => {
  test("strips tags, keeps paragraph breaks, decodes entities", () => {
    expect(descriptionToText("<p>A &amp; B</p><p>C</p>")).toBe("A & B\nC");
    expect(descriptionToText("")).toBeNull();
  });
});
