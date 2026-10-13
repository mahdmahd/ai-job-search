# jobsacuk-cli

CLI for searching **Jobs.ac.uk** (www.jobs.ac.uk) — UK academic jobs
(lectureships, research fellows, postdocs, PhD studentships), English-language
postings, GBP. No authentication, zero runtime dependencies.

**Data source**: jobs.ac.uk HTML — `/search/` (list, 25/page) and `/job/{REF}/`
(detail via embedded `var job = {"job": {...}}` object + HTML anchors).
**Dependencies**: None (plain `bun` + `fetch`). `bun install` is optional and
only pulls dev type defs.

> **Keep volume low — personal use only.** robots.txt allows the paths this CLI
> uses (`/search/`, `/job/`; disallows `/job/feedback/`, `/enhanced/fp/`). Do
> not bulk-crawl or redistribute. The CLI sends an honest `jobsacuk-cli`
> User-Agent and backs off exponentially on 429/5xx. h-captcha markup is
> embedded in every portal page but has never blocked plain requests — if a
> request ever fails, back off and report; never try to solve challenges.

## Installation

```bash
cd .agents/skills/jobsacuk-search/cli
bun install   # optional — only installs TypeScript dev types
```

## Commands

| Command | Description |
|---------|-------------|
| `search` | Search for job listings (`--query` required) |
| `detail` | Fetch full detail by REF, URL, or advert-id |

`search` accepts `--format json|table|plain` (default `json`); `detail` accepts `--format json|plain`.
All errors are written to **stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.

## Quick examples

```bash
# PhD candidate roles, first 5 as a table
bun run src/cli.ts search -q "PhD candidate" --limit 5 --format table

# Research fellow roles in London
bun run src/cli.ts search -q "research fellow" -l "London" --format table

# Lecturer roles in Edinburgh, page 2, JSON
bun run src/cli.ts search -q "lecturer" -l "Edinburgh" --page 2

# Full detail for one advert (REF or URL)
bun run src/cli.ts detail DSL474 --format plain
```

See `../SKILL.md` for the full flag reference and quirks; `../url-reference.md`
for endpoints and parsing anchors.

## Search flags

| Flag | Alias | Description |
|------|-------|-------------|
| `--query` | `-q` | **Required.** Keywords (title / skill / role). |
| `--location` | `-l` | Location filter → portal `location` param (e.g. `"London"`, `"Edinburgh"`). |
| `--page` | | 1-indexed page (25 results/page → `startIndex=(page-1)*25+1`). |
| `--limit` | `-n` | Cap results emitted (client-side). |
| `--format` | | `json` \| `table` \| `plain`. |

No `--jobage`: the portal has no posting-age parameter.

## Tests

```bash
bun run test         # offline only — fixtures and stubbed fetch, no network
bun run typecheck
```
