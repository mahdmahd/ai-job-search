# naturecareers-cli

CLI for searching **Nature Careers** (nature.com/naturecareers) — global
science/academic research jobs and industry research roles, English-language.

**Data source**: Madgex jobseeker HTML on nature.com —
`/naturecareers/searchjobs/` (list) and `/naturecareers/job/{id}/` (detail via JSON-LD).
**Authentication**: None required.
**Dependencies**: None (plain `bun` + `fetch`). `bun install` is optional and only pulls dev type defs.

> **Keep volume low — personal use only.** robots.txt allows the paths this CLI
> uses; do not bulk-crawl or redistribute. The CLI sends an honest
> `naturecareers-cli` User-Agent and backs off exponentially on 429/5xx.

## Installation

```bash
cd .agents/skills/naturecareers-search/cli
bun install   # optional — only installs TypeScript dev types
```

## Commands

| Command | Description |
|---------|-------------|
| `search` | Search for job listings (`--query` required) |
| `detail` | Fetch full detail for a single job listing (JSON-LD) |

`search` accepts `--format json|table|plain` (default `json`); `detail` accepts `--format json|plain`.
All errors are written to **stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.

## Quick examples

```bash
# PhD candidate roles, first 5 as a table
bun run src/cli.ts search -q "PhD candidate" --limit 5 --format table

# Postdoc roles in London, newest first
bun run src/cli.ts search -q "postdoctoral researcher London" --sort date --format table

# Computational biology, page 2, JSON
bun run src/cli.ts search -q "computational biology" --page 2

# Full detail for one job
bun run src/cli.ts detail 12864992 --format plain
```

See `../SKILL.md` for the full flag reference and quirks; `../url-reference.md`
for endpoints and parsing anchors.

## Search flags

| Flag | Alias | Description |
|------|-------|-------------|
| `--query` | `-q` | **Required.** Keywords (title / skill / role). Put the city in the query — there is no `--location` flag. |
| `--page` | | 1-indexed page (20 results/page). |
| `--limit` | `-n` | Cap results emitted (client-side). |
| `--sort` | | `relevance` (default) \| `date`. |
| `--format` | | `json` \| `table` \| `plain`. |

## Tests

```bash
bun run test         # offline only — fixtures and stubbed fetch, no network
bun run typecheck
```
