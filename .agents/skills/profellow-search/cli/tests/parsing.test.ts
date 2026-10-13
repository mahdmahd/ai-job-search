import { describe, test, expect } from "bun:test";
import {
  parseOpenCallCards,
  parseOpenCallDetail,
  filterCards,
  matchesQuery,
  decodeHtmlEntities,
  htmlToText,
  splitCardChunks,
} from "../src/helpers";

// Hand-written fixtures mirroring profellow.com's verified markup
// (2026-10-13): <article class="open-call"> cards, h2 (featured) / h4 (normal)
// open-call-content__title, .open-call-deadline prose, .open-call-eligibility.

function featuredCard(overrides: { title?: string; slug?: string; sponsor?: string | null; deadline?: string | null } = {}): string {
  const {
    title = "Council on Foreign Relations Fellowships",
    slug = "now-seeking-emerging-leaders-for-2027-council-on-foreign-relations-fellowships",
    sponsor = null,
    deadline = "October 30, 2026",
  } = overrides;
  return [
    `<article class="open-call">`,
    sponsor
      ? `<div class="open-call__image-wrapper"><div class="open-call__sponsor sponsored-tag">${sponsor}</div></div>`
      : `<div class="open-call__image-wrapper"></div>`,
    `<div class="open-call__content post__content">`,
    `<h2 class="open-call-content__title post__title h3">`,
    `<a href="https://www.profellow.com/open-call/${slug}/">${title}</a>`,
    `</h2>`,
    `<div class="post__excerpt"><p>The Council on Foreign Relations (CFR) offers postdoctoral fellowships.</p></div>`,
    `<div class="open-call-eligibility"><strong>Eligibility:</strong><ul><li>Applicants must be U.S. citizens</li></ul></div>`,
    deadline
      ? `<div class="open-call-deadline"><strong>Deadline:</strong> ${deadline}</div>`
      : ``,
    `</div></article>`,
  ].join("\n");
}

function normalCard(): string {
  return [
    `<article class="open-call">`,
    `<div class="open-call__content post__content">`,
    `<h4 class="open-call-content__title post__title">`,
    `<a href="https://www.profellow.com/open-call/2027-princeton-in-asia/">2027 Princeton in Asia</a>`,
    `</h4>`,
    `<div class="post__excerpt"><p>Princeton in Asia offers fellowships for recent graduates.</p></div>`,
    `<div class="open-call-eligibility"><strong>Eligibility:</strong> Recent graduates</div>`,
    `<div class="open-call-deadline"><strong>Deadline:</strong> November 15, 2026</div>`,
    `</div></article>`,
  ].join("\n");
}

describe("parseOpenCallCards contract fields", () => {
  test("featured h2 card: slug id, title, deadline, url; null company/location", () => {
    const [card] = parseOpenCallCards(featuredCard());
    expect(card.id).toBe(
      "now-seeking-emerging-leaders-for-2027-council-on-foreign-relations-fellowships"
    );
    expect(card.title).toBe("Council on Foreign Relations Fellowships");
    expect(card.company).toBeNull();
    expect(card.location).toBeNull();
    expect(card.date).toBe("October 30, 2026");
    expect(card.url).toBe(
      "https://www.profellow.com/open-call/now-seeking-emerging-leaders-for-2027-council-on-foreign-relations-fellowships/"
    );
  });

  test("normal h4 card without sponsor parses", () => {
    const [card] = parseOpenCallCards(normalCard());
    expect(card.id).toBe("2027-princeton-in-asia");
    expect(card.title).toBe("2027 Princeton in Asia");
    expect(card.date).toBe("November 15, 2026");
  });

  test("'Sponsored by X' becomes the company (host), prefix stripped", () => {
    const [card] = parseOpenCallCards(
      featuredCard({ sponsor: "Sponsored by Boston Consulting Group / Jobstream" })
    );
    expect(card.company).toBe("Boston Consulting Group / Jobstream");
  });

  test("missing deadline yields null date, key still present", () => {
    const [card] = parseOpenCallCards(featuredCard({ deadline: null }));
    expect(card.date).toBeNull();
    expect(Object.keys(card).sort()).toEqual([
      "company",
      "date",
      "id",
      "location",
      "title",
      "url",
    ]);
  });

  test("one malformed card does not break the rest (chunk-safe)", () => {
    const cards = parseOpenCallCards(
      `<article class="open-call"><div>no title here</div></article>` +
        featuredCard() +
        `<article class="open-call"><h4 class="wrong"></h4></article>` +
        normalCard()
    );
    expect(cards).toHaveLength(2);
    expect(cards[0].title).toContain("Council on Foreign Relations");
    expect(cards[1].title).toBe("2027 Princeton in Asia");
  });

  test("non-card HTML yields an empty list", () => {
    expect(parseOpenCallCards("")).toEqual([]);
    expect(parseOpenCallCards("<html><body>Forbidden. Sender blacklisted.</body></html>")).toEqual([]);
  });

  test("decodes entities in titles", () => {
    const [card] = parseOpenCallCards(
      featuredCard({ title: "CDC&#8217;s Public Health Fellowships" })
    );
    expect(card.title).toBe("CDC’s Public Health Fellowships");
  });
});

