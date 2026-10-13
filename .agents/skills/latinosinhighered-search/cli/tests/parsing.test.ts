import { describe, expect, test } from "bun:test";
import {
  extractApplyUrl,
  findJobPosting,
  htmlToText,
  normalizeId,
  parseDetailTable,
  parseJobCards,
  parseJobDetail,
} from "../src/helpers";

// Offline fixtures transcribed from live latinosinhighered.com markup
// (verified 2026-10-13). The `a.job-link` anchor and the sp_sh_* spans are
// load-bearing: the featured-jobs module is the only card container the GET
// search endpoint returns.

const SEARCH_FIXTURE = `
<div class="col-right">
  <div class="featured-jobs similar-jobs"><div class="wrap"></div></div>
  <div class="featured-jobs">
    <div class="wrap">
      <h2>Featured Jobs</h2>
      <ul class="fjList">
        <li > <a class="job-link" tabindex="50" href="/career/178894/bersoff-faculty-fellow-department-philosophy-new-york-new-york"> <span class="featured-jobs-title">Bersoff Faculty Fellow, Department of Philosophy</span> <span class="featured-jobs-location">       <span class="sp_sh_item sp_sh_employer">
New York University Arts and Science
   </span>                      <span class="sp_sh_item sp_sh_city">
New York
    </span>    <span class="sp_sh_item sp_sh_region">
New York
                                                   </span>                                                                     </span> </a>  </li>
        <li > <a class="job-link" tabindex="50" href="/career/179124/technician-maintenance-texas-austin"> <span class="featured-jobs-title">Technician, Maintenance</span> <span class="featured-jobs-location">       <span class="sp_sh_item sp_sh_employer">
Austin Community College
   </span>                      <span class="sp_sh_item sp_sh_city">
Austin
    </span>    <span class="sp_sh_item sp_sh_region">
Texas
                             </span>                                                                     </span> </a>  <span class="company-logo"><span>  <img src="/attachments/employer/6/692/152/1451.jpg" alt="Symphony-Talent"/>  </span></span>  </li>
        <li > <a class="job-link" tabindex="50" href="/career/179121/associate-campus-custodial-operations-17-texas-austin"> <span class="featured-jobs-title">Associate, Campus Custodial Operations-17 &amp; Grounds</span> <span class="featured-jobs-location">       <span class="sp_sh_item sp_sh_employer">
Austin Community College
   </span>                      <span class="sp_sh_item sp_sh_city">
Austin
    </span>    <span class="sp_sh_item sp_sh_region">
Texas
                             </span>                                                                     </span> </a>  </li>
      </ul>
      <a href="/candidate/job_search/featured/results" class="btn__primary btn__warning">MORE JOBS LIKE THESE</a>
    </div>
  </div>
</div>
`;

const DETAIL_FIXTURE = `
<html><head><title> Clinical Assistant Professor of Economics Job in New York,  Economics, Statistics Career, Full Time Jobs in New York University Arts and Science </title>
<script type="application/ld+json">{"@context":"http://schema.org/","@type":"JobPosting","datePosted":"2026-10-12T06:52:27","validThrough":"2027-01-10T06:52:27","title":"Clinical Assistant Professor of Economics","description":"\\u003cp\\u003eFirst &amp; intro paragraph.\\u003c/p\\u003e \\n\\u003cp\\u003eSecond paragraph with a deadline: April 7, 2027.\\u003c/p\\u003e","hiringOrganization":{"@type":"Organization","name":"New York University Arts and Science"}}</script>
</head><body>
<div class="jobsearchTpl holder_job_details holder_inner">
<table class="details">
<tr><td class="f vac_item_ref"> Job Ref:&nbsp;</td><td>Ref_179106</td></tr>
<tr><td class="f vac_item_employer"> Employer:&nbsp;</td><td> <a href="/employer/company/6692/Symphony-Talent">New York University Arts and Science</a><br/>  </td></tr>
<tr><td class="f vac_item_industry"> Category:&nbsp;</td><td>Economics, Statistics</td></tr>
<tr><td class="f vac_item_job_type"> Job Type:&nbsp;</td><td>Full Time</td></tr>
<tr><td class="f vac_item_salary"> Salary and Benefits:&nbsp;</td><td>$93,730</td></tr>
<tr><td class="f vac_item_education"> Required Education:&nbsp;</td><td>Ph.D.</td></tr>
<tr><td class="f vac_item_experience"> Required Experience:&nbsp;</td><td>substantial evidence of high-quality teaching</td></tr>
<tr><td class="f vac_item_city"> City:&nbsp;</td><td>New York</td></tr>
<tr><td class="f vac_item_region"> State:&nbsp;</td><td>New York</td></tr>
<tr> <td colspan="2" class="f vac_item_description_section"> <br /><h3>Description</h3> </td> </tr>
<tr><td colspan="2" class="job_desc_td"><p><strong>Clinical Assistant Professor of Economics</strong><br /><strong>Department of Economics</strong></p> <p>Body copy from the page cell.</p></td></tr>
</table>
<div class="ref-date">    <span class="ref">ref: (Ref_179106)</span>    <span class="post_date">13 hours ago</span>  </div>
<script>
function apply() {
JsonHelper.vacancyRedirectApply(179106, 6692);
var rUrl = 'https://apply.interfolio.com/194029'.replace(/&amp;/gi, "&");
window.open(rUrl);
}
</script>
</div>
</body></html>
`;

