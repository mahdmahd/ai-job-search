# Inside Higher Ed Careers URL Reference

Maintainer's cheat-sheet for careers.insidehighered.com (Madgex platform).
Update this file when the board's markup changes.

- **Portal**: https://careers.insidehighered.com/ — US higher-education jobs,
  English. Madgex job-board software (same stack as jobs.chronicle.com and
  nature.com/naturecareers).
- **Dead host**: `jobs.insidehighered.com` returns HTTP 522 — never use it;
  all URLs live under `careers.`.
- **Auth**: none required. Honest UA `Mozilla/5.0 (compatible;
  insidehighered-cli/1.0)` gets HTTP 200s; no bot wall.
- **robots.txt**: ALLOWED for search and jobs. Disallows only
  `/invalid-request/`, `/analytics/`, `*/emailjob/*`, `*/previewjob/*`, plus
  the sitemap. Low volume still applies (personal use).

## Search

```
GET https://careers.insidehighered.com/searchjobs/?Keywords=<urlencoded>&Page=<n>
```

| Param | Meaning | Example |
|-------|---------|---------|
| `Keywords` | Free-text query (title + content match) | `PhD candidate` |
| `Page` | **1-based** page number (20 results/page) | `1`, `2`, … |
| `LocationId` | Site-internal location id (not implemented) | `1234` |
| `RadialLocation` | Radius in miles/km around `LocationId` (not implemented) | `25` |

`LocationId`/`RadialLocation` exist in the site's own UI but need an internal
location-id lookup; the CLI documents them and passes keywords only.

Verified live 2026-10-13: `Keywords=postdoc&Page=1` → HTTP 200,
"614 jobs" (meta description), 31 pages → **20 results per page**.

Response is an HTML list, one `<li>` per posting. Anchors per card:

| Field | Anchor | Notes |
|-------|--------|-------|
| id | `li.lister__item[id^=item-]` → `id="item-{numericId}"` | split chunks on `id="item-` |
| title | `.lister__header a` → inner `<span>` | — |
| url | `.lister__header a[href]` | **href contains newline/whitespace — TRIM before use**; relative → prefix host |
| company | `.lister__meta-item--recruiter` | institution name |
| location | `.lister__meta-item--location` | often the department/location line |
| salary | `.lister__meta-item--salary` | frequently absent → `null` |
| snippet | `.lister__description` | clamped one-liner |
| date | *(none)* | no visible date element on cards → `null` on search |

Noise: ad cards (`li.lister__item--ads`, GPT ad markup) and logo-variant /
mini-lister cards are interspersed. Ad cards carry **no** `id="item-..."`, so
splitting on that anchor skips them; every emitted chunk must still yield an
id and a title or it is skipped (chunk-safe).

## Detail

```
GET https://careers.insidehighered.com/job/<numericId>/          ← slug optional, 200
GET https://careers.insidehighered.com/job/<numericId>/<slug>/    ← canonical, 200
```

An unknown id → HTTP 404 (CLI returns `""` → `NOT_FOUND`).

Primary source: `script[type="application/ld+json"]` containing
`"@type": "JobPosting"`:

| Field | JSON-LD path | Notes |
|-------|--------------|-------|
| title | `.title` | fallback: page `<h1>` |
| description | `.description` | HTML (`<br/>`, `<p>`, `<strong>`) → strip tags, keep breaks |
| date (posted) | `.datePosted` | e.g. `2026-05-29T04:00:00.000Z` |
| close date | `.validThrough` | e.g. `2026-11-11T05:00:00.000Z` |
| company | `.hiringOrganization.name` | — |
| location | `.jobLocation[]` → `address.addressLocality/Region/Country` | array of `Place`; join with `, ` |
| employment type | `.employmentType` | **quirk: arrives as a stringified JSON array** — `"[\"FULL_TIME\"]"` → JSON.parse → join |

Apply links live in the page body, not the JSON-LD:

| What | Pattern |
|------|---------|
| Internal apply | `href="/apply/{id}/{slug}?LinkSource=JobDetails"` |
| External apply | anchor with text **"Apply on website"** → `/external-redirect-registration?JobId=...&LinkSource=JobDetails` (site-relative) |

## Quirks worth remembering

1. **Href whitespace**: Madgex writes list hrefs across several lines
   (`href=" \n\t/job/3509752/slug/\n\n"`). Strip all whitespace before
   building a URL.
2. **1-based `Page`**, unlike offset-style boards (`start=`/`page=`0).
3. **No date on cards** — only JSON-LD on the detail page.
4. `keywords` also appears lowercase (`~searchjobs/?keywords=...`) inside
   embedded `ReturnUrl` values; the endpoint accepts `Keywords`.
5. Query params are classic-ASP style — case-insensitive in practice, but the
   CLI always sends `Keywords`/`Page` as the site itself does.
