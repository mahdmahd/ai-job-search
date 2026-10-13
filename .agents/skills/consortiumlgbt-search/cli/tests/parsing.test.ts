import { describe, test, expect } from "bun:test";
import { parseJobCards, parseJobDetail } from "../src/helpers";
import { normalizeId } from "../src/commands/detail";

// Real card shape captured from POST /jm-ajax/get_listings/ (2026-10-13).
function card(id: string, title: string, company = "MESMAC"): string {
  return `<li class="post-${id} job_listing type-job_listing status-publish has-post-thumbnail entry job-type-employed" data-longitude="" data-latitude="">
	<a href="https://www.consortium.lgbt/job/some-role-slug/">
		<img class="company_logo" src="https://www.consortium.lgbt/wp-content/uploads/logo.jpg" alt="${company}" />		<div class="position">
			<h3>${title}</h3>
			<div class="company">
				<strong>${company}</strong> 				<span class="tagline">Yorkshire&#039;s largest LGBT+ charity</span>			</div>
		</div>
		<div class="location">
			Rotherham		</div>
		<ul class="meta">

																<li class="job-type employed">Employed</li>

			<li class="date"><time datetime="2026-09-25">Posted on 25th September 2026</time></li>

			<li class="application-deadline  "><label>Closes:</label> 19th October 2026</li>		</ul>
	</a>
</li>`;
}

describe("parseJobCards contract fields", () => {
  test("extracts id, title, company, location, date, url, type, deadline", () => {
    const [c] = parseJobCards(card("36649", "Yorkshire Queer Minds Peer Support Worker"));
    expect(c.id).toBe("36649");
    expect(c.title).toBe("Yorkshire Queer Minds Peer Support Worker");
    expect(c.company).toBe("MESMAC");
    expect(c.location).toBe("Rotherham");
    expect(c.date).toBe("2026-09-25");
    expect(c.url).toBe("https://www.consortium.lgbt/job/some-role-slug/");
    expect(c.employmentType).toBe("employed");
    expect(c.deadline).toBe("19th October 2026");
  });

  test("remote location strips the <small> qualifier", () => {
    const html = card("36694", "Consortium Trustee", "Consortium").replace(
      /<div class="location">[\s\S]*?<\/div>/,
      '<div class="location">\n\t\t\tRemote Position <small>(Remote)</small>\t\t</div>',
    );
    const [c] = parseJobCards(html);
    expect(c.location).toBe("Remote Position");
  });

  test("missing optional fields are null, never omitted", () => {
    const bare = `<li class="post-1 job_listing"><a href="https://www.consortium.lgbt/job/x/"><div class="position"><h3>Bare Role</h3></div></a></li>`;
    const [c] = parseJobCards(bare);
    expect(c.company).toBeNull();
    expect(c.location).toBeNull();
    expect(c.date).toBeNull();
    expect(c.employmentType).toBeNull();
    expect(c.deadline).toBeNull();
    expect(Object.keys(c).sort()).toEqual(
      ["company", "date", "deadline", "employmentType", "id", "location", "title", "url"].sort(),
    );
  });

  test("one malformed card does not break the rest", () => {
    const html = `<li class="post-9 job_listing"><a href="/job/broken/"><div class="position"></div></a></li>` +
      card("36649", "Good Role");
    const cards = parseJobCards(html);
    expect(cards).toHaveLength(1);
    expect(cards[0].title).toBe("Good Role");
  });

  test("decodes numeric entities in titles", () => {
    const [c] = parseJobCards(card("5", "Yorkshire&#039;s Queer Minds Worker"));
    expect(c.title).toBe("Yorkshire's Queer Minds Worker");
  });
});

describe("parseJobDetail", () => {
  const ldPage = (ld: string) => `<html><head><script type="application/ld+json">${ld}</script></head><body></body></html>`;

  test("reads title/company/location/dates/description from JSON-LD", () => {
    const ld = JSON.stringify({
      "@type": "JobPosting",
      title: "Consortium Trustee",
      description: "<p>We are seeking <strong>two</strong> Trustees.</p>",
      datePosted: "2026-10-12T08:48:32+01:00",
      validThrough: "2026-11-06T23:59:59+00:00",
      employmentType: ["VOLUNTEER"],
      hiringOrganization: { "@type": "Organization", name: "Consortium" },
      jobLocation: { "@type": "Place", address: "Remote Position" },
    });
    const job = parseJobDetail(ldPage(ld), "36694", "https://www.consortium.lgbt/job/consortium-trustee/");
    expect(job.title).toBe("Consortium Trustee");
    expect(job.company).toBe("Consortium");
    expect(job.location).toBe("Remote Position");
    expect(job.date).toBe("2026-10-12");
    expect(job.validThrough).toBe("2026-11-06");
    expect(job.deadline).toBe("2026-11-06");
    expect(job.employmentType).toBe("VOLUNTEER");
    expect(job.description).toContain("two Trustees");
    expect(job.description).not.toContain("<p>");
  });

  test("falls back to visible heading when JSON-LD is absent", () => {
    const job = parseJobDetail(
      '<span class="fl-heading-text">Some Role</span>',
      "x-role",
      "https://www.consortium.lgbt/job/x-role/",
    );
    expect(job.title).toBe("Some Role");
    expect(job.description).toBeNull();
  });
});

describe("normalizeId", () => {
  test("accepts a numeric post id", () => {
    expect(normalizeId("36649")).toEqual({ id: "36649" });
  });

  test("accepts absolute and scheme-less Consortium job URLs", () => {
    expect(normalizeId("https://www.consortium.lgbt/job/some-role/")).toEqual({
      url: "https://www.consortium.lgbt/job/some-role/",
    });
    expect(normalizeId("www.consortium.lgbt/job/some-role/")).toEqual({
      url: "https://www.consortium.lgbt/job/some-role/",
    });
  });

  test("accepts a site-relative /job/ path", () => {
    expect(normalizeId("/job/some-role/")).toEqual({
      url: "https://www.consortium.lgbt/job/some-role/",
    });
  });

  test("rejects other hosts and non-job paths", () => {
    expect(normalizeId("https://boards.greenhouse.io/acme/jobs/4567890")).toBeNull();
    expect(normalizeId("https://www.consortium.lgbt/jobs/")).toBeNull();
    expect(normalizeId("")).toBeNull();
  });
});
