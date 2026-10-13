# Job Bank Canada — endpoint reference

Everything the CLI depends on, recorded so the parsers can be repaired when Job Bank
changes its markup. Verified against the live site in August 2026.

## Hosts

| Language | Host |
|----------|------|
| English  | `https://www.jobbank.gc.ca` |
| French   | `https://www.guichetemplois.gc.ca` |

Both hosts serve the same application with identical paths and parameters. The language
also selects the city-index Solr core (`..._en` vs `..._fr`).

## robots.txt

```
User-agent: *
Crawl-delay: 5
```

No `Disallow` rules. The CLI enforces the 5-second delay between requests
(`CRAWL_DELAY_MS` in `helpers.ts`).

---

## 1. Search results (HTML)

```
GET /jobsearch/jobsearch
```

| Parameter | Meaning | Notes |
|-----------|---------|-------|
| `searchstring` | Keyword query | **This is the keyword parameter.** `term` appears in the page's own canonical URL but is ignored as an input. |
| `locationstring` | City display string, `"Toronto, ON"` | Cosmetic on its own — see `locationparam`. |
| `locationparam` | Numeric city id, e.g. `22437` | **Required for city filtering.** Without it the city is silently ignored and results are nationwide. |
| `fprov` | Province/territory code | `AB BC MB NB NL NS NT NU ON PE QC SK YT`. Combines with the city filter. |
| `fage` | Posted within N days | Counts days back from today; `1` = today. |
| `sort` | `M` relevance, `D` date | |
| `page` | 1-indexed page number | Fixed **25 results per page**. |

### Traps found during reconnaissance

- `locationstring` **alone does nothing.** A search for `searchstring=software+developer&locationstring=Toronto,+ON` returns the same 167 nationwide results as no location at all, while the page heading still says Toronto. Only `locationparam` filters.
- `term=` is not an input parameter. The page emits `term=...&fn21=...` in its own `og:url` after translating your `searchstring` into a NOC code, but supplying `term` yourself matches everything (63,000+ results).
- `fn21` is the NOC 2021 occupation code the site inferred (e.g. `21232` = software developer). The CLI does not use it — `searchstring` already covers it and hardcoding NOC codes would rot.

### Result-card structure

Each posting is one `<article id="article-{id}">`. Fields, in the order they appear:

| Field | Anchor |
|-------|--------|
| id | `<article id="article-49969224">` |
| url | `href="/jobsearch/jobposting/{id};jsessionid=...?source=searchresults"` — **strip the `;jsessionid=` segment and the query string** |
| title | `<span class="noctitle">` |
| work location | `<span class="telework">` (`On site` / `Remote` / `Hybrid`) |
| date | `<li class="date">` |
| employer | `<li class="business">` |
| location | `<li class="location">` — contains a `<span class="wb-inv">Location</span>` screen-reader label that must be stripped |
| salary | `<li class="salary">` — same, label `Salary` |
| job number | `<li class="source">` — trailing digits |

Total match count: `<span class="found" id="results-count">167</span>` (may contain thousands separators).

There is a **"Show more results"** button (`id="moreresultbutton"`) rather than numbered pagination in the UI, but the `page=` query parameter works directly and returns disjoint result sets.

---

## 2. Job detail (HTML + schema.org microdata)

```
GET /jobsearch/jobposting/{id}
```

No JSON-LD block. The page is annotated with **microdata `property=` attributes**, which
are more stable than class names:

| Field | Property |
|-------|----------|
| title | `property="title"` |
| employer | `property="hiringOrganization"` |
| city / province / postal code | `property="addressLocality"` / `addressRegion` / `postalCode` |
| posted date | `property="datePosted"` (rendered as `Posted on July 29, 2026`) |
| deadline | `property="validThrough"` with `content="2026-08-19"` |
| salary | `property="minValue"` / `maxValue` with `content=`, `property="unitText"` (`HOUR`, `YEAR`, …), `property="currency"` with `content="CAD"` |
| work hours | `property='workHours'` — **single-quoted in the template**, unlike its neighbours |
| employment terms | `property="employmentType"` |

Quote style is inconsistent across the template, so the microdata reader accepts both
`property="x"` and `property='x'`.

Other blocks:

| Field | Anchor |
|-------|--------|
| full description | `<div class="... job-posting-detail-requirements ...">` |
| languages / education / experience | `<h4>` headings inside `#comparisonchart` |
| how to apply | `id="howtoapply"` |
| vacancies | free text, `N vacancies` |
| job number | free text, `#3634017` |

The `<h4>` headings are language-dependent (`Education` / `Études`, `Experience` /
`Expérience`), so the section matcher uses accent-tolerant patterns.

---

## 3. City index (Solr, JSON)

```
GET /core/ta-cityprovsuggest_{en|fr}/select?q={name}&fq=NOT postalcode_cnt:0&wt=json&rows=25
```

This is the public Solr core behind the site's location typeahead. Response:

```json
{ "response": { "numFound": 1, "docs": [
  { "docid": "C22437", "city_id": "22437", "name": "Toronto",
    "province_cd": "ON", "province_name": "Ontario",
    "latitude": 43.653524, "longitude": -79.383907, "postalcode_cnt": 19854 }
] } }
```

`city_id` (the **numeric** value, not `docid`) is what `locationparam` expects. Passing
`docid` (`C22437`) is accepted by the search page but filters nothing.

The `fq=NOT postalcode_cnt:0` filter drops place names with no postal coverage, matching
what the website's own typeahead does.

---

## 4. RSS feed — evaluated and rejected

```
GET /jobsearch/feed/jobSearchRSSfeed?fage=2&fn21=21232&term=...&sort=D&rows=100
```

Job Bank does expose an Atom feed, linked from every results page. The CLI does **not**
use it:

- it filters by `fn21` (NOC code) only — a plain `term` is ignored and returns unrelated jobs
- it has no location parameter at all; `locationstring` and `locationparam` are both dropped
- entries carry only title, link, job number, location, employer, and salary — less than the HTML card

It is documented here so a future maintainer does not rediscover it and assume it is the
better path. It is not.
