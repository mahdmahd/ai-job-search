# latinosinhighered-cli

CLI for searching jobs on **LatinosinHigherEd** (latinosinhighered.com) — the
US higher-education job board for the Latino/Hispanic higher-ed community.

**Data source**: `GET /candidate/search_jobs?keywords=...` (list) and
`/career/{id}/{slug}` (detail). JobMount platform, Madgex-style layout.
**Authentication**: None required for read.
**Dependencies**: None (plain `bun` + `fetch`). `bun install` is optional and
only pulls dev type defs.

> **Low volume, personal use only.** robots.txt allows the search and
> `/career/` paths, but keep requests to a handful per session, don't use it
> commercially or for bulk data collection, and run it on your own
> responsibility.

## Installation

```bash
cd .agents/skills/latinosinhighered-search/cli
bun install   # optional — only installs TypeScript dev types
```

The CLI runs without any install because it has zero runtime dependencies.

## Commands

| Command | Description |
|---------|-------------|
| `search` | Search for job listings (`--query` required) |
| `detail` | Fetch full detail for a single job listing |

`search` accepts `--format json|table|plain` (default `json`); `detail`
accepts `--format json|plain`. All errors are written to **stderr** as
`{ "error": "...", "code": "..." }` with exit code `1`.

## Quick examples

```bash
# PhD-level academic roles
bun run src/cli.ts search -q "PhD candidate" --limit 5 --format table

# Faculty search
bun run src/cli.ts search -q "assistant professor" --format table

# Administration role narrowed by state (location lives in the keyword)
bun run src/cli.ts search -q "registrar Texas" --format json

# Full detail for one job
bun run src/cli.ts detail 179106 --format plain
```

See `../SKILL.md` for the full flag reference and the volume note.

## Search flags

| Flag | Alias | Description |
|------|-------|-------------|
| `--query` | `-q` | **Required.** Keywords (title / skill / institution). Include the city or state here. |
| `--page` | | Accepted for contract compatibility; the portal exposes no pagination — any page > 1 emits zero results. |
| `--limit` | `-n` | Cap results emitted. |
| `--format` | | `json` \| `table` \| `plain`. |
