---
name: jobrxiv-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to search for research or science
  jobs worldwide on jobRxiv (jobrxiv.org) — PhD candidate positions, postdoc
  fellowships, faculty appointments, research assistant / technician / lab
  manager roles in any discipline (life sciences, physics, chemistry,
  economics, AI, etc.) in any country. English-language global academic job
  board (~3.3k listings). Trigger phrases: "research jobs", "science jobs
  global", "postdoc international", "PhD candidate positions", "faculty
  position worldwide", "academic jobs jobRxiv", "PhD position abroad".
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run skills/jobrxiv-search/cli/src/cli.ts *)
---

# jobRxiv Search Skill

Search live research/science job listings from **jobRxiv** (https://jobrxiv.org/) —
a global, English-language job board for academia: PhD positions, postdocs,
faculty appointments, research assistants/technicians, lab managers, in every
discipline and country. No authentication, no API key, **zero runtime
dependencies** — it runs with just `bun`.

## Scope

- **Use for**: research/science roles — PhD candidate, postdoc, faculty, research
  staff. Best coverage in life sciences; strong also in physics, chemistry,
  computational fields.
- **Not for**: industry-only job boards (use the other portal skills), or
  non-research roles.
- **Volume**: low-traffic board (~3.3k postings, ~1k matching a typical query).
  Keep request volume low regardless (see below).

## ⚠️ Personal use only

`robots.txt` allows the listing and job paths and no login is required, but
this is a personal job-search tool, **not** a bulk crawler — keep volume low,
don't use it commercially or for bulk data collection, and run it on your own
responsibility.

## Commands

### Search job listings

```bash
bun run .agents/skills/jobrxiv-search/cli/src/cli.ts search --query "<keywords>" [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — **required.** Keywords matched against
  titles, descriptions, and locations (e.g. `"PhD candidate"`, `"postdoc
  bioinformatics"`, `"assistant professor"`).
- `--jobage <days>` — keep only postings dated within the last N days
  (client-side date filter; the portal has no server-side recency param).
- `--page <n>` — 1-indexed page (25 results per page).
- `--limit <n>` / `-n <n>` — cap total results emitted (client-side).
- `--format json|table|plain` — default `json`.

### Fetch full job detail

```bash
bun run .agents/skills/jobrxiv-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the numeric post ID from `search` results (e.g. `155928`). You may also
pass a full `/job/{slug}/` URL or a `?p=ID` URL. Returns the full description,
employer, location, posted date, employment type, apply link, and
active/closed status.

## Usage examples

```bash
# PhD candidate positions, first 5 in a table
bun run .agents/skills/jobrxiv-search/cli/src/cli.ts search -q "PhD candidate" --limit 5 --format table

# Postdoc roles in the Netherlands (no location param — put it in the query)
bun run .agents/skills/jobrxiv-search/cli/src/cli.ts search -q "postdoc Netherlands" --format table

# Recent postings only (last 30 days)
bun run .agents/skills/jobrxiv-search/cli/src/cli.ts search -q "research fellow machine learning" --jobage 30 --format table

# Full detail for one posting
bun run .agents/skills/jobrxiv-search/cli/src/cli.ts detail 155928 --format plain

# Detail straight from a posting URL
bun run .agents/skills/jobrxiv-search/cli/src/cli.ts detail "https://jobrxiv.org/job/academic-research-assistant-position-phd-candidate-f-m-d/" --format json
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, `{meta:{count,page}, results:[...]}`, passing IDs to `detail` |
| `table` | Quick human-readable scanning (ID / title / company / location / date) |
| `plain` | Reading a single job's full detail (`detail` command) |

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process exits with code `1`.

## Notes

- Data is from jobRxiv's public WP Job Manager listing endpoint
  (`/jm-ajax/get_listings/`) and public `/job/{slug}/` detail pages — no
  credentials required. Endpoints and markup anchors are documented in
  `url-reference.md`.
- **IDs**: numeric WP post IDs from the card's class list (e.g. `post-155928`).
  Some slugs also embed a number (e.g. `...-dublin-27778-...`) but the post ID
  is the stable identifier. Expired postings remain searchable and fall back to
  `?post_type=job_listing&p=ID` permalinks; `detail` still resolves them.
- The portal has **no server-side location or recency filter** — include the
  country/city in `--query` and use `--jobage` for freshness.
- Pagination is server-side: 25 results per page, `--page <n>` maps to the
  endpoint's `page` parameter (`max_num_pages` comes back in the envelope).
- Bonus browsing: category archives like `/job-category/postdoc/`,
  `/job-category/phd/`, `/job-category/faculty/` (not wired into the CLI).
- The site runs WordPress + WP Job Manager + the Workscout theme; if markup
  drifts, `url-reference.md` records the anchors to update.
- The site may rate-limit; the CLI retries 429/5xx with exponential backoff.