describe("parseJobCards", () => {
  const cards = parseJobCards(SEARCH_FIXTURE);

  test("extracts one card per a.job-link chunk", () => {
    expect(cards).toHaveLength(3);
  });

  test("extracts id and canonical url from the /career/ href", () => {
    expect(cards[0].id).toBe("178894");
    expect(cards[0].url).toBe(
      "https://latinosinhighered.com/career/178894/bersoff-faculty-fellow-department-philosophy-new-york-new-york",
    );
    expect(cards[2].id).toBe("179121");
  });

  test("extracts title, company, location (city, region)", () => {
    expect(cards[0].title).toBe("Bersoff Faculty Fellow, Department of Philosophy");
    expect(cards[0].company).toBe("New York University Arts and Science");
    expect(cards[0].location).toBe("New York, New York");
    expect(cards[1].title).toBe("Technician, Maintenance");
    expect(cards[1].location).toBe("Austin, Texas");
  });

  test("decodes HTML entities in titles", () => {
    expect(cards[2].title).toBe("Associate, Campus Custodial Operations-17 & Grounds");
  });

  test("date is null on search cards (no date element) and the key is present", () => {
    for (const c of cards) {
      expect("date" in c).toBe(true);
      expect(c.date).toBeNull();
    }
  });

  test("every contract key is present on every card, null never omitted", () => {
    for (const c of cards) {
      for (const k of ["id", "title", "company", "location", "date", "url"]) {
        expect(k in c).toBe(true);
      }
    }
  });

  test("a card without a /career/ href is skipped without breaking the rest", () => {
    const broken = `
      <a class="job-link" tabindex="50" href="/candidate/job_search/featured/results"> <span class="featured-jobs-title">Not a job</span> </a>
      <a class="job-link" tabindex="50" href="/career/180000/real-job-new-york-new-york"> <span class="featured-jobs-title">Real Job</span> </a>
    `;
    const parsed = parseJobCards(broken);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].id).toBe("180000");
  });

  test("duplicate ids are deduplicated (featured rotation repeats cards)", () => {
    const dup = `
      <a class="job-link" href="/career/180001/dup-job-austin-texas"> <span class="featured-jobs-title">Dup Job</span> <span class="sp_sh_item sp_sh_employer">ACC</span> </a>
      <a class="job-link" href="/career/180001/dup-job-austin-texas"> <span class="featured-jobs-title">Dup Job</span> <span class="sp_sh_item sp_sh_employer">ACC</span> </a>
    `;
    expect(parseJobCards(dup)).toHaveLength(1);
  });
});

describe("findJobPosting", () => {
  test("parses the JSON-LD JobPosting incl. unicode-escaped description", () => {
    const posting = findJobPosting(DETAIL_FIXTURE);
    expect(posting).not.toBeNull();
    expect(posting!.datePosted).toBe("2026-10-12T06:52:27");
    expect(posting!.validThrough).toBe("2027-01-10T06:52:27");
  });

  test("returns null when there is no JobPosting script", () => {
    expect(findJobPosting("<html><body>nothing</body></html>")).toBeNull();
  });
});

describe("parseDetailTable", () => {
  const table = parseDetailTable(DETAIL_FIXTURE);

  test("maps label cells (visible text) to cleaned values", () => {
    expect(table["employer"]).toBe("New York University Arts and Science");
    expect(table["category"]).toBe("Economics, Statistics");
    expect(table["job type"]).toBe("Full Time");
    expect(table["salary and benefits"]).toBe("$93,730");
    expect(table["required education"]).toBe("Ph.D.");
    expect(table["required experience"]).toBe("substantial evidence of high-quality teaching");
    expect(table["city"]).toBe("New York");
    expect(table["state"]).toBe("New York");
  });

  test("skips the colspan description-section row (no value cell)", () => {
    expect("description" in table).toBe(false);
  });
});

