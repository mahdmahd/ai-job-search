import { describe, expect, test } from "bun:test";
import { cleanHref, parseJobCards } from "../src/helpers";

// Fixture mirrors the live Madgex markup (verified 2026-10-13): the href value
// carries stray whitespace/newlines inside the quotes, meta items are <li>s,
// and the description div may hold a <p> that opens without a matching open tag.
function card(
  id: string,
  title: string,
  opts: {
    slug?: string;
    company?: string | null;
    location?: string | null;
    salary?: string | null;
    snippet?: string;
    omitSalary?: boolean;
  } = {},
): string {
  const {
    slug = "some-job-slug",
    company = "Example University",
    location = "Madison, Wisconsin",
    salary = "$100,000",
    snippet = "We are seeking excellent candidates.",
    omitSalary = false,
  } = opts;
  const meta = [
    location !== null
      ? `<li class="lister__meta-item lister__meta-item--location">${location}</li>`
      : "",
    company !== null
      ? `<li class="lister__meta-item lister__meta-item--recruiter">${company}</li>`
      : "",
    omitSalary
      ? ""
      : `<li class="lister__meta-item lister__meta-item--salary">${salary ?? ""}</li>`,
  ].join("\n");
  return `<li class="lister__item cf" id="item-${id}">
  <div class="lister__details cf js-clickable">
    <h3 class="lister__header"><a

 href="
	/job/${id}/${slug}/?LinkSource=PromotedJob



" class="js-clickable-area-link"><span>${title}</span></a></h3>
    <ul class="lister__meta">
      ${meta}
    </ul>
    <div class="lister__description js-clamp-2">${snippet}</div>
    <div class="lister__footer cf">
      <p class="lister__view-details"><a href="/job/${id}/${slug}/?LinkSource=PromotedJob">View details</a></p>
    </div>
  </div>
</li>`;
}

describe("parseJobCards", () => {
  test("parses id, title, company, location, salary, snippet and a trimmed URL", () => {
    const [c] = parseJobCards(card("38047649", "Assistant Professor of Statistics"));
    expect(c.id).toBe("38047649");
    expect(c.title).toBe("Assistant Professor of Statistics");
    expect(c.company).toBe("Example University");
    expect(c.location).toBe("Madison, Wisconsin");
    expect(c.salary).toBe("$100,000");
    expect(c.snippet).toContain("seeking excellent candidates");
    // stray whitespace/newlines trimmed, tracking query dropped
    expect(c.url).toBe("https://jobs.chronicle.com/job/38047649/some-job-slug/");
    expect(c.date).toBeNull();
  });

  test("empty salary li becomes null, never omitted from the object", () => {
    const [c] = parseJobCards(card("12345678", "Lecturer", { salary: "" }));
    expect(c.salary).toBeNull();
    expect(Object.keys(c)).toContain("salary");
  });

  test("missing salary li becomes null too", () => {
    const [c] = parseJobCards(
      card("12345678", "Lecturer", { omitSalary: true }),
    );
    expect(c.salary).toBeNull();
  });

  test("decodes HTML entities in the title (hex and decimal)", () => {
    const [c] = parseJobCards(card("11111111", "Professor of Philos&#x6F;phy &amp; &#233;thics"));
    expect(c.title).toBe("Professor of Philosophy & éthics");
  });

  test("one malformed card cannot break the rest (chunk-safe)", () => {
    const html =
      card("22222222", "Good Card") +
      `<li class="lister__item cf" id="item-99999999"><div>no header at all</div></li>` +
      card("33333333", "Another Good Card");
    const cards = parseJobCards(html);
    expect(cards.map((c) => c.id)).toEqual(["22222222", "33333333"]);
  });

  test("non-item anchors (ads, empty list items) are skipped", () => {
    const html = `<li class="lister__item lister__item--ads lister__item--ads--empty"></li>` + card("44444444", "Real Job");
    const cards = parseJobCards(html);
    expect(cards).toHaveLength(1);
    expect(cards[0].id).toBe("44444444");
  });

  test("trailing page noise cannot leak into the last card's missing fields", () => {
    // The final chunk runs to the end of the document; a card without a salary
    // must not pick up a salary string from an ad, mini-lister, or paginator
    // that follows it.
    const html =
      card("55555555", "No Salary Card", { omitSalary: true }) +
      `<div class="ad ad--lister block">LATER
        <li class="lister__meta-item lister__meta-item--salary">Ghost Salary</li>
      </div>
      <div class="paginator__item">page noise</div>`;
    const [c] = parseJobCards(html);
    expect(c.salary).toBeNull();
    expect(c.title).toBe("No Salary Card");
  });

  test("description with a stray closing tag keeps its text", () => {
    const [c] = parseJobCards(
      card("66666666", "Research Scientist", {
        snippet: "Lead interdisciplinary research.</p>",
      }),
    );
    expect(c.snippet).toBe("Lead interdisciplinary research.");
  });
});

describe("cleanHref", () => {
  test("trims internal whitespace and drops the query string", () => {
    expect(cleanHref(" \n\t/job/1/x/?LinkSource=PromotedJob\n\n", "fb")).toBe(
      "https://jobs.chronicle.com/job/1/x/",
    );
  });

  test("absolutizes root-relative paths, keeps absolute URLs", () => {
    expect(cleanHref("/job/2/y/", "fb")).toBe("https://jobs.chronicle.com/job/2/y/");
    expect(cleanHref("https://other.example/job/3/z/", "fb")).toBe(
      "https://other.example/job/3/z/",
    );
  });

  test("falls back when the href is empty", () => {
    expect(cleanHref("   ", "https://jobs.chronicle.com/job/9/")).toBe(
      "https://jobs.chronicle.com/job/9/",
    );
  });
});
