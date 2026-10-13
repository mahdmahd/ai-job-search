---
name: latinosinhighered-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to search US higher-education jobs on
  LatinosinHigherEd (latinosinhighered.com) — the job board serving the
  Latino/Hispanic higher-education community: faculty, postdoc, adjunct,
  lecturer, staff, and administration roles at US colleges and universities,
  English-language. Invoke even when the portal is not named explicitly:
  "higher ed jobs", "university jobs US", "Latino higher ed jobs",
  "Hispanic-serving institution jobs", "faculty jobs US", "academic jobs
  America", "postdoc US", "empleos educación superior", "trabajos universidad
  EE.UU.", "look up this LatinosinHigherEd posting". Locations are only
  searchable inside the keyword — include the city/state in --query (e.g.
  "assistant professor New York").
context: fork
enabled: true
allowed-tools: Bash(bun run skills/latinosinhighered-search/cli/src/cli.ts *)
---

# LatinosinHigherEd Search Skill

Search live job listings from **LatinosinHigherEd** (latinosinhighered.com) —
the US higher-education job board for the Latino/Hispanic higher-ed community
(faculty, postdocs, staff, and administration at US institutions), in English.
No authentication, no API key, and **zero runtime dependencies** — it runs with
just `bun`, against the site's public `/candidate/search_jobs` and
`/career/{id}/{slug}` pages.

## ⚠️ Low volume, personal use only

`robots.txt` allows the search and `/career/` detail paths (only candidate/employer
private areas and `/main` are disallowed) and no login is required, but this is a
personal job-search tool: **keep volume low** (a handful of requests per session),
don't use it commercially or for bulk data collection, and run it on your own
responsibility.

## When to use this skill

- Search US higher-ed openings by role, field, or institution keyword
- Narrow by city/state inside the keyword (e.g. `"registrar Texas"`)
- Get the full description, posting/close dates, and apply link of a
  specific posting

## Commands

### Search job listings

```bash
bun run .agents/skills/latinosinhighered-search/cli/src/cli.ts search --query "<keywords>" [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — keyword search (title, skill, institution).
  **Required.** The portal has **no location parameter** — include the city or
  state in the query (e.g. `"assistant professor Texas"`).
- `--page <n>` — accepted for contract compatibility but the portal exposes **no
  pagination parameter**: results come as a single page, so any `--page > 1`
  emits zero results (documented, capped client-side — no wasted request).
- `--limit <n>` / `-n <n>` — cap results emitted (client-side, after the fetch).
- `--format json|table|plain` — default `json`.

### Fetch full job detail

```bash
bun run .agents/skills/latinosinhighered-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the numeric job id from `search` results (e.g. `179106`). You may also
pass a full `latinosinhighered.com/career/<id>/<slug>` URL or a site-relative
`/career/<id>/<slug>` path. Returns the full description, post/close dates,
employer, category, job type, salary, required education/experience, and the
apply URL.

## Usage examples

```bash
# PhD-level academic roles
bun run .agents/skills/latinosinhighered-search/cli/src/cli.ts search -q "PhD candidate" --limit 5 --format table

# Faculty search
bun run .agents/skills/latinosinhighered-search/cli/src/cli.ts search -q "assistant professor" --format table

# Administration role narrowed by state (location lives in the keyword)
bun run .agents/skills/latinosinhighered-search/cli/src/cli.ts search -q "registrar Texas" --format table

# Programmatic use — ids feed `detail`
bun run .agents/skills/latinosinhighered-search/cli/src/cli.ts search -q "lecturer biology" --format json

# Full detail for one posting
bun run .agents/skills/latinosinhighered-search/cli/src/cli.ts detail 179106 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing ids to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

JSON shape: `{ "meta": { "count": ..., "page": ... }, "results": [...] }` with
`id`, `title`, `company`, `location`, `date`, `url` on every result — missing
values are `null`, never omitted. All errors are written to **stderr** as
`{ "error": "...", "code": "..." }` with exit code `1`.

## Notes

- **Platform: JobMount** (Madgex-style layout, different markup family from the
  Madgex boards). Anchors: `a.job-link` → `/career/{id}/{slug}`,
  `.featured-jobs-title`, `.sp_sh_employer`, `.sp_sh_city`, `.sp_sh_region`;
  detail wrapper `Tpl holder_job_details` with a `vac_item_*` label/value table
  and a `job_desc_td` description cell.
- **Single-page results.** The GET search endpoint exposes no pagination —
  `--page > 1` returns zero results. This is a low-volume board; the keyword
  GET also feeds the rotating "Featured Jobs" module, so treat the result list
  as indicative and run `detail` on anything promising.
- **No `--jobage` or `--location` flags.** The portal's search is keyword-only
  in this CLI. Put the city/state in `--query`.
- **`date` is `null` in search results** — list cards carry no date element.
  Run `detail` on a promising id to get `datePosted`/`validThrough` from the
  page's JSON-LD.
- Search + detail requests retry 429/5xx with exponential backoff. Keep volume
  low (see note above).
