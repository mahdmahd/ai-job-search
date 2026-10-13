import { describe, test, expect } from "bun:test";
import {
  parseJobCards,
  parseJobDetail,
  parseResultCount,
  extractJobPosting,
  normalizeEmploymentType,
  resolveHref,
} from "../src/helpers";

// Fixture mirrors the live Madgex "lister" markup (verified against
// www.nature.com/naturecareers/searchjobs/ 2026-10-13): href values contain
// stray newlines/whitespace, meta items are <li class="lister__meta-item ...">,
// the relative age lives in <li class="job-actions__action pipe">.
function card(opts: {
  id: string;
  href: string;
  title: string;
  company?: string | null;
  location?: string | null;
  salary?: string | null;
  snippet?: string | null;
  age?: string | null;
}): string {
  const meta = (cls: string, v: string | null | undefined) =>
    v == null ? "" : `<li class="lister__meta-item ${cls}">${v}</li>`;
  const age =
    opts.age == null ? "" : `<li class="job-actions__action pipe">${opts.age}</li>`;
  const snippet =
    opts.snippet == null ? "" : `<p class="lister__description js-clamp-2">${opts.snippet}</p>`;
  return `<li class="lister__item cf" id="item-${opts.id}">
    <div class="lister__details cf js-clickable">
      <h3 class="lister__header"><a
 href="${opts.href}"
 class="js-clickable-area-link"><span>${opts.title}</span></a></h3>
      <ul class="lister__meta">
        ${meta("lister__meta-item--location", opts.location)}
        ${meta("lister__meta-item--salary", opts.salary)}
        ${meta("lister__meta-item--recruiter", opts.company)}
      </ul>
      ${snippet}
      <ul class="job-actions">${age}
        <li class="job-actions__action job-actions__action--shortlist"></li>
      </ul>
    </div>
  </li>`;
}

function page(...cards: string[]): string {
  return `<html><body><ul id="listing" class="lister cf block">${cards.join("\n")}</ul></body></html>`;
}

describe("parseJobCards", () => {
  test("extracts every contract field from a full card", () => {
    const [c] = parseJobCards(
      page(
        card({
          id: "12864992",
          href: " \n\t/naturecareers/job/12864992/postdoc-in-statistical-genetics/\n",
          title: "Postdoc in Statistical Genetics",
          company: "Human Technopole",
          location: "Milan (IT)",
          salary: "Up to € 43.000",
          snippet: "Join Human Technopole in Milan...",
          age: "19 days ago",
        }),
      ),
    );
    expect(c.id).toBe("12864992");
    expect(c.title).toBe("Postdoc in Statistical Genetics");
    expect(c.company).toBe("Human Technopole");
    expect(c.location).toBe("Milan (IT)");
    expect(c.salary).toBe("Up to € 43.000");
    expect(c.snippet).toContain("Human Technopole");
    expect(c.date).toBe("19 days ago");
    // Whitespace/newlines inside href are trimmed and the path resolved.
    expect(c.url).toBe(
      "https://www.nature.com/naturecareers/job/12864992/postdoc-in-statistical-genetics/",
    );
    expect(/\s/.test(c.url)).toBe(false);
  });

  test("absent salary/age/snippet are null, never omitted keys", () => {
    const [c] = parseJobCards(
      page(card({ id: "200", href: "/naturecareers/job/200/x/", title: "Bare" })),
    );
    expect(c.salary).toBeNull();
    expect(c.date).toBeNull();
    expect(c.snippet).toBeNull();
    expect(c.company).toBeNull();
    expect(c.location).toBeNull();
    expect(Object.keys(c).sort()).toEqual(
      ["company", "date", "id", "location", "salary", "snippet", "title", "url"].sort(),
    );
  });

  test("a malformed card is skipped without breaking its neighbours", () => {
    const html = page(
      card({ id: "1", href: "/naturecareers/job/1/ok-one/", title: "First Role" }),
      // no header link at all — an empty ad card
      `<li class="lister__item cf" id="item-2"><div class="lister__details"></div></li>`,
      // header present but no anchor href
      `<li class="lister__item cf" id="item-3"><h3 class="lister__header"><a class="x"></a></h3></li>`,
      card({ id: "4", href: "/naturecareers/job/4/ok-two/", title: "Second Role" }),
    );
    const cards = parseJobCards(html);
    expect(cards.map((c) => c.id)).toEqual(["1", "4"]);
  });

  test("decodes HTML entities in title and company", () => {
    const [c] = parseJobCards(
      page(
        card({
          id: "9",
          href: "/naturecareers/job/9/x/",
          title: "Caf&#233; Research Fellow",
          company: "N&#xF8;rrebro Uni",
        }),
      ),
    );
    expect(c.title).toBe("Café Research Fellow");
    expect(c.company).toBe("Nørrebro Uni");
  });

  test("returns an empty array for an empty page", () => {
    expect(parseJobCards("<html><body>No jobs.</body></html>")).toEqual([]);
  });
});

describe("parseResultCount", () => {
  test("reads the analytics returned-results signal", () => {
    const html = `var cfg = [{\n'keywords': 'postdoc',\n'returned\\x2dresults': '159',\n'page\\x2dnumber': '1'}];`;
    expect(parseResultCount(html)).toBe(159);
  });

  test("falls back to the meta description count", () => {
    const html = `<meta name="description" content="42 jobs using the term &#39;postdoc&#39; to view">`;
    expect(parseResultCount(html)).toBe(42);
  });

  test("returns null when neither signal is present", () => {
    expect(parseResultCount("<html></html>")).toBeNull();
  });
});

