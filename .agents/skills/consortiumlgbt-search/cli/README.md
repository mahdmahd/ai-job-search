# consortiumlgbt-cli

CLI for searching the **Consortium of Higher Education LGBT Resource
Professionals** job board — US higher-ed LGBTQ+ resource professional roles
(LGBT resource centers, campus diversity offices, queer student services), in
English.

**Data source**: WP Job Manager AJAX endpoint (`POST /jm-ajax/get_listings/`)
plus public `/job/<slug>/` detail pages on `www.consortium.lgbt`.
**Authentication**: None required (no nonce, no session).
**Dependencies**: None (plain `bun` + `fetch`). `bun install` is optional and only pulls dev type defs.

> **Low volume, personal use only.** Keep to a handful of requests per session;
> don't use it commercially or for bulk data collection, and run it on your
> own responsibility. This is a niche, low-volume board — an empty keyword
> query lists everything.

## Installation

```bash
cd .agents/skills/consortiumlgbt-search/cli
bun install   # optional — only installs TypeScript dev types
```

The CLI runs without any install because it has zero runtime dependencies.

## Commands

| Command | Description |
|---------|-------------|
| `search` | Search for job listings (`--query` required) |
| `detail` | Fetch full detail for a single job listing |

`search` accepts `--format json|table|plain` (default `json`); `detail` accepts `--format json|plain`.
All errors are written to **stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.

## Quick examples

```bash
# LGBT resource center roles
bun run src/cli.ts search -q "resource" --limit 5 --format table

# Remote-friendly roles (list all, filter by location)
bun run src/cli.ts search -q "" -l "Remote" --format table

# Peer support roles
bun run src/cli.ts search -q "peer support" --format table

# Full detail for one job
bun run src/cli.ts detail 36649 --format plain
```

See `../SKILL.md` for the full flag reference.

## Search flags

| Flag | Alias | Description |
|------|-------|-------------|
| `--query` | `-q` | **Required.** Keywords (pass `""` to list all postings). |
| `--location` | `-l` | Location filter, e.g. `"Rotherham"`, `"Remote"`. |
| `--page` | | 1-indexed page (20 results/page). |
| `--limit` | `-n` | Cap results emitted. |
| `--format` | | `json` \| `table` \| `plain`. |
