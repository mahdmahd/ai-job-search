import { describe, expect, test } from "bun:test"
import {
  fold,
  isExternalPosting,
  isLostConnection,
  matchesFilters,
  normalizePosterId,
  parseExternalPosting,
  parseJobCards,
  parseJobDetail,
  parsePageCount,
  parseResultCount,
  type JobCard,
} from "../src/helpers.js"

// Trimmed from a live GC Jobs listing page, keeping the whitespace-heavy layout
// and the <br>-separated cells the parser depends on.
const LISTING_FIXTURE = `
<p><span class="pageli"><a href="page2440?requestedPage=2&amp;fromPage=1&amp;tab=1&amp;log=false">2</a>
, <a href="page2440?requestedPage=20&amp;fromPage=1&amp;tab=1&amp;log=false">20</a> of 20 [<a href="page2440?requestedPage=next">Next</a>]</span></p>
<li class="searchResultTabSelected">
  <a href="page2440?tab=1&amp;tabKeepCriteria=1" class="searchJobTabAnchor">Jobs open to the public (395)</a>
</li>
<ol start="1" class="posterInfo list-more-space">
  <li class="searchResult">
    <div>
      <strong>
        <a href="/psrs-srfp/applicant/page1800?poster=2445986">Director, Information Technology (IT) Audit, Audit operations</a>
      </strong>
    </div>
    <div class="tableTable">
      <div class="tableRow">
        <div class="tableCell">
          Closing date: 2026-08-02
          <br />
          Office of the Auditor General of Canada
          <br />
          Ottawa (Ontario)
        </div>
        <div class="tableCell">
          Bilingual - imperative
          <br />$151,272 to $185,702
        </div>
      </div>
    </div>
    <hr class="searchJobHrLine" />
  <li class="searchResult">
    <div><strong><a href="/psrs-srfp/applicant/page1800?poster=2430831">Conseill&#232;re en ressources humaines</a></strong></div>
    <div class="tableTable"><div class="tableRow">
      <div class="tableCell">
        Closing date: 2026-08-15<br />Sant&#233; Canada<br />Montr&#233;al Island (Qu&#233;bec)
      </div>
      <div class="tableCell">French essential</div>
    </div></div>
`

describe("listing parsing", () => {
  const cards = parseJobCards(LISTING_FIXTURE, "en")

  test("parses every search result", () => {
    expect(cards).toHaveLength(2)
  })

  test("splits the left cell into closing date, organization and location", () => {
    expect(cards[0]).toMatchObject({
      id: "2445986",
      title: "Director, Information Technology (IT) Audit, Audit operations",
      company: "Office of the Auditor General of Canada",
      location: "Ottawa (Ontario)",
      closingDate: "2026-08-02",
    })
  })

  test("splits the right cell into language requirement and salary", () => {
    expect(cards[0].languageRequirement).toBe("Bilingual - imperative")
    expect(cards[0].salary).toBe("$151,272 to $185,702")
  })

  test("date mirrors closingDate, since GC Jobs advertises no posting date", () => {
    expect(cards[0].date).toBe(cards[0].closingDate)
  })

  test("builds an absolute poster URL", () => {
    expect(cards[0].url).toBe(
      "https://emploisfp-psjobs.cfp-psc.gc.ca/psrs-srfp/applicant/page1800?poster=2445986&toggleLanguage=en",
    )
  })

  test("decodes accented French text", () => {
    expect(cards[1].title).toBe("Conseillère en ressources humaines")
    expect(cards[1].company).toBe("Santé Canada")
    expect(cards[1].location).toBe("Montréal Island (Québec)")
  })

  test("a row with no salary reports null rather than omitting the key", () => {
    expect(cards[1].salary).toBeNull()
    expect(cards[1].languageRequirement).toBe("French essential")
  })

  test("a malformed row does not break the rest of the page", () => {
    const withJunk = LISTING_FIXTURE + `<li class="searchResult"><div>no link here</div>`
    expect(parseJobCards(withJunk, "en")).toHaveLength(2)
  })

  test("reads the open-postings count and page count", () => {
    expect(parseResultCount(LISTING_FIXTURE)).toBe(395)
    expect(parsePageCount(LISTING_FIXTURE)).toBe(20)
  })
})

