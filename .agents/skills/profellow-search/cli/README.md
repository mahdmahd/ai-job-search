# profellow-cli

CLI for searching fellowships and PhD funding on ProFellow.com — a **global,
English-language** fellowships and funding board (US-heavy).

**Data source**: ProFellow's public WordPress pages — the structured
`/open-calls/` archive (the WP `?s=` endpoint is CleanTalk-blocked, so keyword
matching is client-side over the fetched page).
**Authentication**: None required.
**Dependencies**: None (plain `bun` + `fetch`). `bun install` is optional and
only pulls dev type defs.

> **Personal use only.** `robots.txt` allows the listing paths and no login is
> required, but keep volume low, don't use it commercially or for bulk data
> collection, and run it on your own responsibility.

## Installation

```bash
cd .agents/skills/profellow-search/cli
bun install   # optional — only installs TypeScript dev types
```

The CLI runs without any install because it has zero runtime dependencies.

## Commands

| Command | Description |
|---------|-------------|
| `search` | Search open fellowship calls (`--query` required, client-side filter) |
| `detail` | Fetch full detail for a single call (slug or URL) |

`search` accepts `--format json|table|plain` (default `json`); `detail`
accepts `--format json|plain`.
All errors are written to **stderr** as `{ "error": "...", "code": "..." }`
with exit code `1`.

## Quick examples

```bash
# PhD-relevant funding, last 5 in a table
bun run src/cli.ts search -q "PhD candidate" --limit 5 --format table

# Postdoctoral fellowships
bun run src/cli.ts search -q "postdoctoral fellowship" --format table

# Second archive page for research funding
bun run src/cli.ts search -q "research" --page 2 --format table

# Full detail for one call (description, eligibility, apply link)
bun run src/cli.ts detail 2027-princeton-in-asia --format plain
```

See `../SKILL.md` for the full flag reference and the personal-use note.

## Search flags

| Flag | Alias | Description |
|------|-------|-------------|
| `--query` | `-q` | Keywords. **Required.** Matched client-side against the fetched archive page (all words must appear in title/excerpt/eligibility). Put the country in the query. |
| `--page` | | 1-indexed archive page (~15 open calls/page). |
| `--limit` | `-n` | Cap results emitted (client-side, after filtering). |
| `--format` | | `json` \| `table` \| `plain`. |

JSON shape: `{ "meta": { "count": <matches on this page>, "page": <n> }, "results": [ … ] }`.
Every result key (`id`, `title`, `company`, `location`, `date`, `url`) is
always present; missing values are `null`. `id` is the call slug; `location`
is always `null`; `date` is the deadline prose.
