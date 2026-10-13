---
name: consortiumlgbt-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to search LGBTQ+ higher-education and
  campus diversity jobs — LGBT resource center staff, queer student services,
  diversity and inclusion officers, and campus resource professionals — on the
  Consortium of Higher Education LGBT Resource Professionals job board
  (consortium.lgbt/jobs), US higher-ed LGBTQ+ roles, English-language. Invoke
  even when the portal is not named explicitly: "LGBT higher ed jobs", "queer
  campus jobs", "diversity resource professional", "LGBT resource center jobs",
  "campus pride jobs", "queer student services jobs", "look up this Consortium
  posting".
context: fork
enabled: true
allowed-tools: Bash(bun run skills/consortiumlgbt-search/cli/src/cli.ts *)
---

# Consortium LGBT Search Skill

Search live job listings from the **Consortium of Higher Education LGBT
Resource Professionals** job board — US higher-ed LGBTQ+ resource professional
roles (LGBT resource centers, campus diversity offices, queer student
services), in English. No authentication, no API key, and **zero runtime
dependencies** — it runs with just `bun`, against the board's public WP Job
Manager AJAX endpoint.

## ⚠️ Low volume, personal use only

`robots.txt` allows the jobs paths and no login is required, but this is a
personal job-search tool: **keep volume low** (a handful of requests per
session), don't use it commercially or for bulk data collection, and run it on
your own responsibility. This is a niche, low-volume board (typically a dozen
or so live postings) — an empty keyword query lists everything.

## When to use this skill

- Search LGBTQ+ higher-ed and campus diversity openings by role or keyword
- Narrow by location (city name, or "remote")
- Page through results (20 per page)
- Get the full description, posting/close dates, and employment type of a
  specific posting

## Commands

### Search job listings

```bash
bun run .agents/skills/consortiumlgbt-search/cli/src/cli.ts search --query "<keywords>" [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — keyword search (title, role, organization).
  **Required.** Omit the value (pass nothing) to list all postings.
- `--location <text>` / `-l <text>` — location filter (e.g. `"Rotherham"`,
  `"London"`, `"Remote"`). Optional; omit for all locations.
- `--page <n>` — page number (1-indexed, 20 results per page).
- `--limit <n>` / `-n <n>` — cap results emitted (client-side, after the page
  fetch).
- `--format json|table|plain` — default `json`.

### Fetch full job detail

```bash
bun run .agents/skills/consortiumlgbt-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the numeric post id from `search` results (e.g. `36649`). You may
also pass a full `www.consortium.lgbt/job/<slug>/` URL or a site-relative
`/job/<slug>/` path. Slugs are not reversible to ids, so a slug URL always
costs one extra HTTP request. Returns the full description, `datePosted`,
`validThrough` (application deadline), hiring organization, location, and
employment type.

## Usage examples

```bash
# LGBT resource center roles
bun run .agents/skills/consortiumlgbt-search/cli/src/cli.ts search -q "resource" --limit 5 --format table

# Peer support roles
bun run .agents/skills/consortiumlgbt-search/cli/src/cli.ts search -q "peer support" --format table

# Remote-friendly roles
bun run .agents/skills/consortiumlgbt-search/cli/src/cli.ts search -q "" -l "Remote" --format table

# Programmatic use — ids feed `detail`
bun run .agents/skills/consortiumlgbt-search/cli/src/cli.ts search -q "trustee" --format json

# Full detail for one posting
bun run .agents/skills/consortiumlgbt-search/cli/src/cli.ts detail 36649 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing ids to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

JSON shape: `{ "meta": { "count": ..., "page": ... }, "results": [...] }` with
`id`, `title`, `company`, `location`, `date`, `url`, `employmentType`,
`deadline` on every result — missing values are `null`, never omitted. All
errors are written to **stderr** as `{ "error": "...", "code": "..." }` with
exit code `1`.

## Notes

- **Platform: WordPress + WP Job Manager.** Listings load server-side via the
  plugin's pretty AJAX endpoint `POST /jm-ajax/get_listings/` (see
  `url-reference.md`) — the `/jobs/` page itself ships an empty
  `<ul class="job_listings">` and requires JavaScript, so the CLI talks to
  the AJAX endpoint directly. No nonce or session is required.
- **SSR vs AJAX finding:** `li.job_listing` items do NOT appear in the SSR
  HTML of `/jobs/` (verified 2026-10-13); the old-style
  `admin-ajax.php?action=get_job_listings` path returns HTTP 400. Use
  `get_listings` on the `/jm-ajax/` route.
- **Canonical host is `www.consortium.lgbt`** (`.lgbt` TLD). The `.com`/`.org`
  variants do not resolve to this board.
- The search endpoint returns at most one page of HTML (`max_num_pages: 1`
  on this low-volume board); `--page` maps to the endpoint's `page` param.
- There is no posted-within filter on the portal, so this CLI has **no
  `--jobage` flag**. `date` is the `<time datetime="...">` posted date from
  each listing card; run `detail` for `validThrough` (deadline).
- Search + detail requests retry 429/5xx with exponential backoff. Keep
  volume low (see note above).
