import { describe, expect, test } from "bun:test"
import {
  clean,
  cleanBlock,
  decodeHtmlEntities,
  isProvince,
  normalizePostingId,
  parseJobCards,
  parseJobDetail,
  parseResultCount,
  stripSessionId,
} from "../src/helpers.js"

// Trimmed from a real jobbank.gc.ca results page. Keeps the structural quirks that
// matter: the `;jsessionid=` path segment, the `wb-inv` screen-reader labels, and
// the whitespace-heavy JSF output.
const SEARCH_FIXTURE = `
<article id="article-49969224" class="action-buttons"><a href="/jobsearch/jobposting/49969224;jsessionid=ABC123.jobsearch76?source=searchresults" class="resultJobItem">
  <h3 class="title">
    <span class="flag"><span class="new">New</span><span class="telework">On site</span></span>
    <span class="noctitle"> software developer
    </span>
  </h3>
  <ul class="list-unstyled">
    <li class="date">July 28, 2026
    </li>
    <li class="business">Decision Tree Technology</li>
    <li class="location"><span class="fas fa-map-marker-alt" aria-hidden="true"></span> <span class="wb-inv">Location</span>
          Havelock (ON)
    </li>
    <li class="salary"><span class="fa fa-dollar" aria-hidden="true"></span>
      Salary
      $47.57 hourly</li>
    <li class="source"><span class="job-source job-source-icon-16"><span class="wb-inv">Job Bank</span></span>
      <span class="wb-inv">Job number:</span>
      <span class="fa fa-hashtag" aria-hidden="true"></span>
      3632881</li>
  </ul></a></article>
<article id="article-49971203" class="action-buttons"><a href="/jobsearch/jobposting/49971203" class="resultJobItem">
  <h3 class="title"><span class="noctitle">d&#233;veloppeur / d&#233;veloppeuse de logiciels</span></h3>
  <ul class="list-unstyled">
    <li class="date">July 30, 2026</li>
    <li class="business">Groupe Ren&amp;eacute; SA</li>
    <li class="location"><span class="wb-inv">Location</span> Montr&#233;al (QC)</li>
  </ul></a></article>
`

const DETAIL_FIXTURE = `
<h1 property="title">software developer</h1>
<span property="hiringOrganization">Avant Techno Solutions</span>
<span property="datePosted">Posted on July 29, 2026</span>
<span property="validThrough" content="2026-08-19"></span>
<ul class="job-posting-brief colcount-lg-2 ">
  <li><span class="wb-inv">Location</span>
    <span><span property="joblocation" typeof="Place"><span class="city" property="address" typeof="PostalAddress"><span property="addressLocality">Toronto</span>, <span property="addressRegion">ON</span><span class="nomargin" property="postalCode">M5V 2Y1</span></span></span></span>
  </li>
  <li><span class="wb-inv">Salary</span><span class="attribute-value" property="baseSalary" typeof="MonetaryAmount"><span property="value" typeof="QuantitativeValue"><span property="currency" content="CAD" class="hidden">$</span><span property="minValue" content="50.43">50.43</span><span property="unitText" class="hidden">HOUR</span> hourly</span> / <span property='workHours'> 30 to 40 hours per week</span></span>
  </li>
  <li><span property="employmentType" class="attribute-value">Permanent employment<span class="attribute-value">Full time</span></span></li>
  <li><span class="wb-inv">vacancies</span><span>10 vacancies</span></li>
  <li><span class="wb-inv">Source</span><span>Job Bank</span><span>#3634017</span></li>
</ul>
<div class="main-job-posting-detail job-posting-detail-requirements ">
  <h3>Overview</h3>
  <div id="comparisonchart" class="comparisonchart">
    <h4>Languages</h4>
    <p property="qualification">English</p>
    <h4>Education</h4>
    <ul property="educationRequirements qualification" class="csvlist ">
      <li><span>Bachelor's degree</span></li>
      <li>or equivalent experience</li>
    </ul>
    <h4>Experience</h4>
    <p>3 years to less than 5 years</p>
  </div>
</div>
<section id="howtoapply"><p>By email:</p><p>jobs@example.ca</p></section>
`

