import { describe, test, expect } from "bun:test";
import {
  parsePosts,
  parsePostDetail,
  parseCompanyLocation,
  decodeHtmlEntities,
  extractDeadlines,
  extractApplyLinks,
  htmlToText,
  jobageToAfter,
} from "../src/helpers";

// Minimal WP REST post objects mirroring the real API shape:
// { id, date, link, title: { rendered } }, content only on the detail endpoint.
function wpPost(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 17395,
    date: "2026-10-13T13:07:49",
    link: "https://vacancyedu.com/2026/10/13/postdoctoral-fellowship-05/",
    title: { rendered: "Postdoctoral Fellowship (05) at University of British Columbia, Canada" },
    ...overrides,
  };
}

describe("parsePosts contract fields", () => {
  test("extracts id, title, company, location, date, url from a real-shaped post", () => {
    const [post] = parsePosts([wpPost()]);
    expect(post.id).toBe(17395);
    expect(post.title).toBe("Postdoctoral Fellowship (05) at University of British Columbia, Canada");
    expect(post.company).toBe("University of British Columbia");
    expect(post.location).toBe("Canada");
    expect(post.date).toBe("2026-10-13T13:07:49");
    expect(post.url).toBe("https://vacancyedu.com/2026/10/13/postdoctoral-fellowship-05/");
  });

  test("every result key is present even when values are null (never omitted)", () => {
    const bare = parsePosts([
      { id: 1, title: { rendered: "General Application Round" }, link: null, date: null },
    ]);
    expect(Object.keys(bare[0]).sort()).toEqual(["company", "date", "id", "location", "title", "url"]);
    expect(bare[0].company).toBeNull();
    expect(bare[0].location).toBeNull();
    expect(bare[0].date).toBeNull();
  });

  test("one malformed post does not break the rest (chunk-safe)", () => {
    const posts = parsePosts([
      null,
      "not-an-object",
      { title: { rendered: "No ID Here at Nowhere" } }, // missing id
      { id: 2, title: { rendered: "Good Postdoc at MIT, USA" } },
      { id: 3 }, // missing title
      { id: 4, title: { rendered: "Another at ETH Zurich, Switzerland" } },
    ]);
    expect(posts).toHaveLength(2);
    expect(posts[0].id).toBe(2);
    expect(posts[0].company).toBe("MIT");
    expect(posts[1].id).toBe(4);
    expect(posts[1].company).toBe("ETH Zurich");
  });

  test("non-array payloads yield an empty list", () => {
    expect(parsePosts({ code: "rest_no_route" })).toEqual([]);
    expect(parsePosts(null)).toEqual([]);
    expect(parsePosts(undefined)).toEqual([]);
  });
});

describe("decodeHtmlEntities (via parsePosts)", () => {
  test("decodes named and numeric entities in title.rendered", () => {
    const [post] = parsePosts([
      wpPost({ title: { rendered: "PhD in Caf&#233; Studies &amp; Culture at UvA, Netherlands" } }),
    ]);
    expect(post.title).toBe("PhD in Café Studies & Culture at UvA, Netherlands");
  });

  test("decodes hex entities", () => {
    const [post] = parsePosts([wpPost({ title: { rendered: "Postdoc in M&#xFC;nster, Germany" } })]);
    expect(post.title).toBe("Postdoc in Münster, Germany");
  });

  test("strips HTML tags from the title before parsing", () => {
    const [post] = parsePosts([
      wpPost({ title: { rendered: "<b>PhD</b> Position at TUDelft, Netherlands" } }),
    ]);
    expect(post.title).toBe("PhD Position at TUDelft, Netherlands");
    expect(post.company).toBe("TUDelft");
  });
});

describe("parseCompanyLocation", () => {
  test("splits at the first comma after 'at'", () => {
    expect(parseCompanyLocation("Postdoc at Lund University, Scania, Sweden")).toEqual({
      company: "Lund University",
      location: "Scania, Sweden",
    });
  });

  test("handles a title with 'at' but no comma", () => {
    expect(parseCompanyLocation("Lecturer at Oxford")).toEqual({
      company: "Oxford",
      location: null,
    });
  });

  test("returns nulls when the pattern is absent", () => {
    expect(parseCompanyLocation("General Application Round")).toEqual({
      company: null,
      location: null,
    });
  });

  test("is case-insensitive on 'at'", () => {
    expect(parseCompanyLocation("Assistant Professor AT TU Delft, Netherlands")).toEqual({
      company: "TU Delft",
      location: "Netherlands",
    });
  });
});

describe("jobageToAfter", () => {
  const NOW = new Date("2026-10-13T12:00:00Z");

  test("converts days to a WP REST after= ISO timestamp (no timezone suffix)", () => {
    expect(jobageToAfter(7, NOW)).toBe("2026-10-06T12:00:00");
  });

  test("returns null for the all-time sentinel 9999 and non-positive input", () => {
    expect(jobageToAfter(9999, NOW)).toBeNull();
    expect(jobageToAfter(0, NOW)).toBeNull();
    expect(jobageToAfter(-5, NOW)).toBeNull();
  });
});

describe("parsePostDetail", () => {
  const detailPost = wpPost({
    content: {
      rendered: [
        "<p>UBC invites applications for a Postdoctoral Fellow.</p>",
        "<p><strong>Deadline :</strong> 30 November 2026</p>",
        '<p><a href="https://www.postdocs.ubc.ca/positions/101602"><strong>View details &amp; Apply</strong></a></p>',
        '<p><a href="https://vacancyedu.com/about/">About us</a></p>',
      ].join("\n"),
    },
  });

  test("extracts description text, deadlines, and external apply links", () => {
    const job = parsePostDetail(detailPost);
    expect(job).not.toBeNull();
    expect(job!.description).toContain("UBC invites applications");
    expect(job!.description).not.toContain("<p>"); // tags stripped
    expect(job!.deadlines).toEqual(["30 November 2026"]);
    // vacancyedu's own links are excluded; the external apply link is kept.
    expect(job!.applyLinks).toEqual(["https://www.postdocs.ubc.ca/positions/101602"]);
  });

  test("returns null on a non-object payload", () => {
    expect(parsePostDetail(null)).toBeNull();
    expect(parsePostDetail("nope")).toBeNull();
  });
});

describe("extractDeadlines / extractApplyLinks / htmlToText", () => {
  test("collects multiple deadline lines from an aggregated post, uniquely", () => {
    const html = [
      "<p><strong>Deadline :</strong> 1 December 2026</p>",
      "<p><strong>Deadline :</strong> 15 January 2027</p>",
      "<p><strong>Deadline :</strong> 1 December 2026</p>",
    ].join("");
    expect(extractDeadlines(html)).toEqual(["1 December 2026", "15 January 2027"]);
  });

  test("preserves paragraph breaks as newlines", () => {
    expect(htmlToText("<p>One</p><p>Two</p>")).toBe("One\nTwo");
  });

  test("keeps list items on their own lines", () => {
    expect(htmlToText("<ul><li>A</li><li>B</li></ul>")).toBe("A\nB");
  });
});
