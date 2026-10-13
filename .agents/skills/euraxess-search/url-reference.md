# EURAXESS Jobs URL Reference

Public, unauthenticated endpoints on `https://euraxess.ec.europa.eu` (European
Commission; Drupal 10 + ECL design system behind CloudFront). English content.
Maintainer cheat-sheet — when the portal changes its markup, update the anchors
here and in `cli/src/helpers.ts`.

> ⚠️ **robots.txt verdict (verified 2026-10-13):** `Allow: /jobs` covers the bare
> listing pages, but `Disallow: /*?` disallows **every parameterized URL** — the
> facet search below included — and `Disallow: /jobs/*` disallows the detail
> pages. This skill exists only because the user explicitly accepted a
> personal-use, low-volume tradeoff. Also disallowed and **never requested**:
> `/api/*`, `/rest/*`, `/*?_format=json`, `/user/*`, `/my/*`, `*/ajax/*`.

## Search (what the CLI uses)

```
GET https://euraxess.ec.europa.eu/jobs/search?f[0]=keywords:<urlencoded query>&page=<n>
```

Wire format: `?f%5B0%5D=keywords%3APhD%20candidate&page=1` (brackets and colon
percent-encoded; either encoded or literal form is accepted).

Params:

| Param | Meaning | Example |
|-------|---------|---------|
| `f[0]=keywords:` | Free-text query facet | `f[0]=keywords:postdoctoral researcher` |
| `page` | Pagination, 1-indexed, 10 cards/page | `page=2` |
| `f[0]=job_research_field:<ID>` | Research-field facet (not implemented) | `job_research_field:164` = Engineering |
| `f[0]=job_country:<CODE>` | Country facet (not implemented) | `job_country:NL` |
| `sort[name]=created\|field_job_application_deadline_z` + `sort[direction]=ASC\|DESC` | UI sort params — **ignored for anonymous GETs in live probes (2026-10-13)**; default order (newest first) is always returned | — |

Response: full HTML page with 10 `<article class="ecl-content-item">` cards
(live probe: `keywords:PhD candidate` → 200, 10 cards, pager showing 662 pages)
plus a `<nav class="ecl-pagination">` footer whose last-page link
(`?page=<last>`) is the only available total-size signal (≈ last × 10).

## Card anchors (verified against live HTML, 2026-10-13)

```html
<article class="ecl-content-item">
 <ul class="ecl-content-block__primary-meta-container">
   <li><a href="/partnering/organisations/profile/tu-delft">TU Delft</a></li>  <!-- organisation -->
   <li>Posted on: 13 October 2026</li>                                        <!-- date, verbatim -->
 </ul>
 <h3 class="ecl-content-block__title"><a href="/jobs/472465" ...><span>Title</span></a></h3>
 <div class="ecl-content-block__description"><p>snippet...</p></div>
 <ul class="ecl-content-block__secondary-meta-container">
   <div class="id-Department ...">…</div>
   <div class="id-Work-Locations ...">
     <div class="ecl-text-standard ...">Number of offers: 1, Netherlands, TU Delft, 2628 CN, Delft, Stevinweg 1</div>
   </div>
   <div class="id-Research-Field ...">…facet links…</div>
   <div class="id-Application-Deadline ...">
     <div class="ecl-text-standard ..."><time datetime="2026-11-01T23:59:59+00:00">01 Nov 2026 - 23:59 (Europe/Amsterdam)</time></div>
   </div>
 </ul>
</article>
```

- **id + url:** `h3.ecl-content-block__title a` → `href="/jobs/{numeric_id}"`
- **title:** that anchor's inner `<span>` text
- **organisation:** first `<li>` of `ecl-content-block__primary-meta-container`
- **posted date:** the meta `<li>` "Posted on: {D Month YYYY}" (kept verbatim)
- **location:** `#id-Work-Locations` block's sibling `.ecl-text-standard` text
- **deadline:** `#id-Application-Deadline time[datetime]` ISO attribute (some
  cards have no deadline block at all → null)
- **snippet:** `ecl-content-block__description` text
- Cards split cleanly on `<article`; job data also exists inside a trailing
  `<script>` JSON blob — do **not** parse that, parse the articles only.

## Detail

```
GET https://euraxess.ec.europa.eu/jobs/{id}
```

**Known degradation:** for non-browser clients EURAXESS either 307-redirects
this URL to `/jobs/search` (CloudFront) or serves a stub page (header card +
breadcrumb JSON-LD only, no job content). Live probe 2026-10-13: the honest
`euraxess-cli/1.0` UA **did** receive full detail pages for the tested IDs, so
availability is intermittent rather than absolute — the CLI parses full pages
when served and exits `DETAIL_BLOCKED` otherwise (body lacks
`id="job-information"` / `id="offer-description"` markup). The JSON-LD on the
page is a `BreadcrumbList`, **not** a `JobPosting` — parse the markup, not
JSON-LD.

Detail markup (when served):

| Field | Anchor |
|-------|--------|
| Title | header card `<h1 class="ecl-content-block__title">` |
| Posted date | `.ecl-content-item__meta` → `.ecl-u-mt-xs` text (`13 Oct 2026`) |
| Job Information | `<h2 id="job-information">` + `<dl class="ecl-description-list">` dt/dd rows: Organisation/Company, Department, Research Field, Researcher Profile, Positions, Application Deadline (with `<time datetime>`), Country, Type of Contract, Job Status |
| Offer Description | `<h2 id="offer-description">` section, free HTML (`<p>`, `<br>`) |
| Where to apply | `<h2 id="where-to-apply">` (email; the CTA `<a ... class="job-apply-button" href="mailto:...">` carries it too) |
| Requirements | `<h2 id="requirements">` (education level, languages) |
| Work Location(s) | `<h2 id="work-locations">` (offers count, institute, country, postal code, street) |
| Contact | `<h2 id="contact">` |

## POST form search (alternative, not used)

The search UI also submits a POST form to `/jobs/search` with form-encoded
filter fields. The GET facet URL above is what the portal's own filter links
emit and is what the CLI uses; the POST path is undocumented, untested, and
left alone.

## Quirks

- Honest UA `Mozilla/5.0 (compatible; euraxess-cli/1.0)` gets 200s on search —
  no bot wall, no credentials, no cookies needed.
- Sort params accepted syntactically but ignored for anonymous GETs (verified
  twice live); don't rely on them.
- CloudFront caches search pages; identical queries can serve stale cards for
  some minutes.
- `?_format=json` REST views exist but are robots-disallowed — never requested.
