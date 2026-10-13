import { describe, expect, test } from "bun:test";
import {
  idFromJobUrl,
  matchesQuery,
  parseHomepageCards,
  parseRss,
  parseRssTitle,
  pubDateToISO,
} from "../src/helpers";

const RSS_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Latest jobs from AACC Jobs</title>
    <item>
      <guid>https://jobs.aacc.nche.edu/jobs/623296164-superintendent-president-at-imperial-valley-college</guid>
      <link>https://jobs.aacc.nche.edu/jobs/623296164-superintendent-president-at-imperial-valley-college</link>
      <title>Superintendent/President at Imperial Valley College (Imperial, CA, USA)</title>
      <description>Board of Trustees invites applications for Superintendent/President.</description>
      <pubDate>Mon, 12 Oct 2026 22:51:08 +0000</pubDate>
    </item>
    <item>
      <guid>https://jobs.aacc.nche.edu/jobs/621000001-adjunct-faculty-biology-at-desert-college</guid>
      <link>https://jobs.aacc.nche.edu/jobs/621000001-adjunct-faculty-biology-at-desert-college</link>
      <title>Adjunct Faculty, Biology at Desert College (Palm Desert, CA, USA)</title>
      <description>Part-time adjunct instructor sought to teach introductory biology labs.</description>
      <pubDate>Fri, 09 Oct 2026 15:00:41 +0000</pubDate>
    </item>
    <item>
      <guid>https://jobs.aacc.nche.edu/jobs/not-a-job</guid>
      <link>https://jobs.aacc.nche.edu/jobs/not-a-job</link>
      <title></title>
    </item>
  </channel>
</rss>`;

const HOMEPAGE_FIXTURE = `
<ul class="jobList">
  <li class="job-listing  logo">
    <div class="jobList-introWrap">
      <div class="jobList-intro">
        <a class="jobList-title" data-track="abc" href="/jobs/623296164-superintendent-president-at-imperial-valley-college"><strong>Superintendent/President</strong></a>
        <ul class="jobList-introMeta">
          <li><i class="text-muted fas fa-building"></i>Imperial Valley College</li>
          <li><i class="text-muted fas fa-map-marker-alt"></i>Imperial, CA, USA</li>
          <li></li>
        </ul>
      </div>
    </div>
    <div class="jobList-date text-muted u-textNoWrap">Oct 12</div>
  </li>
  <li class="job-listing broken"><span>not a card</span></li>
</ul>`;

describe("RSS parsing (offline fixture)", () => {
  test("parses items, splits title into role/company/location", () => {
    const jobs = parseRss(RSS_FIXTURE);
    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toMatchObject({
      id: "623296164",
      title: "Superintendent/President",
      company: "Imperial Valley College",
      location: "Imperial, CA, USA",
      date: "2026-10-12",
    });
    expect(jobs[1]).toMatchObject({
      id: "621000001",
      title: "Adjunct Faculty, Biology",
      company: "Desert College",
      location: "Palm Desert, CA, USA",
    });
    expect(jobs[0].url).toContain("/jobs/623296164-");
  });

  test("malformed item (no id, no title) is skipped", () => {
    expect(parseRss("<rss><channel></channel></rss>")).toEqual([]);
  });
});

describe("parseRssTitle", () => {
  test("splits on the LAST ' at ' so roles containing it survive", () => {
    expect(parseRssTitle("Coordinator at Large Events at City College (Austin, TX, USA)")).toMatchObject({
      role: "Coordinator at Large Events",
      company: "City College",
      location: "Austin, TX, USA",
    });
  });

  test("title without ' at ' keeps the whole string as role", () => {
    expect(parseRssTitle("Faculty (Remote, USA)")).toMatchObject({
      role: "Faculty",
      company: null,
      location: "Remote, USA",
    });
  });
});

describe("pubDateToISO", () => {
  test("valid pubDate converts to YYYY-MM-DD", () => {
    expect(pubDateToISO("Mon, 12 Oct 2026 22:51:08 +0000")).toBe("2026-10-12");
  });
  test("garbage degrades to null, never throws", () => {
    expect(pubDateToISO("not a date")).toBeNull();
    expect(pubDateToISO("")).toBeNull();
  });
});

describe("homepage card parsing (offline fixture)", () => {
  test("parses card fields; malformed card is skipped", () => {
    const cards = parseHomepageCards(HOMEPAGE_FIXTURE);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      id: "623296164",
      title: "Superintendent/President",
      company: "Imperial Valley College",
      location: "Imperial, CA, USA",
      date: "Oct 12",
    });
    expect(cards[0].url).toBe(
      "https://jobs.aacc.nche.edu/jobs/623296164-superintendent-president-at-imperial-valley-college",
    );
  });
});

describe("matchesQuery (client-side filter)", () => {
  const job = {
    title: "Adjunct Faculty, Biology",
    company: "Desert College",
    location: "Palm Desert, CA, USA",
    description: "Part-time adjunct instructor sought to teach introductory biology labs.",
  };
  test("single word matches title/description case-insensitively", () => {
    expect(matchesQuery(job, "adjunct")).toBe(true);
    expect(matchesQuery(job, "BIOLOGY")).toBe(true);
    expect(matchesQuery(job, "nursing")).toBe(false);
  });
  test("multi-word query is AND of words", () => {
    expect(matchesQuery(job, "adjunct biology")).toBe(true);
    expect(matchesQuery(job, "adjunct nursing")).toBe(false);
  });
  test("location words match the location field", () => {
    expect(matchesQuery(job, "adjunct Texas")).toBe(false);
    expect(matchesQuery(job, "adjunct California")).toBe(false);
    expect(matchesQuery(job, "adjunct CA")).toBe(true);
  });
});

describe("idFromJobUrl", () => {
  test("extracts numeric id from slugged and bare job URLs", () => {
    expect(idFromJobUrl("https://jobs.aacc.nche.edu/jobs/623296164-superintendent-president")).toBe(
      "623296164",
    );
    expect(idFromJobUrl("/jobs/621000001")).toBe("621000001");
    expect(idFromJobUrl("https://example.com/other/123")).toBeNull();
  });
});
