# EuroScienceJobs URL Reference

Public, unauthenticated endpoints used by this skill. English-language European
science/postdoc board. No authentication; login exists only for saved jobs.

Robots (`/robots.txt`, verified 2026-10-13): `User-agent: *` has an empty
Disallow (open). ClaudeBot, GPTBot, Bytespider and meta-externalagent are
explicitly disallowed — the CLI's honest `eurosciencejobs-cli/1.0` UA never
uses those product names.

## Search

```
GET https://www.eurosciencejobs.com/job_search/keyword/<term>/keyword_location/<term>
```

- Term encoding follows the site's own `job_search` JS: lowercase, spaces →
  `_`, slashes → `___` (e.g. `PhD candidate` → `phd_candidate`).
- `keyword_location` segment is optional; when present the results are
  location-filtered (verified: `postdoc` + `Berlin` returned a single
  Berlin posting).
- Do NOT use the query-string form (`?keyword=...`) — it returns an
  unfiltered page. Do NOT use `/search?keywords=` (404). Stay on the `www`
  host (`www2` returns 403 for search).
- No server-side pagination or age parameters; the CLI slices `--page` (20
  per page) and filters `--jobage` client-side on the relative "Posted N
  days ago" label.
- Filters (category, job_type, workplace, location checkboxes) are
  path-segment POST-style facets, not documented here — the CLI does not map
  them.

Returns a server-rendered HTML list. Two card shapes (both anchored by
`<h3><a href="/job_display/<id>/<Title_Slug>">`):

| Shape | Container | Fields |
|-------|-----------|--------|
| Featured | `<li class="standardJobContainer">` | `companyName`, `location`, `salary`, `postedDate` ("Posted N days ago" + "Deadline …") divs, tag badges |
| Plain | bare `<li>` | heading only — company/location/date are `null` |

Search-result headings give `id`, `title`, `url`; featured cards add
`company`, `location`, `date`. The numeric `data-job-id` on the save-job
anchor matches the URL id.

## Detail

```
GET https://www.eurosciencejobs.com/job_display/<numericId>/<Title_Slug>
```

- The slug is decorative; requesting `/job_display/<id>/` returns the
  posting (verified live).
- Anchors: `<title>` ("Title - Company, City"), `<h1>` title, centered
  `<h2>` triple (title repeat, company, location), description in
  `<div class="jobDisplay">…<!-- Job Description end -->`, deadline in the
  `Deadline <date>` label next to the Apply button, apply action in
  `<button class='btn callToAction' …>Apply Now</button>` with
  `data-job-url=/job/track_click?job_id=<id>`.

## Notes

- GET search avoids the CSRF tokens present on POST forms entirely.
- Closed postings lose the Apply button; `isActive` reflects its presence.
