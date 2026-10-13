import { describe, expect, test } from "bun:test";
import {
  splitCards,
  parseListingCards,
  postIdFromClass,
  numericFromSlug,
  totalFromEnvelope,
  maxPagesFromEnvelope,
  cardIsExpired,
  decodeHtmlEntities,
  htmlToText,
  parseJobDetail,
} from "../src/helpers";

// Fixtures mirror the real Workscout card markup served by
// /jm-ajax/get_listings/ (captured live 2026-10-13; see ../url-reference.md
// for the anchors). Each <li> is a trimmed-down but structurally faithful card.
function richCard(overrides: Record<string, string> = {}): string {
  return `<li class="right post-155928 job_listing type-job_listing status-publish has-post-thumbnail hentry job_listing_region-ireland job_listing_category-phd job_listing_type-full-time" data-longitude="" data-latitude="">
  <a href="${overrides.url ?? "https://jobrxiv.org/job/ucd-charles-institute-27778-fully-erc-funded-phd-position/"}">
    <img decoding="async" class="company_logo" src="https://jobrxiv.org/wp-content/uploads/x.jpg" alt="UCD Charles Institute of Dermatology, School of Medicine, University College Dublin" />
    <div class="job-list-content">
      <h4>${overrides.title ?? "Fully ERC-funded PhD Position in Tissue Engineering Research"}
        <span class="job-type full-time">${overrides.type ?? "Full-time"}</span>
      </h4>
      <div class="job-icons">
        <div class="job-keywords"><span class="job-keyword">biomaterials</span></div>
        <div class="job-salary-range"><span class="job-salary">$33,585 - $33,585</span></div>
        <span class="ws-meta-company-name"><i class="fa fa-briefcase"></i> ${overrides.company ?? "UCD Charles Institute of Dermatology, School of Medicine, University College Dublin"}</span>
        <span class="ws-meta-job-location"><i class="fa fa-map-marker"></i>  ${overrides.location ?? "Ireland"}</span>
        <span class="ws-meta-salary"><i class="fa fa-money"></i>${overrides.city ?? "Dublin"}</span>
        <span class="ws-meta-job-date"><i class="fa fa-calendar"></i> <time datetime="${overrides.date ?? "2026-10-07"}">Posted on 7 October 2026</time></span>
      </div>
      <div class="listing-desc"><p>${overrides.desc ?? "Fully ERC-funded PhD Position in Tissue Engineering Research @ University College Dublin in Ireland&#8230;"}</p></div>
    </div>
  </a>
<div class="clearfix"></div>
</li>`;
}

describe("splitCards", () => {
  test("splits a page into per-card <li> chunks at matching depth", () => {
    const html = `<ul class="job_listings">${richCard()}${richCard({ title: "Second" })}<li>not a card</li></ul>`;
    const cards = splitCards(html);
    expect(cards).toHaveLength(2);
    expect(cards[0]).toContain("Fully ERC-funded PhD Position");
    expect(cards[1]).toContain("Second");
  });

  test("handles nested <li> inside a card (share lists etc.)", () => {
    const html = `<li class="post-1 job_listing"><ul><li>inner</li></ul><h4>Outer</h4></li>`;
    const cards = splitCards(html);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toContain("Outer");
  });

  test("returns nothing when no cards are present", () => {
    expect(splitCards("<ul><li>plain</li></ul>")).toEqual([]);
  });
});

