---
name: insidehighered-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to search US higher-education jobs —
  faculty, postdoc, adjunct, lecturer, registrar, dean, academic staff, and
  university administration roles — on Inside Higher Ed Careers
  (careers.insidehighered.com), the US higher-ed job board, English-language.
  Invoke even when the portal is not named explicitly: "higher ed jobs US",
  "inside higher ed", "faculty jobs US", "academic jobs United States",
  "assistant professor jobs", "postdoc US", "university jobs USA", "registrar
  job", "look up this Inside Higher Ed posting". Locations are only searchable
  inside the keyword — include the city/state in --query (e.g. "assistant
  professor Boston").
context: fork
enabled: true
allowed-tools: Bash(bun run skills/insidehighered-search/cli/src/cli.ts *)
---

# Inside Higher Ed Careers Search Skill

Search live job listings from Inside Higher Ed Careers — the **US higher
education** job board (faculty, postdocs, staff, and administration at US
institutions), in English. No authentication, no API key, and **zero runtime
dependencies** — it runs with just `bun`, against the site's public
`/searchjobs/` and `/job/` pages.

## ⚠️ Low volume, personal use only

`robots.txt` allows the search and job-detail paths and no login is required,
but this is a personal job-search tool: **keep volume low** (a handful of
requests per session), don't use it commercially or for bulk data collection,
and run it on your own responsibility.

## When to use this skill

- Search US higher-ed openings by role, field, or institution keyword
- Narrow by city/state inside the keyword (e.g. `"registrar California"`)
- Page through results (20 per page)
- Get the full description, posting/close dates, and apply links of a
  specific posting

## Commands

### Search job listings

```bash
bun run .agents/skills/insidehighered-search/cli/src/cli.ts search --query "<keywords>" [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — keyword search (title, skill, institution).
  **Required.** The portal has **no location parameter in this CLI** — include
  the city or state in the query (e.g. `"assistant professor Boston"`).
- `--page <n>` — page number (1-indexed, 20 results per page).
- `--limit <n>` / `-n <n>` — cap results emitted (client-side, after the page
  fetch).
- `--format json|table|plain` — default `json`.

### Fetch full job detail

```bash
bun run .agents/skills/insidehighered-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the numeric job id from `search` results (e.g. `3509752`). You may
also pass a full `careers.insidehighered.com/job/<id>/...` URL (slug optional)
or a site-relative `/job/<id>/...` path. Returns the JSON-LD `JobPosting`
fields: description, `datePosted`, `validThrough`, hiring organization,
location, employment type, and both apply links.

## Usage examples

```bash
# PhD-level research roles
bun run .agents/skills/insidehighered-search/cli/src/cli.ts search -q "PhD candidate" --limit 5 --format table

# Faculty search, first page
bun run .agents/skills/insidehighered-search/cli/src/cli.ts search -q "assistant professor" --format table

# Administration role narrowed by state (location lives in the keyword)
bun run .agents/skills/insidehighered-search/cli/src/cli.ts search -q "registrar California" --format table

# Second page of postdoc listings
bun run .agents/skills/insidehighered-search/cli/src/cli.ts search -q "postdoc" --page 2 --format table

# Programmatic use — ids feed `detail`
bun run .agents/skills/insidehighered-search/cli/src/cli.ts search -q "lecturer biology" --format json

# Full detail for one posting
bun run .agents/skills/insidehighered-search/cli/src/cli.ts detail 3509752 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing ids to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

JSON shape: `{ "meta": { "count": ..., "page": ... }, "results": [...] }` with
`id`, `title`, `company`, `location`, `date`, `url`, `salary`, `snippet` on
every result — missing values are `null`, never omitted. All errors are written
to **stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.

## Notes

- **Platform: Madgex** — the same job-board stack as jobs.chronicle.com and
  nature.com/naturecareers; markup quirks below are shared Madgex behavior.
- **Correct host: `careers.insidehighered.com`.** The old
  `jobs.insidehighered.com` host is dead (HTTP 522) — the CLI only ever talks
  to `careers.`.
- **List hrefs contain whitespace/newlines** (`href=" \n\t/job/3509752/slug/"`)
  — the CLI trims before use; don't copy hrefs out of raw HTML without
  trimming.
- **`date` is `null` in search results** — list cards carry no visible date
  element. Run `detail` on a promising id to get `date` (`datePosted`) and
  `validThrough` from the page's JSON-LD.
- **No `--jobage` or `--location` flags.** The portal's search is keyword-only
  in this CLI (the site also exposes `LocationId`/`RadialLocation` radius
  params, which need an internal location id lookup and are documented in
  `url-reference.md` but not implemented). Put the city/state in `--query`.
- Search + detail requests retry 429/5xx with exponential backoff. Keep volume
  low (see note above).