describe("extractApplyUrl", () => {
  test("reads the external rUrl from the inline apply JS", () => {
    expect(extractApplyUrl(DETAIL_FIXTURE)).toBe("https://apply.interfolio.com/194029");
  });

  test("returns null when no rUrl is present", () => {
    expect(extractApplyUrl("<html></html>")).toBeNull();
  });
});

describe("parseJobDetail", () => {
  const job = parseJobDetail(DETAIL_FIXTURE, "179106");

  test("reads title, company from JSON-LD + table", () => {
    expect(job.title).toBe("Clinical Assistant Professor of Economics");
    expect(job.company).toBe("New York University Arts and Science");
  });

  test("location joins city and state", () => {
    expect(job.location).toBe("New York, New York");
  });

  test("date comes from JSON-LD datePosted; validThrough is exposed", () => {
    expect(job.date).toBe("2026-10-12T06:52:27");
    expect(job.datePosted).toBe("2026-10-12T06:52:27");
    expect(job.validThrough).toBe("2027-01-10T06:52:27");
  });

  test("description is readable text: tags stripped, breaks preserved, entities decoded", () => {
    expect(job.description).toBe(
      "First & intro paragraph.\n\nSecond paragraph with a deadline: April 7, 2027.",
    );
    expect(job.description).not.toContain("<");
  });

  test("category, jobType, salary, requirements and applyUrl are populated", () => {
    expect(job.category).toBe("Economics, Statistics");
    expect(job.jobType).toBe("Full Time");
    expect(job.salary).toBe("$93,730");
    expect(job.requiredEducation).toBe("Ph.D.");
    expect(job.requiredExperience).toBe("substantial evidence of high-quality teaching");
    expect(job.applyUrl).toBe("https://apply.interfolio.com/194029");
  });

  test("every contract key is present, null never omitted", () => {
    for (const k of [
      "id", "title", "company", "location", "date", "url", "description",
      "datePosted", "validThrough", "category", "jobType", "salary",
      "requiredEducation", "requiredExperience", "applyUrl",
    ]) {
      expect(k in job).toBe(true);
    }
  });

  test("falls back to job_desc_td when the JSON-LD has no description", () => {
    const noDesc = DETAIL_FIXTURE.replace(
      /"description":"(\\u003cp\\u003eFirst &amp; intro paragraph\.\\u003c\/p\\u003e \\n\\u003cp\\u003eSecond paragraph with a deadline: April 7, 2027\.\\u003c\/p\\u003e)"/,
      '"description":""',
    );
    const job2 = parseJobDetail(noDesc, "179106");
    expect(job2.description).toContain("Body copy from the page cell.");
  });

  test("falls back to span.post_date when the JSON-LD has no datePosted", () => {
    const noDate = DETAIL_FIXTURE.replace('"datePosted":"2026-10-12T06:52:27"', '"datePosted":""');
    const job3 = parseJobDetail(noDate, "179106");
    expect(job3.date).toBe("13 hours ago");
  });
});

describe("htmlToText", () => {
  test("preserves paragraph breaks and decodes entities", () => {
    expect(htmlToText("<p>One &amp; two</p><p>Three<br />four</p>")).toBe(
      "One & two\nThree\nfour",
    );
  });

  test("returns null for empty input", () => {
    expect(htmlToText("")).toBeNull();
    expect(htmlToText("<p>   </p>")).toBeNull();
  });
});

describe("normalizeId", () => {
  test("accepts a bare numeric id", () => {
    expect(normalizeId("179106")).toBe("179106");
  });

  test("accepts a full career URL with slug", () => {
    expect(
      normalizeId("https://latinosinhighered.com/career/179106/clinical-assistant-professor-economics-new-york-new-york"),
    ).toBe("179106");
  });

  test("accepts a scheme-less host URL and a site-relative path", () => {
    expect(normalizeId("latinosinhighered.com/career/179106/some-slug")).toBe("179106");
    expect(normalizeId("/career/179106/some-slug")).toBe("179106");
  });

  test("accepts an id-only career URL", () => {
    expect(normalizeId("https://latinosinhighered.com/career/179106/")).toBe("179106");
  });

  test("rejects a foreign job-board host", () => {
    expect(normalizeId("https://boards.greenhouse.io/acme/jobs/4567890")).toBeNull();
  });

  test("rejects look-alike and userinfo hosts", () => {
    expect(normalizeId("https://latinosinhighered.com.evil.io/career/179106/x")).toBeNull();
    expect(normalizeId("https://latinosinhighered.com@evil.io/career/179106/x")).toBeNull();
  });

  test("rejects unrelated text and short digits", () => {
    expect(normalizeId("apply now")).toBeNull();
    expect(normalizeId("179")).toBeNull();
    expect(normalizeId("")).toBeNull();
  });
});