describe("parseListingCards contract fields", () => {
  test("extracts id, title, company, location, date, url, type, salary, description", () => {
    const [card] = parseListingCards({ html: richCard() });
    expect(card).not.toBeUndefined();
    expect(card.id).toBe("155928");
    expect(card.title).toBe("Fully ERC-funded PhD Position in Tissue Engineering Research");
    expect(card.title).not.toContain("Full-time"); // job-type badge stripped from h4
    expect(card.company).toBe("UCD Charles Institute of Dermatology, School of Medicine, University College Dublin");
    expect(card.location).toBe("Ireland");
    expect(card.date).toBe("2026-10-07");
    expect(card.url).toBe("https://jobrxiv.org/job/ucd-charles-institute-27778-fully-erc-funded-phd-position/");
    expect(card.type).toBe("Full-time");
    expect(card.salary).toBe("$33,585 - $33,585");
    expect(card.description).toContain("Tissue Engineering Research");
  });

  test("every result key is present even when values are null (never omitted)", () => {
    const html = `<li class="post-9 job_listing"><a href="https://jobrxiv.org/job/bare-slug/"><h4>Bare posting</h4></a></li>`;
    const [card] = parseListingCards({ html });
    expect(Object.keys(card).sort()).toEqual(
      ["company", "companyUrl", "date", "description", "id", "location", "salary", "title", "type", "url"],
    );
    expect(card.company).toBeNull();
    expect(card.location).toBeNull();
    expect(card.date).toBeNull();
    expect(card.type).toBeNull();
    expect(card.salary).toBeNull();
    expect(card.description).toBeNull();
  });

  test("one malformed card does not break the rest (chunk-safe)", () => {
    // A card with no <a href> is skipped; its neighbours parse untouched.
    const html = `${richCard({ title: "Good card" })}<li class="post-2 job_listing"><h4>No link here</h4></li>${richCard({ title: "Second good" })}`;
    const cards = parseListingCards({ html });
    expect(cards).toHaveLength(2);
    expect(cards[0].title).toBe("Good card");
    expect(cards[1].title).toBe("Second good");
  });

  test("cards without a usable title are skipped entirely", () => {
    const html = `<li class="post-3 job_listing"><a href="https://jobrxiv.org/job/x/"></a></li>`;
    expect(parseListingCards({ html })).toEqual([]);
  });

  test("non-object payloads yield an empty list", () => {
    expect(parseListingCards(null)).toEqual([]);
    expect(parseListingCards(undefined)).toEqual([]);
    expect(parseListingCards({ code: "rest_no_route" })).toEqual([]);
    expect(parseListingCards({ html: "" })).toEqual([]);
  });

  test("expired postings link via the ?post_type=job_listing&p= fallback URL", () => {
    const html = `<li class="post-153878 job_listing type-job_listing status-expired">
      <a href="https://jobrxiv.org/?post_type=job_listing&amp;p=153878"><h4>PhD candidate (f_m_x) &#8211; Modeling subduction</h4></a>
    </li>`;
    const [card] = parseListingCards({ html });
    expect(card.id).toBe("153878");
    expect(card.url).toBe("https://jobrxiv.org/?post_type=job_listing&p=153878");
    expect(card.title).toBe("PhD candidate (f_m_x) – Modeling subduction");
  });
});

describe("id extraction", () => {
  test("postIdFromClass prefers the numeric post id from the class list", () => {
    expect(postIdFromClass('class="post-155928 job_listing"')).toBe("155928");
    expect(postIdFromClass('class="job_listing right post-27778"')).toBe("27778");
    expect(postIdFromClass('class="job_listing"')).toBeNull();
  });

  test("numericFromSlug pulls the embedded 4+ digit chunk", () => {
    expect(numericFromSlug("https://jobrxiv.org/job/ucd-charles-institute-27778-fully-erc-funded-phd/")).toBe("27778");
    expect(numericFromSlug("https://jobrxiv.org/job/academic-research-assistant-f-m-d/")).toBeNull();
  });
});

describe("totalFromEnvelope / maxPagesFromEnvelope", () => {
  test("total comes from post_count when present", () => {
    expect(totalFromEnvelope({ post_count: 1006 }, 25)).toBe(1006);
  });

  test("total falls back to parsing 'Found N matching records'", () => {
    expect(
      totalFromEnvelope({ showing: "Search completed. Found 1,006 matching records." }, 25),
    ).toBe(1006);
  });

  test("total falls back to the page card count", () => {
    expect(totalFromEnvelope({}, 7)).toBe(7);
    expect(totalFromEnvelope(null, 0)).toBe(0);
  });

  test("max pages comes from max_num_pages", () => {
    expect(maxPagesFromEnvelope({ max_num_pages: 503 })).toBe(503);
    expect(maxPagesFromEnvelope({})).toBeNull();
  });
});

describe("cardIsExpired", () => {
  test("detects the status-expired class", () => {
    expect(cardIsExpired('class="post-1 job_listing status-expired"')).toBe(true);
    expect(cardIsExpired('class="post-1 job_listing status-publish"')).toBe(false);
  });
});

describe("decodeHtmlEntities", () => {
  test("decodes named, numeric, hex, and common punctuation entities", () => {
    expect(decodeHtmlEntities("M&#252;nster &amp; B2 &#x27;s")).toBe("Münster & B2 's");
    expect(decodeHtmlEntities("&#8211; dash &#8212; em &#8230; ellipsis")).toBe("– dash — em … ellipsis");
    expect(decodeHtmlEntities("a&nbsp;b")).toBe("a b");
  });
});

describe("htmlToText", () => {
  test("preserves paragraph and list breaks, collapses blank runs", () => {
    expect(htmlToText("<p>One</p><p>Two</p><ul><li>A</li><li>B</li></ul>")).toBe("One\nTwo\nA\nB");
  });
  test("decodes entities in the text", () => {
    expect(htmlToText("<p>Master&#8217;s degree &amp; R</p>")).toBe("Master’s degree & R");
  });
});