describe("resolveHref", () => {
  test("trims internal whitespace and resolves relative paths", () => {
    expect(resolveHref(" \n\t/naturecareers/job/1/x/ \n")).toBe(
      "https://www.nature.com/naturecareers/job/1/x/",
    );
  });
  test("leaves absolute URLs alone", () => {
    expect(resolveHref("https://www.nature.com/naturecareers/job/1/x/")).toBe(
      "https://www.nature.com/naturecareers/job/1/x/",
    );
  });
});

// --- Detail ---------------------------------------------------------------

function detailPage(ldJson: string[], extras = ""): string {
  const scripts = ldJson
    .map((j) => `<script type="application/ld+json">${j}</script>`)
    .join("\n");
  return `<html><head>${scripts}${extras}</head>
    <body><h1>Fallback Title</h1>
    <a href="/naturecareers/apply/12864992/some-job?LinkSource=JobDetails">Apply</a>
    </body></html>`;
}

const jobPosting = {
  "@context": "https://schema.org/",
  "@type": "JobPosting",
  title: "Postdoc in Statistical Genetics",
  description:
    "<p><b>Build the science</b> that shapes health.<br />\r\nSecond line.</p>\r\n<ul>\r\n<li>Python</li>\r\n</ul>",
  datePosted: "2026-09-24T13:40:00.000Z",
  validThrough: "2026-11-04T23:59:00.000Z",
  hiringOrganization: { "@type": "Organization", name: "Human Technopole" },
  jobLocation: [{ "@type": "Place", address: { "@type": "PostalAddress", addressLocality: "Milan", addressCountry: "IT" } }],
  employmentType: '["FULL_TIME"]',
};

describe("extractJobPosting", () => {
  test("picks the JobPosting out of several ld+json scripts", () => {
    const html = detailPage([
      JSON.stringify({ "@type": "Organization", name: "Other" }),
      JSON.stringify(jobPosting),
      "this one is not even json {",
    ]);
    const posting = extractJobPosting(html);
    expect(posting?.title).toBe("Postdoc in Statistical Genetics");
  });

  test("returns null when no JobPosting is present", () => {
    expect(extractJobPosting(detailPage([JSON.stringify({ "@type": "BreadcrumbList" })]))).toBeNull();
    expect(extractJobPosting("<html></html>")).toBeNull();
  });
});

describe("parseJobDetail", () => {
  test("maps JSON-LD fields: title, company, dates, employmentType, location", () => {
    const job = parseJobDetail(detailPage([JSON.stringify(jobPosting)]), "12864992");
    expect(job.id).toBe("12864992");
    expect(job.title).toBe("Postdoc in Statistical Genetics");
    expect(job.company).toBe("Human Technopole");
    expect(job.location).toBe("Milan, IT");
    expect(job.date).toBe("2026-09-24T13:40:00.000Z");
    expect(job.deadline).toBe("2026-11-04T23:59:00.000Z");
    // '["FULL_TIME"]' (JSON-array-as-string, observed live) normalized.
    expect(job.employmentType).toBe("FULL_TIME");
    expect(job.applyUrl).toBe(
      "https://www.nature.com/naturecareers/apply/12864992/some-job?LinkSource=JobDetails",
    );
    expect(job.url).toBe("https://www.nature.com/naturecareers/job/12864992/");
  });

  test("description HTML becomes readable text with paragraph breaks", () => {
    const job = parseJobDetail(detailPage([JSON.stringify(jobPosting)]), "1");
    expect(job.description).toContain("Build the science that shapes health.");
    expect(job.description).not.toMatch(/<[^>]+>/);
    expect(job.description).toContain("Python");
    // <br /> produced a line break before Second line.
    expect(job.description).toMatch(/health\.\nSecond line\./);
  });

  test("falls back to h1 and emits nulls when JSON-LD is absent", () => {
    const job = parseJobDetail("<html><body><h1>Only a Title</h1></body></html>", "7");
    expect(job.title).toBe("Only a Title");
    expect(job.company).toBeNull();
    expect(job.location).toBeNull();
    expect(job.date).toBeNull();
    expect(job.deadline).toBeNull();
    expect(job.employmentType).toBeNull();
    expect(job.description).toBeNull();
    expect(job.applyUrl).toBeNull();
  });

  test("uses LocationDescription when jobLocation has only a country", () => {
    const posting = {
      ...jobPosting,
      jobLocation: [{ "@type": "Place", address: { "@type": "PostalAddress", addressCountry: "IT" } }],
    };
    const job = parseJobDetail(
      detailPage([JSON.stringify(posting)], `"LocationDescription": "Milan (IT)"`),
      "5",
    );
    expect(job.location).toBe("Milan (IT)");
  });

  test("every detail key is present even when its value is null", () => {
    const job = parseJobDetail("<html></html>", "3");
    expect(Object.keys(job).sort()).toEqual(
      [
        "applyUrl",
        "company",
        "date",
        "deadline",
        "description",
        "employmentType",
        "id",
        "location",
        "title",
        "url",
      ].sort(),
    );
    expect(job.title).toBe("(untitled)");
  });
});

describe("normalizeEmploymentType", () => {
  test("handles plain string, array, and JSON-encoded array", () => {
    expect(normalizeEmploymentType("FULL_TIME")).toBe("FULL_TIME");
    expect(normalizeEmploymentType('["FULL_TIME"]')).toBe("FULL_TIME");
    expect(normalizeEmploymentType('["FULL_TIME", "PART_TIME"]')).toBe("FULL_TIME, PART_TIME");
    expect(normalizeEmploymentType(["CONTRACTOR"])).toBe("CONTRACTOR");
    expect(normalizeEmploymentType(null)).toBeNull();
    expect(normalizeEmploymentType("")).toBeNull();
  });
});