describe("matchesQuery / filterCards (client-side archive filtering)", () => {
  test("matches title words case-insensitively", () => {
    expect(matchesQuery("Council on Foreign Relations Fellowships", null, "foreign relations")).toBe(true);
    expect(matchesQuery("2027 Princeton in Asia", null, "princeton")).toBe(true);
    expect(matchesQuery("2027 Princeton in Asia", null, "Marshall")).toBe(false);
  });

  test("matches words in the card chunk (excerpt/eligibility)", () => {
    const chunk = featuredCard();
    expect(matchesQuery("Something Else", chunk, "postdoctoral")).toBe(true);
    expect(matchesQuery("Something Else", chunk, "citizens")).toBe(true);
  });

  test("AND semantics: all words must appear", () => {
    const chunk = featuredCard();
    expect(matchesQuery("x", chunk, "postdoctoral citizens")).toBe(true);
    expect(matchesQuery("x", chunk, "postdoctoral Marshall")).toBe(false);
  });

  test("filterCards keeps matching cards with their parsed fields", () => {
    const html = featuredCard() + normalCard();
    const kept = filterCards(html, "princeton", parseOpenCallCards(html));
    expect(kept).toHaveLength(1);
    expect(kept[0].id).toBe("2027-princeton-in-asia");
  });

  test("splitCardChunks aligns one chunk per article", () => {
    expect(splitCardChunks(featuredCard() + normalCard())).toHaveLength(2);
  });
});

describe("decodeHtmlEntities / htmlToText", () => {
  test("decodes numeric entities", () => {
    expect(decodeHtmlEntities("Master&#8217;s")).toBe("Master’s");
    expect(decodeHtmlEntities("Caf&#233;")).toBe("Café");
  });

  test("htmlToText preserves paragraph and list breaks", () => {
    expect(htmlToText("<p>One</p><p>Two</p>")).toBe("One\nTwo");
    expect(htmlToText("<ul><li>A</li><li>B</li></ul>")).toBe("A\nB");
    expect(htmlToText("<h2>Eligibility</h2><p>U.S. citizens</p>")).toBe("Eligibility\nU.S. citizens");
  });
});

const DETAIL_FIXTURE = [
  `<h1 class="entry-title">Now Seeking Emerging Leaders for 2027 Council on Foreign Relations Fellowships</h1>`,
  `<div class="open-call__meta">`,
  `<div class="open-call-meta__deadline">`,
  `October 30, 2026</div>`,
  `<div class="open-call-meta__cta">`,
  `<a class="btn btn--primary" href="https://www.cfr.org/fellowships?utm_source=x" target="_blank" title="Apply Link">Apply Now</a>`,
  `</div></div>`,
  `<div class="single-post__sponsor">Sponsored by Council on Foreign Relations</div>`,
  `<div class="single-post__body">`,
  `<p>The Council on Foreign Relations (CFR) is seeking applicants.</p>`,
  `<h2>Eligibility</h2>`,
  `<p>CFR fellowships are open to U.S. citizens, including post-doctoral scholars.</p>`,
  `<h2>How to Apply</h2>`,
  `<p>Visit <a href="https://www.cfr.org/fellowships">cfr.org/fellowships</a>.</p>`,
  `</div>`,
  `<div class="open-call__meta open-call__meta--bottom">`,
].join("\n");

describe("parseOpenCallDetail", () => {
  test("extracts title, deadline, eligibility, apply link, description", () => {
    const detail = parseOpenCallDetail(
      DETAIL_FIXTURE,
      "now-seeking-emerging-leaders-for-2027-council-on-foreign-relations-fellowships"
    );
    expect(detail.id).toBe(
      "now-seeking-emerging-leaders-for-2027-council-on-foreign-relations-fellowships"
    );
    expect(detail.title).toBe(
      "Now Seeking Emerging Leaders for 2027 Council on Foreign Relations Fellowships"
    );
    expect(detail.company).toBe("Council on Foreign Relations");
    expect(detail.location).toBeNull();
    expect(detail.date).toBe("October 30, 2026");
    expect(detail.deadline).toBe("October 30, 2026");
    expect(detail.url).toBe(
      "https://www.profellow.com/open-call/now-seeking-emerging-leaders-for-2027-council-on-foreign-relations-fellowships/"
    );
    expect(detail.description).toContain("seeking applicants");
    expect(detail.description).not.toContain("<p>");
    expect(detail.eligibility).toContain("U.S. citizens");
    expect(detail.applyLinks).toEqual(["https://www.cfr.org/fellowships?utm_source=x"]);
  });

  test("unsponsored detail yields null company, key still present", () => {
    const detail = parseOpenCallDetail(
      DETAIL_FIXTURE.replace(/<div class="single-post__sponsor">.*<\/div>/, ""),
      "some-slug"
    );
    expect(detail.company).toBeNull();
  });
});