describe("parseJobDetail", () => {
  const detailHtml = `
  <link rel="canonical" href="https://jobrxiv.org/job/academic-research-assistant-phd-candidate-f-m-d/" />
  <div id="titlebar" class="single">
    <span><a href="https://jobrxiv.org/job-category/phd/">PhD Student</a></span>
    <h1>Academic Research Assistant Position (PhD Candidate) (f/m/d)
      <span class="job-type part-time">Part-time</span>
    </h1>
  </div>
  <div class="company-info right-company-logo">
    <img class="company_logo" alt="Helmholtz Association of German Research Centers" />
    <div class="content">
      <h4><strong>Helmholtz Association of German Research Centers</strong></h4>
      <span><a class="website" href="http://helmholtz.de" target="_blank">Website</a></span>
    </div>
    <div class="clearfix"></div>
  </div>
  <div class="single_job_listing">
    <div class="job_description">
      <div>
        <h2>Doctoral Researcher Position</h2>
        <p>The position offers the opportunity to pursue doctoral research.</p>
        <p>Job location: Karlsruhe</p>
        <p>Application up to: 2026-10-31</p>
      </div>
    </div>
  </div>
  <div class="widget">
    <h4>Job Overview</h4>
    <ul class="job-overview">
      <li><i class="fa fa-calendar"></i><div><strong>Date Posted:</strong><span><time datetime="2026-10-02">Posted on 2 October 2026</time></span></div></li>
      <li><i class="fa fa-map-marker"></i><div><strong>Location:</strong><span class="location"><a href="https://jobrxiv.org/job-region/germany/">Germany</a></span></div></li>
    </ul>
    <div class="job_application application">
      <div id="apply-dialog" class="small-dialog">
        <div class="small-dialog-content">
          <p>Please visit <a href="https://jobs.example.edu/en/jobs/170895/" rel="nofollow">jobs.example.edu</a>.<br />Mention jobRxiv!</p>
        </div>
      </div>
    </div>
  </div>`;

  test("extracts title (badge stripped), company, type, date, location, description, apply link", () => {
    const job = parseJobDetail(detailHtml, "155268", "https://jobrxiv.org/job/academic-research-assistant-phd-candidate-f-m-d/");
    expect(job.id).toBe("155268");
    expect(job.title).toBe("Academic Research Assistant Position (PhD Candidate) (f/m/d)");
    expect(job.type).toBe("Part-time");
    expect(job.company).toBe("Helmholtz Association of German Research Centers");
    expect(job.companyUrl).toBe("http://helmholtz.de");
    expect(job.date).toBe("2026-10-02");
    expect(job.location).toBe("Germany");
    expect(job.description).toContain("Doctoral Researcher Position");
    expect(job.description).not.toContain("<p>");
    expect(job.description).toContain("Application up to: 2026-10-31");
    expect(job.applyUrl).toBe("https://jobs.example.edu/en/jobs/170895/");
    expect(job.isActive).toBe(true);
  });

  test("falls back to the company_logo alt text when h4 strong is absent", () => {
    const html = detailHtml.replace(
      /<h4><strong>Helmholtz[^<]*<\/strong><\/h4>/,
      "",
    );
    const job = parseJobDetail(html, "1", "https://jobrxiv.org/job/x/");
    expect(job.company).toBe("Helmholtz Association of German Research Centers");
  });

  test("flags expired postings as inactive (closed banner above description)", () => {
    const expired = detailHtml.replace(
      /<div id="titlebar"/,
      `<div class="job-expired">This job has expired</div><div id="titlebar"`,
    );
    const job = parseJobDetail(expired, "1", "https://jobrxiv.org/job/x/");
    expect(job.isActive).toBe(false);
  });

  test("isActive stays true when the closed wording only appears inside the description", () => {
    // Recruiter boilerplate quoting "expired" must not flip the status.
    const html = detailHtml.replace(
      "Application up to: 2026-10-31",
      "Applications after the deadline will not be considered; expired links are removed",
    );
    const job = parseJobDetail(html, "1", "https://jobrxiv.org/job/x/");
    expect(job.isActive).toBe(true);
  });

  test("apply links stay null when the dialog carries no external URL", () => {
    const html = detailHtml.replace(
      /<a href="https:\/\/jobs\.example\.edu\/en\/jobs\/170895\/"[^>]*>jobs\.example\.edu<\/a>/,
      "",
    );
    const job = parseJobDetail(html, "1", "https://jobrxiv.org/job/x/");
    expect(job.applyUrl).toBeNull();
  });
});
