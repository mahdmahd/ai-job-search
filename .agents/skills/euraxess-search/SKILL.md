---
name: euraxess-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to search EURAXESS (the European
  Commission's research mobility portal) for research jobs, PhD positions,
  postdoc fellowships, or research fellow positions in the EU/EEA and wider
  Europe. Covers the European research market (all EU member states and
  associated countries), postings in English. Trigger phrases: EURAXESS jobs,
  research jobs Europe, postdoc Europe, PhD position EU, PhD candidate Europe,
  research fellow EU, research career Europe, Marie Curie style fellowships,
  European research positions.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/euraxess-search/cli/src/cli.ts *)
---

# EURAXESS Search Skill

Search live research job listings from **EURAXESS** — the European Commission's
research mobility portal (https://euraxess.ec.europa.eu), covering PhD
candidates, postdoctoral fellows, research fellows, and senior researcher
positions across the EU/EEA and associated countries, in English. No
authentication, no API key, **zero runtime dependencies** — it runs with just
`bun`.

## ⚠️ Personal use only

**robots.txt disallows the parameterized search URLs this tool requests
(`Disallow: /*?` covers every `?f[0]=keywords:...&page=...` URL) and the job
detail pages (`Disallow: /jobs/*`).** The user has accepted this and chosen to
proceed for personal job hunting anyway. Consequences you must respect:

- **Keep volume low** — a handful of requests per session, never a crawl.
- **No commercial or bulk use** — no scheduled runs, no database building, no
  redistribution of the data.
- **Run it on your own responsibility** — the access is not sanctioned by the
  portal. Never request the additionally disallowed paths (`/api/*`, `/rest/*`,
  `?_format=json`, `/user/*`, `/my/*`), and never impersonate a browser to work
  around the detail-page restriction.
- The honest tool User-Agent (`euraxess-cli/1.0`) is intentional: requests are
  identifiable, not disguised.

## What it searches

- `search` — the public `/jobs/search` keyword facet (`f[0]=keywords:...`),
  10 cards per page. Each result carries id, title, organisation, location
  string, posted date, canonical URL, ISO application deadline, and snippet.
- `detail` — one posting's full page (offer description, job information
  fields, apply email). **Often refused for non-browser clients** — see Notes.

## Commands

### Search job listings

```bash
bun run .agents/skills/euraxess-search/cli/src/cli.ts search -q "<keywords>" [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — **required.** Keywords (role, research field,
  skill). Include the country in the query where useful — EURAXESS's GET search
  URL has no location parameter (e.g. `-q "PhD candidate Netherlands"`).
- `--page <n>` — page number (1-indexed, 10 results per page).
- `--limit <n>` / `-n <n>` — cap total results emitted (client-side).
- `--format json|table|plain` — default `json`.

**Not supported:** `--location` and `--jobage` are rejected with
`UNKNOWN_FLAG` — the EURAXESS GET search URL has no location or posting-age
parameter. Filter by including the country/keyword in `-q`.

### Fetch full job detail

```bash
bun run .agents/skills/euraxess-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the numeric ID from `search` results (e.g. `472465`); a full
`https://euraxess.ec.europa.eu/jobs/<id>` URL also works. Returns the offer
description, job-information fields (department, research field, researcher
profile, positions, contract type, job status, country), work locations, ISO
deadline, and the apply email. When EURAXESS refuses to serve the page to this
client, the command exits 1 with code `DETAIL_BLOCKED` — never fabricated data.

## Usage examples

```bash
# PhD positions in the Netherlands
bun run .agents/skills/euraxess-search/cli/src/cli.ts search -q "PhD candidate Netherlands" --format table

# Postdoctoral researcher positions, second page
bun run .agents/skills/euraxess-search/cli/src/cli.ts search -q "postdoctoral researcher" --page 2 --limit 5

# Research fellow roles in Germany
bun run .agents/skills/euraxess-search/cli/src/cli.ts search -q "research fellow Germany" --format table

# Machine learning postdocs anywhere in Europe, JSON
bun run .agents/skills/euraxess-search/cli/src/cli.ts search -q "postdoc machine learning" --format json

# Full details for a specific job (may return DETAIL_BLOCKED)
bun run .agents/skills/euraxess-search/cli/src/cli.ts detail 472465 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — `{ meta: { count, page }, results: [...] }`, passing IDs to `detail` |
| `table` | Quick human-readable scanning (id, title, org, country, deadline) |
| `plain` | Reading a single job's full detail (`detail` command) |

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and
the process exits with code `1` (`MISSING_REQUIRED`, `VALIDATION`,
`UNKNOWN_FLAG`, `SEARCH_FAILED`, `NOT_FOUND`, `DETAIL_BLOCKED`).

## Notes

- **DETAIL_BLOCKED limitation.** EURAXESS (Drupal behind CloudFront) serves
  `/jobs/<id>` only intermittently to non-browser clients: some requests get a
  307 redirect to `/jobs/search`, others a stub page without job content. When
  the fetched body carries no job-detail markup, `detail` exits 1 with
  `DETAIL_BLOCKED` and points to the browser URL — it never fabricates data.
  When a detail page *does* come through, it is parsed in full. Verified live
  2026-10-13: detail pages were served to the honest UA for tested IDs, but
  treat availability as best-effort.
- **Search sorting.** The portal UI offers sort params
  (`sort[name]=created|field_job_application_deadline_z&sort[direction]=ASC|DESC`),
  but live probes showed they do not change the ordering of anonymous GET
  responses, so the CLI does not expose them. Results arrive in the portal's
  default order (newest first).
- **Facets.** The search supports many more facets than keywords
  (`f[0]=job_research_field:<ID>`, `f[0]=job_country:<CODE>`, …), but the CLI
  only uses the keywords facet — country/field filtering goes through the query
  text.
- **`meta.count`** is approximate when the pagination footer is present
  (last page × 10; the exact total is not rendered on the page), and equals the
  page length otherwise. Page size is a fixed 10.
- **POST form search exists** (`POST /jobs/search` with form fields) — the GET
  facet URL is what the CLI uses, matching what the portal's own filter UI
  emits; it is also the URL shape documented in `url-reference.md`.
- **CloudFront caching:** repeated identical queries may serve a cached page;
  freshly posted jobs can lag by some minutes.
- robots.txt verdict (verified 2026-10-13): `Allow: /jobs` covers the bare
  listing pages, but `Disallow: /*?` (any query string) and
  `Disallow: /jobs/*` (detail pages) apply to what this CLI fetches — that is
  the accepted personal-use tradeoff above. The CLI never requests the other
  disallowed paths (`/api/*`, `/rest/*`, `?_format=json`, `/user/*`, `/my/*`).
