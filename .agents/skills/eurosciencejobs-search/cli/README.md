# eurosciencejobs-cli

CLI for searching European science and postdoc jobs on
**EuroScienceJobs.com** (English-language postings across Europe).

**Data source**: public `job_search/keyword/...` results and `job_display/<id>`
pages (see `../url-reference.md`).
**Authentication**: None required.
**Dependencies**: None (plain `bun` + `fetch`). `bun install` is optional and only pulls dev type defs.

## Installation

```bash
cd .agents/skills/eurosciencejobs-search/cli
bun install   # optional — only installs TypeScript dev types
```

The CLI runs without any install because it has zero runtime dependencies.

## Commands

| Command | Description |
|---------|-------------|
| `search` | Search job listings (`--query` required) |
| `detail` | Fetch full detail for a single job listing |

`search` accepts `--format json|table|plain` (default `json`); `detail` accepts `--format json|plain`.
All errors are written to **stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.

## Quick examples

```bash
# Postdoc roles across Europe
bun run src/cli.ts search -q "postdoc" --format table

# PhD positions in Berlin
bun run src/cli.ts search -q "PhD candidate" -l "Berlin" --limit 5 --format table

# Full detail for one job
bun run src/cli.ts detail 297575 --format plain
```

See `../SKILL.md` for the full flag reference.

## Search flags

| Flag | Alias | Description |
|------|-------|-------------|
| `--query` | `-q` | **Required.** Keywords (role / field / technique). |
| `--location` | `-l` | Location filter, e.g. `"Berlin"`, `"Paris"`. |
| `--jobage` | | Posted within N days (client-side filter). |
| `--page` | | 1-indexed page (client-side slice, 20/page). |
| `--limit` | `-n` | Cap results emitted. |
| `--format` | | `json` \| `table` \| `plain`. |
