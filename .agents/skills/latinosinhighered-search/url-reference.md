# LatinosinHigherEd URL Reference

Maintainer's cheat-sheet for latinosinhighered.com (JobMount platform,
Madgex-style layout). Update this file when the board's markup changes.

- **Portal**: https://latinosinhighered.com/ — US higher-education jobs for the
  Latino/Hispanic higher-ed community, English.
- **Auth**: none required for read. Honest UA `Mozilla/5.0 (compatible;
  latinosinhighered-cli/1.0)` gets HTTP 200s; no bot wall.
- **robots.txt**: ALLOWED for search and `/career/` detail. Disallows only
  `/admin`, `/imglib_thumbnails`, `/candidate/apply_registration`,
  `/candidate/quick_registration`, `/candidate/registration`,
  `/candidate/job_apply`, `/candidate/job_search/similar`,
  `/candidate/private`, `/employer/registration`, `/employer/private`, and
  `/main`. Low volume still applies (personal use).

## Search

```
GET https://latinosinhighered.com/candidate/search_jobs?keywords=<urlencoded>
```

| Param | Meaning | Example |
|-------|---------|---------|
| `keywords` | Free-text query (title, skill, employer) | `PhD candidate` |
| `page` | **NOT SUPPORTED** — the GET endpoint ignores it and returns the same single page | — |

Verified live 2026-10-13: `keywords=PhD%20candidate` → HTTP 200 (~67KB), 4
`a.job-link` cards; `page=2` returns an identical card set, confirming
single-page behavior. The page's own search form POSTs to
`/candidate/job_search/quick` (AJAX); the CLI uses the clean GET path instead.

Response is HTML with one `<a class="job-link" href="/career/{id}/{slug}">`
per card, followed by:

| Field | Anchor | Notes |
|-------|--------|-------|
| id + url | `a.job-link[href]` | `/career/<numericId>/<slug>`; id = first path segment |
| title | `.featured-jobs-title` | inner span of the anchor |
| company | `.sp_sh_item.sp_sh_employer` | institution name |
| location | `.sp_sh_item.sp_sh_city` + `.sp_sh_item.sp_sh_region` | joined `"City, Region"`; either may be absent → `null` |
| date | *(none)* | no date element on cards → `null` on search |

**Quirk — featured-jobs block.** The cards sit inside a `div.featured-jobs` /
`ul.fjList` module that may render above (or instead of) real keyword hits,
and the GET keyword search rotates the featured set: two different keywords
can return overlapping-but-different card lists. The CLI parses **ALL**
`a.job-link` rows consistently (dedup by id) and treats the list as
indicative; verify with `detail`. If a future revision adds a real results
container, scope parsing to it instead.

## Detail

```
GET https://latinosinhighered.com/career/<id>/<slug>     ← canonical, 200
```

Wrapper `Tpl holder_job_details`. Page `<title>` pattern:
`"{Job} Job in {City}, {Category} Career, {Job Type} Jobs in {Employer}"`.

Primary source: `script[type="application/ld+json"]` (`@type: "JobPosting"`):

| Field | JSON-LD path | Notes |
|-------|--------------|-------|
| title | `.title` | fallback: page `<h1>` |
| description | `.description` | HTML (`<p>`, `<br>`, `<strong>`) → strip tags, keep breaks |
| date (posted) | `.datePosted` | e.g. `2026-10-12T06:52:27` |
| close date | `.validThrough` | e.g. `2027-01-10T06:52:27` |

Secondary sources (page body):

| Field | Anchor | Notes |
|-------|--------|-------|
| employer | label cell `Employer:` in the `vac_item_*` table | fallback: JSON-LD `hiringOrganization.name` |
| location | `City:` / `State:` label cells | joined `"City, Region"` |
| category | `Category:` label cell (`vac_item_industry`) | — |
| job type | `Job Type:` label cell | — |
| salary | `Salary and Benefits:` label cell | often absent → `null` |
| required education / experience | matching label cells | often absent → `null` |
| description fallback | `td.job_desc_td` | used when JSON-LD lacks a description |
| relative post date | `span.post_date` ("13 hours ago") | only used when JSON-LD `datePosted` is missing |
| apply URL | `var rUrl = '<url>'` in inline JS | external ATS link (e.g. Interfolio) |

Label cells are matched by visible text (e.g. `Employer:&nbsp;`) with the
value in the following `<td>` — robust to the platform's varying
`vac_item_*` class names.

## Quirks worth remembering

1. **Single-page search.** No `page`/`start` parameter takes effect on the
   GET endpoint; `--page > 1` is answered client-side with zero results
   without a network request.
2. **Featured-jobs rotation** (see Search quirk above): identical URLs with
   different `keywords` can return different card sets; dedup by id.
3. **No date on cards** — only JSON-LD `datePosted` on the detail page.
4. **POST search exists** (`/candidate/job_search/quick`, form-encoded
   `values[1].value` for keyword) — avoid it; the GET path is equivalent and
   cleaner.
5. Query params are platform-internal — the CLI always sends `keywords` as
   the site's own quick-search form does.
