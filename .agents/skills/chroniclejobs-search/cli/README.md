# chroniclejobs-cli

CLI for searching Chronicle of Higher Education Jobs (`jobs.chronicle.com`) —
US/global higher-ed faculty and administration jobs, in English.

**Data source**: the portal's HTML search results (`/searchjobs/`) and job detail
pages (`/job/<id>/`, JSON-LD `JobPosting`).
**Authentication**: None required. The jobs subdomain is free to read — the
Chronicle's news-article paywall does not apply here.
**Dependencies**: None (plain `bun` + `fetch`). `bun install` is optional and only
pulls dev type defs.

> **Low volume, personal use.** Keep requests to a handful per session; don't use
> it commercially or for bulk data collection. Run it on your own responsibility.

## Installation

```bash
cd .agents/skills/chroniclejobs-search/cli
bun install   # optional — only installs TypeScript dev types
```

The CLI runs without any install because it has zero runtime dependencies.

## Commands

| Command | Description |
|---------|-------------|
| `search` | Search job listings (`--query` required) |
| `detail` | Fetch full detail (JSON-LD description, posted/closing dates, apply link) for one posting |

`search` accepts `--format json|table|plain` (default `json`); `detail` accepts
`--format json|plain`. All errors are written to **stderr** as
`{ "error": "...", "code": "..." }` with exit code `1`.

## Quick examples

```bash
# PhD-level positions
bun run src/cli.ts search -q "PhD candidate" --limit 5 --format table

# Academic leadership roles
bun run src/cli.ts search -q "dean of students" --format table

# Postdoc openings, page 2
bun run src/cli.ts search -q "postdoctoral fellow" --page 2 --format json

# Full detail for one posting (id from search results)
bun run src/cli.ts detail 38047649 --format plain
```

See `../SKILL.md` for the full flag reference and portal notes.

## Search flags

| Flag | Alias | Description |
|------|-------|-------------|
| `--query` | `-q` | **Required.** Keywords (title, role, field). Include a place in the query if you want one — there is no `--location` flag. |
| `--page` | | 1-indexed page (20 results/page). |
| `--limit` | `-n` | Cap results emitted (client-side). |
| `--format` | | `json` \| `table` \| `plain`. |

There is deliberately **no `--jobage` flag**: the portal exposes no posting-age
filter, and search cards carry no date (the posting date comes from the detail
page's JSON-LD `datePosted`). Unsupported flags are rejected with
`UNKNOWN_FLAG`, never silently discarded.
