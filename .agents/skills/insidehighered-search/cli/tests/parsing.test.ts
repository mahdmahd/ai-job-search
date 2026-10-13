import { describe, expect, test } from "bun:test";
import { normalizeId, parseJobCards, parseJobDetail } from "../src/helpers";

// Offline fixtures transcribed from live careers.insidehighered.com markup
// (verified 2026-10-13). The multi-line href and the class anchors are load-
// bearing: Madgex writes hrefs across several lines and the CLI must trim.

const SEARCH_FIXTURE = `
<div class="lister cf block">
  <li class="lister__item cf" id="item-3509752">
    <div class="lister__details cf js-clickable">
      <h3 class="lister__header"><a

 href="
	/job/3509752/postdoc-in-cancer-immunology/



" class="js-clickable-area-link"><span>Postdoc in Cancer Immunology</span></a></h3>
      <ul class="lister__meta">
        <li class="lister__meta-item lister__meta-item--location">Philadelphia, PA</li>
        <li class="lister__meta-item lister__meta-item--recruiter">University of Pennsylvania</li>
      </ul>
      <p class="lister__description js-clamp-2">Postdoc in Cancer Immunology &amp; related duties</p>
    </div>
  </li>

  <li class="lister__item lister__item--ads">
    <div class="ad ad--mpu block">noise card, no id</div>
  </li>

  <li class="lister__item cf lister__item--logo-in-listing" id="item-3530131">
    <div class="lister__details cf js-clickable">
      <h3 class="lister__header"><a

 href="
	/job/3530131/assistant-professor-of-biology/



" class="js-clickable-area-link"><span>Assistant Professor of Biology</span></a></h3>
      <ul class="lister__meta">
        <li class="lister__meta-item lister__meta-item--location">Cullowhee</li>
        <li class="lister__meta-item lister__meta-item--salary">Based on qualifications/experience.</li>
        <li class="lister__meta-item lister__meta-item--recruiter">Western Carolina University</li>
      </ul>
    </div>
  </li>
</div>
`;

const DETAIL_FIXTURE = `
<html><body>
<h1>Postdoc in Cancer Immunology</h1>
<script type="application/ld+json">
{
  "@context": "https://schema.org/",
  "@type": "JobPosting",
  "title": "Postdoc in Cancer Immunology",
  "description": "<strong>Description:</strong><br />Funding for a postdoctoral fellow.<p>Second &amp; final paragraph.</p>",
  "datePosted": "2026-05-29T04:00:00.000Z",
  "validThrough": "2026-11-11T05:00:00.000Z",
  "hiringOrganization": {"name": "University of Pennsylvania", "@type": "Organization"},
  "jobLocation": [{"@type": "Place", "address": {"@type": "PostalAddress", "addressLocality": "Philadelphia", "addressRegion": "Pennsylvania", "addressCountry": "US"}}],
  "employmentType": "[\\"FULL_TIME\\"]"
}
</script>
<div class="mds-grid-col-6"><a href="/apply/3509752/postdoc-in-cancer-immunology?LinkSource=JobDetails" class="mds-button">No thanks, continue to apply</a></div>
<a href="/external-redirect-registration?JobId=3509752&amp;LinkSource=JobDetails" class="mds-button">Apply on website</a>
</body></html>
`;

describe("parseJobCards", () => {
  const cards = parseJobCards(SEARCH_FIXTURE);

  test("extracts one card per id=item- chunk and skips ad/noise cards", () => {
    expect(cards).toHaveLength(2);
  });

  test("trims the multi-line href into a usable absolute URL", () => {
    expect(cards[0].url).toBe(
      "https://careers.insidehighered.com/job/3509752/postdoc-in-cancer-immunology/",
    );
    expect(cards[0].url).not.toMatch(/\s/);
  });

  test("extracts title, company, location, snippet", () => {
    expect(cards[0].title).toBe("Postdoc in Cancer Immunology");
    expect(cards[0].company).toBe("University of Pennsylvania");
    expect(cards[0].location).toBe("Philadelphia, PA");
    expect(cards[0].snippet).toContain("related duties");
    expect(cards[0].id).toBe("3509752");
  });

  test("salary is null when the card has no salary element, never omitted", () => {
    expect(cards[0].salary).toBeNull();
    expect("salary" in cards[0]).toBe(true);
    expect(cards[1].salary).toBe("Based on qualifications/experience.");
  });

  test("date is null on search cards (no visible date element) and the key is present", () => {
    for (const c of cards) {
      expect("date" in c).toBe(true);
      expect(c.date).toBeNull();
    }
  });

  test("every contract key is present on every card", () => {
    for (const c of cards) {
      for (const k of ["id", "title", "company", "location", "date", "url", "salary", "snippet"]) {
        expect(k in c).toBe(true);
      }
    }
  });
});

describe("parseJobDetail", () => {
  const job = parseJobDetail(DETAIL_FIXTURE, "3509752");

  test("reads title, company and location from JSON-LD", () => {
    expect(job.title).toBe("Postdoc in Cancer Immunology");
    expect(job.company).toBe("University of Pennsylvania");
    expect(job.location).toBe("Philadelphia, Pennsylvania, US");
  });

  test("date comes from JSON-LD datePosted", () => {
    expect(job.date).toBe("2026-05-29T04:00:00.000Z");
    expect(job.validThrough).toBe("2026-11-11T05:00:00.000Z");
  });

  test("unwraps the stringified employmentType array", () => {
    expect(job.employmentType).toBe("FULL_TIME");
  });

  test("description is readable text: tags stripped, breaks preserved, entities decoded", () => {
    expect(job.description).toBe(
      "Description:\nFunding for a postdoctoral fellow.\nSecond & final paragraph.",
    );
    expect(job.description).not.toContain("<");
    expect(job.description).toContain("&");
  });

  test("extracts both apply links, made absolute", () => {
    expect(job.applyUrl).toBe(
      "https://careers.insidehighered.com/apply/3509752/postdoc-in-cancer-immunology?LinkSource=JobDetails",
    );
    expect(job.externalApplyUrl).toBe(
      "https://careers.insidehighered.com/external-redirect-registration?JobId=3509752&LinkSource=JobDetails",
    );
  });

  test("every contract key is present, null never omitted", () => {
    for (const k of [
      "id", "title", "company", "location", "date", "url", "salary", "snippet",
      "description", "validThrough", "employmentType", "applyUrl", "externalApplyUrl",
    ]) {
      expect(k in job).toBe(true);
    }
  });
});

describe("normalizeId", () => {
  test("accepts a bare numeric id", () => {
    expect(normalizeId("3509752")).toBe("3509752");
  });

  test("accepts a full careers URL with slug", () => {
    expect(
      normalizeId("https://careers.insidehighered.com/job/3509752/postdoc-in-cancer-immunology/"),
    ).toBe("3509752");
  });

  test("accepts a site-relative /job/ path", () => {
    expect(normalizeId("/job/3509752/postdoc-in-cancer-immunology/")).toBe("3509752");
  });

  test("rejects a foreign job-board host", () => {
    expect(normalizeId("https://boards.greenhouse.io/acme/jobs/4567890")).toBeNull();
  });

  test("rejects a look-alike host", () => {
    expect(normalizeId("https://careers.insidehighered.com.evil.io/job/3509752/x/")).toBeNull();
  });

  test("rejects unrelated text", () => {
    expect(normalizeId("apply now")).toBeNull();
  });
});
