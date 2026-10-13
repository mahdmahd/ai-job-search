import { describe, test, expect } from "bun:test";
import {
  parseJobCards,
  parseJobDetail,
  parseResultCount,
  extractJobRecord,
  descriptionToText,
  refFromUrl,
  resolveHref,
  looksLikeAdvertPage,
} from "../src/helpers";

// Fixture mirrors the live jobs.ac.uk search markup (verified 2026-10-13):
// <div class="j-search-result__result ...?" data-advert-id="..."> with
// .j-search-result__text > a[href^="/job/"], .j-search-result__department,
// .j-search-result__employer > b, a bare "<div>Location:" div,
// .j-search-result__info ("Salary: ..."), "Date Placed: ...",
// .j-search-result__date--blue (closing date).
function card(opts: {
  id: string;
  ref: string;
  slug: string;
  title: string;
  company?: string | null;
  department?: string | null;
  location?: string | null;
  salary?: string | null;
  placed?: string | null;
  closes?: string | null;
  extraClass?: string;
}): string {
  const block = (cls: string, label: string, v: string | null | undefined) =>
    v == null ? "" : `<div class="${cls}">${label}${v}</div>`;
  const location =
    opts.location == null ? "" : `<div>Location:\n            ${opts.location}\n        </div>`;
  const placed =
    opts.placed == null
      ? ""
      : `<div>\n            <strong>Date Placed: </strong>${opts.placed}\n        </div>`;
  const closes =
    opts.closes == null
      ? ""
      : `<span class="j-search-result__date-span j-search-result__date--blue ">${opts.closes}</span>`;
  return `<div class="j-search-result__result${opts.extraClass ?? ""}" data-advert-id="${opts.id}">
    <div class="j-search-result__text">
        <a href="/job/${opts.ref}/${opts.slug}">
            ${opts.title}
        </a>
        ${block("j-search-result__department", "", opts.department)}
        <div class="j-search-result__employer">
            <b>${opts.company ?? ""}</b>
        </div>
        ${location}
        <div class="j-search-result__info">
            <strong>Salary: </strong>
                            ${opts.salary ?? ""}
                    </div>
        ${placed}
    </div>
    <div class="j-search-result__date-logos">
        <div class="j-search-result__date">
            <span class="j-search-result__date-span j-search-result__date">Closes</span>
            ${closes}
        </div>
    </div>
</div>`;
}

function page(...cards: string[]): string {
  return `<html><body><strong class="job-count">42</strong> Jobs Found${cards.join("\n")}</body></html>`;
}

