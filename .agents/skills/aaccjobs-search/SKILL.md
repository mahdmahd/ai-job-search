---
name: aaccjobs-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to search for jobs at US community
  colleges — faculty, adjunct, administration, or staff roles — or look up a
  specific posting on AACC Jobs (jobs.aacc.nche.edu, the American Association
  of Community Colleges job board), in English. Trigger phrases: community
  college jobs, adjunct faculty US, community college faculty, community
  college administration jobs, AACC jobs, "are there any X jobs at community
  colleges", look up this AACC posting.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/aaccjobs-search/cli/src/cli.ts *)
---

# AACC Jobs Search Skill

Search live job listings from AACC Jobs (`jobs.aacc.nche.edu`) — the American
Association of Community Colleges job board (jobboard.io platform): **US
community-college jobs** (faculty, adjunct, administration, staff), in
English. No authentication, no API key, and **zero runtime dependencies** — it
runs with just `bun`.

> **Client-side search.** Server-side keyword search (`/jobs/search/*`) is
> Cloudflare-walled for non-browser clients, so `search` fetches the public
> RSS feed plus the homepage's "Latest Jobs" list (2 requests) and filters
> **client-side** on `-q`. You are searching the latest ~30 listings, not the
> full archive — say so when reporting "no results".

## Commands

### Search job listings

```bash
bun run .agents/skills/aaccjobs-search/cli/src/cli.ts search --query "<keywords>" [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — **required.** Client-side keyword filter
  (title, company, location, description); space-separated words are ANDed.
- `--page <n>` — accepted for contract compatibility; the feed is a single
  latest-listings page, so only page 1 carries results.
- `--limit <n>` / `-n <n>` — cap total results emitted (client-side, after filtering).
- `--format json|table|plain` — default `json`.

There is no `--location` flag — the portal has no usable location parameter,
so put the city/state in `--query` (e.g. `-q "adjunct Texas"`).

### Fetch full job detail

```bash
bun run .agents/skills/aaccjobs-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the numeric job ID from `search` results (e.g. `623296164`). You may
also pass a full `/jobs/{id}-{slug}` URL. Returns the full description,
posting date, deadline, employment type, and apply link.

## Usage examples

```bash
# Adjunct roles across community colleges
bun run .agents/skills/aaccjobs-search/cli/src/cli.ts search -q "adjunct" --limit 5 --format table

# Biology faculty openings
bun run .agents/skills/aaccjobs-search/cli/src/cli.ts search -q "biology faculty" --format table

# Executive roles in California
bun run .agents/skills/aaccjobs-search/cli/src/cli.ts search -q "president California" --format json

# PhD-relevant teaching roles
bun run .agents/skills/aaccjobs-search/cli/src/cli.ts search -q "PhD candidate" --format table

# Administration openings in Texas
bun run .agents/skills/aaccjobs-search/cli/src/cli.ts search -q "dean Texas" --format table

# Full details for a specific posting
bun run .agents/skills/aaccjobs-search/cli/src/cli.ts detail 623296164 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing IDs to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process exits with code `1`.

## Notes

- Data is from AACC Jobs' public RSS feed and homepage — no credentials required.
- The feed holds the latest ~30 listings; `--limit` caps after filtering.
- Server-side search paths (`/jobs/search/*`, `/?keywords=`) are
  Cloudflare-walled or unfiltered — never construct them; the CLI only touches
  `/jobs.rss`, `/`, and `/jobs/{id}`.
- Detail pages carry schema.org/JobPosting JSON-LD — the preferred field source.
- The CLI sends an honest `aaccjobs-cli` UA and retries 429/5xx with
  exponential backoff. Keep volume low (see ToS note below).
- robots.txt permits public listing crawl (search/detail paths) but names
  several disallowed AI crawlers site-wide — no AI product name appears in the
  UA. Personal use only; run it on your own responsibility.
