# jobrxiv-cli

CLI for searching research/science jobs (PhD, postdoc, faculty, research
staff) on jobRxiv.org — a **global, English-language** research job board.

**Data source**: jobRxiv's public WP Job Manager listing endpoint
(`/jm-ajax/get_listings/`) and public `/job/{slug}/` detail pages.
**Authentication**: None required.
**Dependencies**: None (plain `bun` + `fetch`). `bun install` is optional and
only pulls dev type defs.

> **Personal use only.** `robots.txt` allows the listing and job paths and no
> login is required, but keep volume low, don't use it commercially or for
> bulk data collection, and run it on your own responsibility.

## Installation

```bash
cd .agents/skills/jobrxiv-search/cli
bun install   # optional — only installs TypeScript dev types
```

The CLI runs without any install because it has zero runtime dependencies.

## Commands

| Command | Description |
|---------|-------------|
| `search` | Search research/science job listings (`--query` required) |
| `detail` | Fetch full detail for a single posting |

`search` accepts `--format json|table|plain` (default `json`); `detail`
accepts `--format json|plain`.
All errors are written to **stderr** as `{ "error": "...", "code": "..." }`
with exit code `1`.

## Quick examples

```bash
# PhD candidate openings, first 5 in a table
bun run src/cli.ts search -q "PhD candidate" --limit 5 --format table

# Postdoc roles in the Netherlands
bun run src/cli.ts search -q "postdoc Netherlands" --format table

# Assistant professor openings, last 30 days
bun run src/cli.ts search -q "assistant professor" --jobage 30 --format table

# Full detail for one posting (description, employer, apply link)
bun run src/cli.ts detail 155928 --format plain
```

See `../SKILL.md` for the full flag reference and the personal-use note.

## Search flags

| Flag | Alias | Description |
|------|-------|-------------|
| `--query` | `-q` | Keywords (role / field / location). **Required.** There is no server-side location filter — put the country/city in the query. |
| `--jobage` | | Posted within N days (client-side filter on the card's posted date). |
| `--page` | | 1-indexed page (25 results/page, server-side). |
| `--limit` | `-n` | Cap results emitted (client-side). |
| `--format` | | `json` \| `table` \| `plain`. |

JSON shape: `{ "meta": { "count": <total>, "page": <n> }, "results": [ … ] }`.
Every result key is always present; missing values are `null`.

## Tests

Offline only — no network in the suite:

```bash
bun run test
```