describe("parseJobCards", () => {
  test("extracts every contract field from a full card", () => {
    const [c] = parseJobCards(
      page(
        card({
          id: "1083631",
          ref: "DSL474",
          slug: "fully-funded-phd-studentship",
          title: "Fully Funded PhD Studentship",
          company: "The University of Manchester",
          department: "Materials",
          location: "Manchester",
          salary: "£21,805 - please see advert",
          placed: "31 Jul",
          closes: "30 Mar",
        }),
      ),
    );
    expect(c.id).toBe("1083631");
    expect(c.ref).toBe("DSL474");
    expect(c.title).toBe("Fully Funded PhD Studentship");
    expect(c.company).toBe("The University of Manchester");
    expect(c.department).toBe("Materials");
    expect(c.location).toBe("Manchester");
    expect(c.salary).toBe("£21,805 - please see advert");
    expect(c.date).toBe("31 Jul");
    expect(c.deadline).toBe("30 Mar");
    expect(c.url).toBe("https://www.jobs.ac.uk/job/DSL474/fully-funded-phd-studentship");
  });

  test("a highlighted card (extra class token) still parses", () => {
    const [c] = parseJobCards(
      page(
        card({
          id: "7",
          ref: "ABC1",
          slug: "x",
          title: "Highlighted Role",
          extraClass: " j-search-result__result--highlighted ie-border-left",
        }),
      ),
    );
    expect(c.id).toBe("7");
    expect(c.title).toBe("Highlighted Role");
  });

  test("absent fields are null, never omitted keys", () => {
    const [c] = parseJobCards(
      page(card({ id: "200", ref: "ZZ9", slug: "bare", title: "Bare" })),
    );
    expect(c.ref).toBe("ZZ9");
    expect(c.company).toBeNull();
    expect(c.department).toBeNull();
    expect(c.location).toBeNull();
    expect(c.salary).toBeNull();
    expect(c.date).toBeNull();
    expect(c.deadline).toBeNull();
    expect(Object.keys(c).sort()).toEqual(
      ["company", "date", "deadline", "department", "id", "location", "ref", "salary", "title", "url"].sort(),
    );
  });

  test("a malformed card is skipped without breaking its neighbours", () => {
    const html = page(
      card({ id: "1", ref: "AA1", slug: "ok-one", title: "First Role" }),
      // no anchor at all
      `<div class="j-search-result__result " data-advert-id="2"><div class="j-search-result__text"></div></div>`,
      // no advert id
      `<div class="j-search-result__result "><div class="j-search-result__text"><a href="/job/BB2/x">No Id</a></div></div>`,
      card({ id: "4", ref: "CC4", slug: "ok-two", title: "Second Role" }),
    );
    const cards = parseJobCards(html);
    expect(cards.map((c) => c.id)).toEqual(["1", "4"]);
  });

  test("decodes HTML entities in title and company", () => {
    const [c] = parseJobCards(
      page(
        card({
          id: "9",
          ref: "DD9",
          slug: "x",
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
  test("reads strong.job-count", () => {
    expect(parseResultCount(`<strong class="job-count">582</strong> Jobs Found`)).toBe(582);
    expect(parseResultCount(`<strong class="job-count">1,234</strong>`)).toBe(1234);
  });

  test("returns null when the count is absent", () => {
    expect(parseResultCount("<html></html>")).toBeNull();
  });
});

describe("refFromUrl / resolveHref", () => {
  test("pulls the REF out of a job path", () => {
    expect(refFromUrl("/job/DSL474/some-slug")).toBe("DSL474");
    expect(refFromUrl("/job/DSL474")).toBe("DSL474");
    expect(refFromUrl("/search/?keywords=x")).toBeNull();
  });

  test("resolves relative hrefs against the origin", () => {
    expect(resolveHref("/job/DSL474/slug")).toBe("https://www.jobs.ac.uk/job/DSL474/slug");
  });
});

// --- Detail ---------------------------------------------------------------

function detailPage(jobRecord: Record<string, unknown>, metaRows: [string, string][]): string {
  const rows = metaRows
    .map(([h, v]) => `<tr><th class="j-advert-details__table-header">${h}</th><td>${v}</td></tr>`)
    .join("\n");
  return `<html><head><script>var job = {"job": ${JSON.stringify(jobRecord)}};</script></head>
  <body>
    <h1 class="j-advert__title row-3">Fallback Title</h1>
    <h3 class="j-advert__employer row-4"><b><span>Fallback Uni</span></b> - Science</h3>
    <table>${rows}</table>
    <a href="https://example.edu/apply" target="_blank"><div id="job-apply-button" class="j-form-input"></div></a>
    <div id="job-description" class="row-8"><p>Fallback description.</p></div>
  </body></html>`;
}

const record = {
  reference: "DTG082",
  advert_id: "1090643",
  title: "PhD studentship: Plankton Imaging",
  employer_name: "University of Essex",
  department: "",
  location: "South East England",
  go_live_date: "12th October 2026",
  closing_date: "16th December 2026",
  salary_min: "21,805",
  salary_max: "21,805",
  title_uri_path: "phd-studentship-plankton",
  apply_url: "https://aries-dtp.ac.uk/studentships/fileman/",
  advert_text: "<p><strong>Theme: </strong>plankton.</p>\n<p>Apply now.</p>",
};

describe("extractJobRecord", () => {
  test("parses the embedded var job object with brace-aware scanning", () => {
    const html = `<script>var job = {"job": {"reference": "X1", "advert_text": "a { brace } and } more"}};</script>`;
    const rec = extractJobRecord(html);
    expect(rec?.reference).toBe("X1");
    expect(rec?.advert_text).toBe("a { brace } and } more");
  });

  test("returns null when the object is absent or broken", () => {
    expect(extractJobRecord("<html></html>")).toBeNull();
    expect(extractJobRecord(`<script>var job = {"job": {broken</script>`)).toBeNull();
  });
});

describe("parseJobDetail", () => {
  const meta: [string, string][] = [
    ["Qualification Type:", "PhD"],
    ["Location:", "Essex"],
    ["Hours:", "Full Time, Part Time"],
    ["Placed On:", "12th October 2026"],
    ["Closes:", "16th December 2026"],
  ];

  test("prefers the JS object for title/company/dates/apply, table for location", () => {
    const job = parseJobDetail(detailPage(record, meta), "DTG082");
    expect(job.id).toBe("DTG082");
    expect(job.advertId).toBe("1090643");
    expect(job.title).toBe("PhD studentship: Plankton Imaging");
    expect(job.company).toBe("University of Essex");
    expect(job.location).toBe("Essex");
    expect(job.date).toBe("12th October 2026");
    expect(job.deadline).toBe("16th December 2026");
    expect(job.salary).toBe("21,805 - 21,805");
    expect(job.employmentType).toBe("Full Time, Part Time");
    expect(job.applyUrl).toBe("https://aries-dtp.ac.uk/studentships/fileman/");
    expect(job.url).toBe("https://www.jobs.ac.uk/job/DTG082/phd-studentship-plankton/");
  });

  test("advert_text HTML becomes readable text", () => {
    const job = parseJobDetail(detailPage(record, meta), "DTG082");
    expect(job.description).toContain("Theme: plankton.");
    expect(job.description).toContain("Apply now.");
    expect(job.description).not.toMatch(/<[^>]+>/);
  });

  test("falls back to HTML anchors when the JS object is absent", () => {
    const html = detailPage({}, meta).replace(/<script>var job.*?<\/script>/, "");
    const job = parseJobDetail(html, "DTG082");
    expect(job.title).toBe("Fallback Title");
    expect(job.company).toBe("Fallback Uni");
    expect(job.location).toBe("Essex");
    expect(job.deadline).toBe("16th December 2026");
    expect(job.advertId).toBeNull();
    expect(job.description).toContain("Fallback description.");
  });

  test("every detail key is present even when its value is null", () => {
    const job = parseJobDetail("<html></html>", "ZZ9");
    expect(Object.keys(job).sort()).toEqual(
      [
        "advertId",
        "applyUrl",
        "company",
        "date",
        "deadline",
        "description",
        "employmentType",
        "id",
        "location",
        "salary",
        "title",
        "url",
      ].sort(),
    );
    expect(job.title).toBe("(untitled)");
    expect(job.id).toBe("ZZ9");
  });
});

describe("descriptionToText", () => {
  test("keeps paragraph breaks and decodes entities", () => {
    const out = descriptionToText("<p>First &pound;10</p><p>Second<br>line.</p>");
    expect(out).toContain("First £10");
    expect(out).toMatch(/10\nSecond\nline\./);
  });
});

describe("looksLikeAdvertPage", () => {
  test("rejects challenge/interstitial pages", () => {
    expect(looksLikeAdvertPage("<html><body><script>eval(packed-challenge)</script></body></html>")).toBe(false);
    expect(looksLikeAdvertPage(`<h1 class="j-advert__title">T</h1>`)).toBe(true);
  });
});
