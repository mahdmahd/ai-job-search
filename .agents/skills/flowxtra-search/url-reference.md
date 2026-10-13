# Flowxtra API Reference

Endpoint documentation for the `flowxtra-search` skill. Everything below was
verified against live responses on 2026-07-26. Base URL:
`https://app.flowxtra.com/api` (override with `FLOWXTRA_API_URL`).

## Search: `GET /central/jobs`

One cross-tenant, Laravel-paginated list covering every company hosted on
Flowxtra, newest-first by `date_share`. Reads are public — no auth, no key.

### Query parameters (all optional; narrowing is server-side)

| Param | Maps from | Behavior |
|-------|-----------|----------|
| `search-key` | `--query` | Job-title LIKE search |
| `location` | `--location` | LIKE over company city, state, and country |
| `workplace` | `--workplace` | Exact match: `On-site`, `Hybrid`, `Remote` (live rows carry On-site/Remote; Hybrid exists in the platform's own filter UI) |
| `company_name` | `--company` | Company-name LIKE search |
| `page` | `--page` | 1-indexed |
| `per_page` | `--limit` | Page size (100 verified working) |

Not offered by the CLI:

- `employment_type` — exists upstream but is a live no-op (the backing JSON
  column stores objects, the filter compares plain strings; every value
  returns zero rows — verified 2026-07-26).
- `status` — the server hardcodes the visibility window (status Live,
  admin-approved, `date_share` within the last 90 days, not expired).
- Posting age — no server parameter; `--jobage` filters client-side on
  `date_share`.

### Response envelope

```json
{
  "success": true,
  "data": {
    "current_page": 1,
    "last_page": 39,
    "per_page": 3,
    "total": 116,
    "next_page_url": "https://app.flowxtra.com/api/central/jobs?page=2",
    "data": [ { ...job... } ]
  },
  "message": "200"
}
```

### Per-job fields consumed

| Field | Notes |
|-------|-------|
| `has_id` | Public hashed id — the `detail` lookup key and the result `id` |
| `title` | |
| `workplace` | `On-site` / `Remote` observed live |
| `currency` | ISO code, e.g. `EUR` |
| `date_share` | Posting date, RFC3339 with fractional seconds; always set on list rows |
| `min_salary` / `max_salary` / `salary` | Numbers or null (nullability verified across all 116 live rows) |
| `rate_salary` | Period: `year`, `monthly`, `month`, `hour` observed |
| `name_company` | |
| `city_company` / `state_company` / `country_company` | May be empty strings; joined into the result `location` |
| `employment_types[].name` | e.g. `Full-time`, `Internship` |
| `urlJobApplay` | (sic — upstream spelling) ready-made apply URL, `https://flowxtra.com/apply/<has_id>` on list rows |

## Detail: `GET /candidate/jobs/{has_id}`

Full posting detail. Public, no auth.

- **200**: `{ "success": true, "data": { ...detail... } }`
- **404** (unknown/deleted id): `{ "success": false, "message": "Central job not found" }`

### Detail fields consumed

| Field | Notes |
|-------|-------|
| `has_id`, `title`, `workplace` | As in the list |
| `seniority` | e.g. `Junior`, `Midlevel`, `Intern`; often null |
| `description` | Full HTML — stripped to prose by the CLI |
| `currency`, `min_salary`, `max_salary`, `salary`, `rate_salary` | As in the list |
| `urlJobApplay` | Here it is the company's **own career-page URL**, e.g. `https://<company>.<career-domain>/job/<slug>/<has_id>` — different host than the list's apply URL, same application |
| `company.name`, `company.website` | Website may be null |
| `job_type_job[].name` | Employment types |
| `company_office` | Nullable; `state.name` + `country.name` make the location |

Quirk: `date_share` serializes as **null** on the detail endpoint on every
probed job (it is always set on list rows) — posting dates only come from
search results.

## Syndication feeds (not used by the CLI, listed for completeness)

Platform-wide feeds on the marketing site, hub at `https://flowxtra.com/feed`:
`/jobs.xml` (Indeed-style `<source><job>`), `/feed.xml` (RSS 2.0),
`/atom.xml`, `/feed.json` (JSON Feed 1.1), plus `/sitemap-jobs.xml`. The JSON
API above is richer (server-side search, structured salary), so the CLI uses
it; the feeds suit feed-reader or crawler workflows.
