import { describe, expect, test } from "bun:test";
import { parseJobDetail } from "../src/helpers";

// Fixture mirrors the live detail page (verified 2026-10-13): one JSON-LD
// script with @type JobPosting, a canonical link, an /apply/ button whose href
// may carry stray whitespace, and a tracking blob with SalaryDescription /
// LocationDescription fallbacks.
function detailHtml(
  posting: Record<string, unknown> | null,
  opts: {
    canonical?: string;
    applyHref?: string;
    salaryBlob?: string;
    locationBlob?: string;
    extraLd?: string;
  } = {},
): string {
  const {
    canonical = "https://jobs.chronicle.com/job/38047649/assistant-professor/",
    applyHref = "/apply/38047649/assistant-professor?LinkSource=JobDetails",
    salaryBlob,
    locationBlob,
    extraLd,
  } = opts;
  const ld = posting
    ? `<script type="application/ld+json">${JSON.stringify(posting)}</script>`
    : "";
  const extra = extraLd ? `<script type="application/ld+json">${extraLd}</script>` : "";
  const blob = [
    salaryBlob ? `"SalaryDescription": "${salaryBlob}",` : "",
    locationBlob ? `"LocationDescription": "${locationBlob}",` : "",
  ].join("\n");
  return `<!DOCTYPE html><html><head>
    <link rel="canonical" href="${canonical}">
    ${ld}${extra}
    <script>var data = { ${blob} };</script>
  </head><body>
    <a href="${applyHref}" class="apply">Apply</a>
    <div class="mini-lister-item">similar job noise</div>
  </body></html>`;
}

const POSTING: Record<string, unknown> = {
  "@type": "JobPosting",
  title: "Assistant Professor of Statistics",
  description:
    "<p><b>Job Summary:</b> The College is hiring.</p><p>Requirements:</p><ul><li>PhD</li></ul>",
  datePosted: "2026-10-05T22:11:00.000Z",
  validThrough: "2026-12-05T04:59:00.000Z",
  employmentType: '["FULL_TIME"]',
  hiringOrganization: { "@type": "Organization", name: "University of Wisconsin - Madison" },
  jobLocation: [
    {
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        addressLocality: "Madison",
        addressRegion: "Wisconsin",
        addressCountry: "US",
      },
    },
  ],
};

describe("parseJobDetail", () => {
  test("extracts every field from the JSON-LD JobPosting block", () => {
    const job = parseJobDetail(detailHtml(POSTING, { salaryBlob: "Negotiable" }), "38047649");
    expect(job).not.toBeNull();
    expect(job!.id).toBe("38047649");
    expect(job!.title).toBe("Assistant Professor of Statistics");
    expect(job!.company).toBe("University of Wisconsin - Madison");
    expect(job!.location).toBe("Madison, Wisconsin, US");
    expect(job!.date).toBe("2026-10-05T22:11:00.000Z");
    expect(job!.validThrough).toBe("2026-12-05T04:59:00.000Z");
    // JSON-encoded array string is normalized
    expect(job!.employmentType).toBe("FULL_TIME");
    expect(job!.salary).toBe("Negotiable");
    expect(job!.url).toBe("https://jobs.chronicle.com/job/38047649/assistant-professor/");
    expect(job!.applyUrl).toBe(
      "https://jobs.chronicle.com/apply/38047649/assistant-professor?LinkSource=JobDetails",
    );
    // all contract keys present, none omitted
    for (const k of [
      "id", "title", "company", "location", "date", "url",
      "salary", "description", "validThrough", "employmentType", "applyUrl",
    ]) {
      expect(Object.keys(job!)).toContain(k);
    }
  });

  test("keeps paragraph and list breaks in the description, entities decoded", () => {
    const job = parseJobDetail(detailHtml(POSTING), "1");
    const desc = job!.description!;
    expect(desc).toContain("Job Summary:");
    expect(desc).toContain("\n");
    expect(desc).toContain("PhD");
    expect(desc).not.toContain("<p>");
    expect(desc).not.toContain("&amp;");
  });

  test("employmentType as a real array is joined", () => {
    const job = parseJobDetail(
      detailHtml({ ...POSTING, employmentType: ["FULL_TIME", "PART_TIME"] }),
      "2",
    );
    expect(job!.employmentType).toBe("FULL_TIME, PART_TIME");
  });

  test("employmentType as a plain string passes through; missing stays null", () => {
    const a = parseJobDetail(detailHtml({ ...POSTING, employmentType: "FULL_TIME" }), "3");
    expect(a!.employmentType).toBe("FULL_TIME");
    const b = parseJobDetail(
      detailHtml({ ...POSTING, employmentType: undefined }),
      "4",
    );
    expect(b!.employmentType).toBeNull();
  });

  test("falls back to the tracking blob when jobLocation is absent", () => {
    const job = parseJobDetail(
      detailHtml({ ...POSTING, jobLocation: undefined }, { locationBlob: "Los Angeles, California" }),
      "5",
    );
    expect(job!.location).toBe("Los Angeles, California");
  });

  test("apply href with stray whitespace is trimmed and absolutized", () => {
    const job = parseJobDetail(
      detailHtml(POSTING, { applyHref: " \n\t/apply/38047649/slug?LinkSource=JobDetails \n" }),
      "6",
    );
    expect(job!.applyUrl).toBe(
      "https://jobs.chronicle.com/apply/38047649/slug?LinkSource=JobDetails",
    );
  });

  test("a malformed JSON-LD block is skipped, the next valid one is used", () => {
    const job = parseJobDetail(
      detailHtml(POSTING, { extraLd: "{ not json" }),
      "7",
    );
    expect(job!.title).toBe("Assistant Professor of Statistics");
  });

  test("returns null when no JobPosting block exists (NO_JOB_DATA)", () => {
    expect(parseJobDetail(detailHtml(null), "8")).toBeNull();
    expect(
      parseJobDetail(detailHtml({ "@type": "WebPage", name: "x" }), "9"),
    ).toBeNull();
  });

  test("null-valued optional fields stay present, never omitted", () => {
    const bare = {
      "@type": "JobPosting",
      title: "Bare Job",
      description: "text",
      hiringOrganization: { name: "Org" },
    };
    const job = parseJobDetail(detailHtml(bare, { applyHref: "" }), "10");
    expect(job!.salary).toBeNull();
    expect(job!.date).toBeNull();
    expect(job!.validThrough).toBeNull();
    expect(job!.applyUrl).toBeNull();
    expect(job!.location).toBeNull();
  });
});
