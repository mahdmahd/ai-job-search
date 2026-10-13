# Chronicle of Higher Education Jobs URL Reference

Public, unauthenticated endpoints used by this skill. The board runs on
**Madgex** (same platform as nature.com/naturecareers and
careers.insidehighered.com). All content lives on the `jobs.chronicle.com`
subdomain, which is free to read — the Chronicle news paywall does not apply.

`robots.txt` (verified 2026-10-13) disallows only `/invalid-request/`,
`/analytics/`, `*/emailjob/*`, `*/previewjob/*`; the search and job paths used
here are allowed. Sitemap: `https://jobs.chronicle.com/sitemapindex.xml`.

## Search

```
GET https://jobs.chronicle.com/searchjobs/?Keywords=<urlencoded>&Page=<n>
```

Query params:

| Param | Meaning | Example |
|-------|---------|---------|
| `Keywords` | Free-text query | `PhD%20candidate` (paginator emits lowercase `keywords`; both work) |
| `Page` | **1-indexed** page | `1`, `2`, … — 20 results per page |

Not implemented by the CLI but available on the site's search form (documented
for future maintainers):

| Param | Meaning |
|-------|---------|
| `radialtown` / `LocationId` / `RadialLocation` | Radial location search (LocationId comes from the site's own lookup) |
| `CountryCode` | ISO country filter (the paginator auto-appends `countrycode=US` for US visitors) |
| `PositionType` | Repeated checkbox values (numeric IDs for Faculty/Staff/Exec positions) |
| `EmploymentType`, `EmploymentLevel`, `InstitutionType`, `SalaryBand` | Facet filters |

**No posting-age parameter exists** — hence no `--jobage` flag, and search
cards carry no date.

### Search result anchors (Madgex lister markup)

Each result is `<li class="lister__item cf ..." id="item-{id}">`:

| Field | Anchor |
|-------|--------|
| id | the `id="item-{id}"` anchor itself |
| title | `.lister__header a` inner text (may be wrapped in a `<span>`) |
| url | same anchor's `href` → `/job/{id}/{slug}/` — **href contains stray whitespace/newlines inside the quotes and a tracking query (`?LinkSource=PromotedJob`); trim and strip the query** |
| company | `.lister__meta-item--recruiter` |
| location | `.lister__meta-item--location` |
| salary | `.lister__meta-item--salary` (often empty → null) |
| snippet | `.lister__description` div |
| date | **no anchor exists** — `date` is always null on search cards |

The paginator is `.paginator__item` (`?...&Page=n` links). Noise to skip:
promoted/sponsored cards (class variants, same markup), empty ad slots
(`lister__item--ads`), and — on detail pages — similar-jobs mini-listers
(`mini-lister*`). Parse each `id="item-"` chunk independently; bound each
chunk at its own `lister__footer` so trailing page noise (which rides along in
the last chunk) can't leak into missing fields.

## Detail

```
GET https://jobs.chronicle.com/job/{id}/{slug}/     (canonical)
GET https://jobs.chronicle.com/job/{id}/            (also serves 200 — the CLI fetches this slug-free form)
```

Primary source: the JSON-LD block `<script type="application/ld+json">` with
`@type: JobPosting`:

| JSON-LD field | Maps to | Notes |
|---------------|---------|-------|
| `title` | `title` | |
| `description` | `description` | HTML string; tags stripped, paragraph/`<br>` breaks kept as newlines, entities decoded |
| `datePosted` | `date` | ISO 8601 |
| `validThrough` | `validThrough` | Closing date, ISO 8601 |
| `employmentType` | `employmentType` | String, array, or JSON-encoded array string (`"[\"FULL_TIME\"]"`) — all normalized |
| `hiringOrganization.name` | `company` | |
| `jobLocation[].address` | `location` | Built as `Locality, Region, Country`; fallback to the tracking blob's `"LocationDescription"` |

Fallback fields from the page's tracking blob (only used when JSON-LD lacks
them): `"SalaryDescription"` → `salary`, `"LocationDescription"` → `location`.

Other page-level anchors:

| Field | Anchor |
|-------|--------|
| `url` | `<link rel="canonical">` (JSON-LD has no `url`) |
| apply | `href` matching `/apply/{id}/{slug}?LinkSource=JobDetails` (may carry stray whitespace) → external ATS; exposed as `applyUrl` |

Application itself happens on an external ATS (Interfolio, Workday, …) —
there is no on-site apply form to automate.

## Notes

- No authentication required; honest UA `Mozilla/5.0 (compatible; chroniclejobs-cli/1.0)`.
- The CLI backs off with jitter on 429/5xx (up to 6 retries); 404 → "Job not found".
- Keep volume low — a handful of requests per session, not a crawl.
- If the portal's markup changes, start here: verify the `id="item-"` anchor,
  the lister meta classes, and the JSON-LD block, then update the parsers in
  `cli/src/helpers.ts`.
