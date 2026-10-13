# GC Jobs (PSRS) — endpoint reference

Recorded so the session sequence and parsers can be repaired when the site changes.
Verified against the live site in August 2026.

## Host and paths

```
https://emploisfp-psjobs.cfp-psc.gc.ca/psrs-srfp/applicant
  page2440   public job search (listing)
  page1800   single job poster
```

There is **no robots.txt** (404). The CLI paces itself at 1 request/second anyway.

Language is selected with `toggleLanguage=en|fr` on the same paths — there is no
separate French host.

## The session dance (this is the whole trick)

GC Jobs is a stateful server-rendered Java application. Fetching the search page and
reading its HTML gets you a shell containing *"The page is being updated. Please
wait... JavaScript must be enabled"*. The listing arrives from a second request.

A cold session needs **three GETs, in order**, sharing a `JSESSIONID` cookie:

```
1. GET page2440?fromMenu=true&toggleLanguage=en
     → sets the JSESSIONID cookie (Path=/psrs-srfp; HttpOnly)

2. GET page2440?fromMenu=true&toggleLanguage=en&ajaxSetInternalAccess=1
     → primes server-side state; the site's setInternalAccess() does this

3. GET page2440?fromMenu=true&toggleLanguage=en&isSecondPartOfPage=1&isInitialNetworkCheck=1
     → returns the rendered listing fragment (page 1)
```

Skip any step and the server returns a ~2.3 KB bilingual stub headed
**"Connexion interrompue / Lost Connection"**. `isLostConnection()` detects it.

### Headers that matter

The results request must look like the browser's XHR. With a plain `Accept: text/html`
and no fetch-metadata headers the app serves the Lost Connection stub even on a valid
session. The CLI sends:

```
Accept: */*
Sec-Fetch-Dest: empty
Sec-Fetch-Mode: cors
Sec-Fetch-Site: same-origin
Referer: <the page2440 entry URL>
```

### Session id: cookie, not path

The HTML rewrites internal links with `;jsessionid=...` path segments. Do **not** copy
those into requests — supplying a path session id that disagrees with the cookie
invalidates the session. Use the cookie alone.

## Pagination

```
GET page2440?requestedPage={n}&fromPage=1&tab=1&log=false&isSecondPartOfPage=1
```

20 postings per page; `requestedPage` also accepts `next` and `last`. Consecutive pages
return disjoint sets. The live index shifts during a sweep, so the same posting can
appear twice across pages — the CLI deduplicates on id.

Totals:
- open postings: `Jobs open to the public (395)` in the selected results tab
- page count: the `... 20 of 20 [Next / Last]` pager

## Criteria search — does not work over HTTP

The refine-search form is `GET page2440` with these fields:

```
tab=1  title=  locationsFilter=  variousLocation=  international=
graduateProgram=  studentProgram=  nonProgram=  last24=  departments=
officialLanguage=  jobSalaryRange=  referenceNumber=
selectionProcessNumber=  search=Search+jobs
```

Submitting them in a replayed session returns `302` and then `500` on the follow-up
results request, in every combination tried (with and without redirect following, with
and without the priming call, with full browser headers). The server evidently ties
criteria to navigation state this CLI cannot reproduce.

**Therefore the CLI does not use criteria search.** It sweeps the full public listing
(~400 postings, 20 pages) and filters client-side. This is documented here so a future
maintainer does not "fix" the CLI by wiring the form fields back up.

## Listing row structure

```html
<li class="searchResult">
  <div><strong>
    <a href="/psrs-srfp/applicant/page1800?poster=2445986">TITLE</a>
  </strong></div>
  <div class="tableTable"><div class="tableRow">
    <div class="tableCell">
      Closing date: 2026-08-02 <br /> ORGANIZATION <br /> LOCATION
    </div>
    <div class="tableCell">
      LANGUAGE REQUIREMENT <br /> $SALARY RANGE
    </div>
  </div></div>
```

Both cells are `<br>`-separated free text with no per-field class names, so the parser
splits on `<br>` and assigns by position (left cell) and by whether the line contains
`$` (right cell). Salary is frequently absent; language requirement is not.

## Poster page

```
GET page1800?poster={id}&toggleLanguage=en
```

Requires a primed session — without one it `302`s into the login flow.

Fields are label-anchored free text rather than markup-tagged:
`Reference number`, `Selection process number`, `Location`, `Salary`, `Level`,
`Closing date:`, `Who can apply`, then `About the position` and the body.

Two parsing traps:

- **The title appears twice** — once as the page `<title>`, once as the `<h1>` — with the
  skip-links and site menu in between. The hiring organization is the line directly
  *above* `Closing date:`, not the line after the first title occurrence.
- **`Language requirements (essential for the job)` appears twice** — once in the page's
  own "On this page" table of contents and once as the real heading. Anchoring on the
  heading picks the TOC entry. The values are a closed set, so the parser matches those
  literals instead. Same for `About the position`: the parser takes the *last* occurrence
  to skip the TOC.

## Externally hosted postings

Some departments advertise on their own systems. GC Jobs then serves an interstitial
headed **"You will leave the GC Jobs Web site"** containing a single outbound link in
`<main>`, whose anchor text is the job title.

`detail` returns these with `hostedExternally: true` and `externalUrl` set, rather than
an empty poster. This is a normal posting type, not an error — roughly a third of the
Ottawa listings sampled during reconnaissance were external.
