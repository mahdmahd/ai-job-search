import { describe, test, expect } from "bun:test";
import {
  parseJobCards,
  parseJobDetail,
  siteEncode,
} from "../src/helpers";
import { normalizeId } from "../src/commands/detail";

// Fixtures mirror the real markup shapes verified against live pages
// (featured `standardJobContainer` card, plain `<li>` card, detail page).

const FEATURED_CARD = `<li class="standardJobContainer">
    <div class="d-flex flex-column flex-sm-row align-items-top mt-2 mt-md-0">
        <div class="ps-3">
            <h3><a href="/job_display/297575/Post_Doctoral_Researcher_Research_Scientist_Position_in_Vaccine_Immunology_Institut_Pasteur_Paris_France">Post-Doctoral Researcher/Research Scientist Position in Vaccine Immunology</a></h3>
            <div class="companyName">Institut Pasteur</div>
            <div class="location">Paris, France</div>
        </div>
    </div>
    <div class="row">
        <div class="col-md-8">
            <div class="postedDate">
                                Posted 3 days ago
                                    &nbsp;&nbsp;
                    Deadline 31 December
            </div>
        </div>
    </div>
</li>`;

const PLAIN_CARD = `<li>
    <div class="row mt-2 mt-md-0">
        <div class="col">
            <h3><a href="/job_display/296893/Postdoc_in_the_Many_Body_Quantum_Optics_Group">Postdoc in the Many-Body Quantum Optics Group</a></h3>
        </div>
    </div>
</li>`;

describe("siteEncode", () => {
  test("lowercases and maps spaces to underscores", () => {
    expect(siteEncode("PhD candidate")).toBe("phd_candidate");
  });
  test("maps slashes to triple underscores (site JS convention)", () => {
    expect(siteEncode("Researcher/Scientist")).toBe("researcher___scientist");
  });
});

describe("parseJobCards", () => {
  test("featured card yields id/title/company/location/date/url", () => {
    const cards = parseJobCards(`<ul>${FEATURED_CARD}</ul>`);
    expect(cards).toHaveLength(1);
    expect(cards[0].id).toBe("297575");
    expect(cards[0].title).toContain("Vaccine Immunology");
    expect(cards[0].company).toBe("Institut Pasteur");
    expect(cards[0].location).toBe("Paris, France");
    expect(cards[0].date).toBe("3 days ago");
    expect(cards[0].url).toBe(
      "https://www.eurosciencejobs.com/job_display/297575/Post_Doctoral_Researcher_Research_Scientist_Position_in_Vaccine_Immunology_Institut_Pasteur_Paris_France",
    );
  });

  test("plain card yields title/id/url with null metadata", () => {
    const cards = parseJobCards(`<ul>${PLAIN_CARD}</ul>`);
    expect(cards).toHaveLength(1);
    expect(cards[0].id).toBe("296893");
    expect(cards[0].company).toBeNull();
    expect(cards[0].location).toBeNull();
    expect(cards[0].date).toBeNull();
    expect(cards[0].url).toContain("/job_display/296893/");
  });

  test("one malformed card does not break the rest", () => {
    const bad = `<li><h3><a href="/job_display/999/No_Title_X"></a></h3></li>`;
    const cards = parseJobCards(`<ul>${bad}${FEATURED_CARD}${PLAIN_CARD}</ul>`);
    expect(cards.map((c) => c.id).sort()).toEqual(["296893", "297575"]);
  });

  test("empty page yields no results, not a crash", () => {
    expect(parseJobCards("<html><body>no jobs</body></html>")).toHaveLength(0);
  });

  test("never omits result keys (nulls, never undefined)", () => {
    for (const c of parseJobCards(`<ul>${PLAIN_CARD}</ul>`)) {
      for (const k of ["id", "title", "company", "location", "date", "url"] as const) {
        expect(c[k]).not.toBeUndefined();
      }
    }
  });
});

const DETAIL_HTML = `<html><head><title>Postdoc in Optics - ExampleLab, Berlin</title></head><body>
<h1>Postdoc in Optics</h1>
<div class="jobDisplay">
<h2 style="text-align: center;">Postdoc in Optics</h2>
<h2 style="text-align: center;">ExampleLab</h2>
<h2 style="text-align: center;">Berlin, Germany</h2>
<h3>Background:</h3>
<p>We seek a motivated researcher &amp; colleague.</p>
<p><div class='mt-5'><button class='btn callToAction'>Apply Now</button><strong class='ms-3'>Deadline 15 January</strong></div></p>
</div>
<!-- Job Description end -->
</body></html>`;

describe("parseJobDetail", () => {
  test("extracts title/company/location/deadline/description/active", () => {
    const job = parseJobDetail(DETAIL_HTML, "123456");
    expect(job.title).toBe("Postdoc in Optics");
    expect(job.company).toBe("ExampleLab");
    expect(job.location).toBe("Berlin, Germany");
    expect(job.deadline).toBe("15 January");
    expect(job.description).toContain("motivated researcher & colleague");
    expect(job.isActive).toBe(true);
  });

  test("closed posting (no Apply button) is not active", () => {
    const closed = DETAIL_HTML.replace("Apply Now", "Applications closed");
    expect(parseJobDetail(closed, "123456").isActive).toBe(false);
  });
});

describe("detail id parsing", () => {
  test("bare numeric id passes through", () => {
    expect(normalizeId("297575")).toBe("297575");
  });
  test("full job_display URL yields the id", () => {
    expect(
      normalizeId(
        "https://www.eurosciencejobs.com/job_display/297575/Some_Slug_Here",
      ),
    ).toBe("297575");
  });
  test("foreign hosts are rejected", () => {
    expect(normalizeId("https://example.com/job_display/297575/x")).toBeNull();
    expect(normalizeId("not a job at all")).toBeNull();
  });
});