describe("session stubs", () => {
  test("detects the session-expired page", () => {
    expect(isLostConnection("<html><h2>Connexion interrompue</h2><p>Lost Connection</p></html>")).toBe(true)
  })

  test("a long real page is not mistaken for the stub", () => {
    expect(isLostConnection("Lost Connection" + "x".repeat(7000))).toBe(false)
  })
})

describe("externally hosted postings", () => {
  const EXTERNAL_FIXTURE = `
    <main><h1>You will leave the GC Jobs Web site</h1>
    <p>The job opportunity you have selected requires the Public Service Commission (PSC) to transfer you...</p>
    <a href="https://workforcenow.adp.com/mascsr/default/mdf/recruitment/recruitment.html?cid=abc&amp;jobId=547630">Business Applications Analyst</a>
    </main>`

  test("recognises the interstitial", () => {
    expect(isExternalPosting(EXTERNAL_FIXTURE)).toBe(true)
    expect(isExternalPosting("<h1>Some real poster</h1>")).toBe(false)
  })

  test("extracts the outbound link and decodes its query string", () => {
    const { title, externalUrl } = parseExternalPosting(EXTERNAL_FIXTURE, "2447138", "en")
    expect(title).toBe("Business Applications Analyst")
    expect(externalUrl).toContain("workforcenow.adp.com")
    expect(externalUrl).toContain("cid=abc&jobId=547630")
  })

  test("parseJobDetail flags it instead of returning an empty poster", () => {
    const job = parseJobDetail(EXTERNAL_FIXTURE, "2447138", "en")
    expect(job.hostedExternally).toBe(true)
    expect(job.externalUrl).toContain("workforcenow.adp.com")
    expect(job.description).toContain("hiring organization's own site")
  })
})

describe("client-side filtering", () => {
  const job: JobCard = {
    id: "1",
    title: "Senior Policy Analyst",
    company: "Statistics Canada",
    location: "Montréal Island (Québec)",
    date: null,
    url: "",
    closingDate: null,
    salary: null,
    languageRequirement: "Bilingual - imperative",
  }

  test("folds accents so unaccented input still matches", () => {
    expect(fold("Montréal")).toBe("montreal")
    expect(matchesFilters(job, { location: "Montreal" })).toBe(true)
  })

  test("is case-insensitive", () => {
    expect(matchesFilters(job, { query: "POLICY" })).toBe(true)
  })

  test("requires every query term to appear in the title", () => {
    expect(matchesFilters(job, { query: "policy analyst" })).toBe(true)
    expect(matchesFilters(job, { query: "policy engineer" })).toBe(false)
  })

  test("filters by organization and language requirement", () => {
    expect(matchesFilters(job, { org: "statistics" })).toBe(true)
    expect(matchesFilters(job, { org: "Parks Canada" })).toBe(false)
    expect(matchesFilters(job, { languageRequirement: "bilingual" })).toBe(true)
    expect(matchesFilters(job, { languageRequirement: "English essential" })).toBe(false)
  })

  test("combines filters with AND", () => {
    expect(matchesFilters(job, { query: "analyst", org: "statistics" })).toBe(true)
    expect(matchesFilters(job, { query: "analyst", org: "parks" })).toBe(false)
  })

  test("no filters matches everything", () => {
    expect(matchesFilters(job, {})).toBe(true)
  })
})

describe("input normalisation", () => {
  test("accepts bare ids and poster URLs", () => {
    expect(normalizePosterId("2445986")).toBe("2445986")
    expect(
      normalizePosterId(
        "https://emploisfp-psjobs.cfp-psc.gc.ca/psrs-srfp/applicant/page1800?poster=2445986&toggleLanguage=en",
      ),
    ).toBe("2445986")
  })

  test("rejects unparseable input", () => {
    expect(normalizePosterId("no-digits-here")).toBeNull()
  })
})
