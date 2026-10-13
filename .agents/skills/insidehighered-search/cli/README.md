# insidehighered-cli

CLI for searching US higher-education jobs on **Inside Higher Ed Careers**
(`careers.insidehighered.com`) — faculty, postdocs, staff, and administration
roles at US institutions, English-language.

**Data source**: Madgex HTML pages — `searchjobs/?Keywords=&Page=` (list) and
`/job/<id>/` (detail, JSON-LD `JobPosting`).
**Authentication**: None required. `robots.txt` allows search and job paths.
**Dependencies**: None (plain `bun` + `fetch`). `bun install` is optional and
only pulls dev type defs.

> **Low volume, personal use.** A handful of requests per session; not for
> commercial or bulk data collection.

## Installation

```bash
cd .agents/skills/insidehighered-search/cli
bun install   # optional — only installs TypeScript dev types
```

The CLI runs without any install because it has zero runtime dependencies.

## Commands

| Command | Description |
|---------|-------------|
| `search` | Search listings (`--query` required) |
| `detail` | Fetch full detail for a single posting |

`search` accepts `--format json|table|plain` (default `json`); `detail`
accepts `--format json|plain`. All errors are written to **stderr** as
`{ "error": "...", "code": "..." }` with exit code `1`.

## Quick examples

```bash
# PhD-level roles
bun run src/cli.ts search -q "PhD candidate" --limit 5 --format table

# Faculty
bun run src/cli.ts search -q "assistant professor" --format table

# Administration, narrowed by state (location lives in the keyword)
bun run src/cli.ts search -q "registrar California" --format table

# Full detail for one posting
bun run src/cli.ts detail 3509752 --format plain
```

See `../SKILL.md` for the full flag reference and `../url-reference.md` for
the endpoint/markup documentation.

## Search flags

| Flag | Alias | Description |
|------|-------|-------------|
| `--query` | `-q` | **Required.** Keywords (role/field/institution). Put the city/state in the query — the CLI has no location flag. |
| `--page` | | 1-indexed page (20 results/page). |
| `--limit` | `-n` | Cap results emitted (client-side). |
| `--format` | | `json` \| `table` \| `plain`. |

`detail` takes `<id|url>`: a numeric id, a `careers.insidehighered.com/job/<id>/...`
URL (slug optional), or a site-relative `/job/<id>/...` path. URLs on any
other host are rejected with `BAD_ID` before any request.

## Tests

```bash
bun run test        # offline: fixtures + flag/URL contract, no network
bun run typecheck   # tsc --noEmit
```