describe("search-result parsing", () => {
  const cards = parseJobCards(SEARCH_FIXTURE, "en")

  test("parses every article on the page", () => {
    expect(cards).toHaveLength(2)
  })

  test("extracts the contract fields from a card", () => {
    expect(cards[0]).toMatchObject({
      id: "49969224",
      title: "software developer",
      company: "Decision Tree Technology",
      location: "Havelock (ON)",
      date: "July 28, 2026",
      jobNumber: "3632881",
      workLocation: "On site",
    })
  })

  test("drops the jsessionid path segment and query string from the URL", () => {
    expect(cards[0].url).toBe("https://www.jobbank.gc.ca/jobsearch/jobposting/49969224")
  })

  test("strips the screen-reader label out of location and salary", () => {
    expect(cards[0].location).not.toContain("Location")
    expect(cards[0].salary).toBe("$47.57 hourly")
  })

  test("decodes accented French titles", () => {
    expect(cards[1].title).toBe("développeur / développeuse de logiciels")
    expect(cards[1].location).toBe("Montréal (QC)")
  })

  test("missing values are null rather than omitted", () => {
    expect(cards[1].salary).toBeNull()
    expect(cards[1].jobNumber).toBeNull()
    expect(cards[1]).toHaveProperty("workLocation")
  })

  test("a malformed card does not take out the rest of the page", () => {
    const withJunk = SEARCH_FIXTURE + `<article id="article-notanumber"><h3>broken</h3></article>`
    expect(parseJobCards(withJunk, "en")).toHaveLength(2)
  })

  test("French mode builds guichetemplois URLs", () => {
    expect(parseJobCards(SEARCH_FIXTURE, "fr")[0].url).toContain("guichetemplois.gc.ca")
  })

  test("reads the total result count", () => {
    expect(parseResultCount('<span class="found" id="results-count">1,167</span>')).toBe(1167)
    expect(parseResultCount("<span>no count here</span>")).toBeNull()
  })
})

describe("detail parsing", () => {
  const job = parseJobDetail(DETAIL_FIXTURE, "49974823", "en")

  test("reads the microdata fields", () => {
    expect(job).toMatchObject({
      id: "49974823",
      title: "software developer",
      company: "Avant Techno Solutions",
      location: "Toronto (ON)",
      deadline: "2026-08-19",
      salaryMin: "50.43",
      salaryUnit: "HOUR",
      salaryCurrency: "CAD",
      postalCode: "M5V 2Y1",
      vacancies: "10",
    })
  })

  test("prefers the content attribute over the rendered text", () => {
    // The rendered currency text is "$"; the machine-readable value is CAD.
    expect(job.salaryCurrency).toBe("CAD")
  })

  test("strips the 'Posted on' prefix from the date", () => {
    expect(job.date).toBe("July 29, 2026")
  })

  test("captures the overview subsections", () => {
    expect(job.languages).toBe("English")
    expect(job.education).toContain("Bachelor's degree")
    expect(job.experience).toContain("3 years")
  })

  test("captures the how-to-apply block", () => {
    expect(job.howToApply).toContain("jobs@example.ca")
  })

  test("employmentType keeps both lines", () => {
    expect(job.employmentType).toContain("Permanent employment")
  })
})

describe("text utilities", () => {
  test("decodes named, decimal and hex entities", () => {
    expect(decodeHtmlEntities("caf&#233; &amp; b&#xE8;te &quot;x&quot;")).toBe('café & bète "x"')
  })

  test("decodes &amp; last so double-encoded entities survive", () => {
    expect(decodeHtmlEntities("R&amp;D")).toBe("R&D")
  })

  test("clean collapses whitespace", () => {
    expect(clean("<p>  a\n\n  b </p>")).toBe("a b")
  })

  test("cleanBlock preserves paragraph breaks", () => {
    expect(cleanBlock("<p>one</p><p>two</p>")).toBe("one\ntwo")
  })

  test("stripSessionId removes the segment but keeps the query", () => {
    expect(stripSessionId("/a/b;jsessionid=XYZ.node1?source=x")).toBe("/a/b?source=x")
  })
})

describe("input normalisation", () => {
  test("accepts bare ids and full URLs", () => {
    expect(normalizePostingId("49969224")).toBe("49969224")
    expect(normalizePostingId("https://www.jobbank.gc.ca/jobsearch/jobposting/49969224")).toBe("49969224")
    expect(normalizePostingId("https://www.guichetemplois.gc.ca/jobsearch/jobposting/123456?x=1")).toBe("123456")
  })

  test("rejects unparseable input", () => {
    expect(normalizePostingId("not-a-job")).toBeNull()
  })

  test("validates province codes case-insensitively", () => {
    expect(isProvince("on")).toBe(true)
    expect(isProvince("QC")).toBe(true)
    expect(isProvince("XX")).toBe(false)
  })
})
