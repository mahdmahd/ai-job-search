# vacancyedu-cli

CLI for searching academic jobs (PhD, postdoc, faculty) on VacancyEdu.com —
a **global, English-language** academic job board.

**Data source**: VacancyEdu's public WordPress REST API
(`wp-json/wp/v2/posts`).
**Authentication**: None required.
**Dependencies**: None (plain `bun` + `fetch`). `bun install` is optional and
only pulls dev type defs.

> **Personal use only.** `robots.txt` allows the API paths and no login is
> required, but keep volume low, don't use it commercially or for bulk data
> collection, and run it on your own responsibility.

## Installation

```bash
cd .agents/skills/vacancyedu-search/cli
bun install   # optional — only installs TypeScript dev types
```

The CLI runs without any install because it has zero runtime dependencies.

## Commands

| Command | Description |
|---------|-------------|
| `search` | Search for academic job listings (`--query` required) |
| `detail` | Fetch full detail for a single posting |

`search` accepts `--format json|table|plain` (default `json`); `detail`
accepts `--format json|plain`.
All errors are written to **stderr** as `{ "error": "...", "code": "..." }`
with exit code `1`.

## Quick examples

```bash
# PhD candidate openings, last 5 in a table
bun run src/cli.ts search -q "PhD candidate" --limit 5 --format table

# Postdoctoral researcher roles in the Netherlands
bun run src/cli.ts search -q "postdoctoral researcher Netherlands" --format table

# Assistant professor openings in Germany, last 30 days
bun run src/cli.ts search -q "assistant professor Germany" --jobage 30 --format table

# Full detail for one posting (description, deadlines, apply links)
bun run src/cli.ts detail 17395 --format plain
```

See `../SKILL.md` for the full flag reference and the personal-use note.

## Search flags

| Flag | Alias | Description |
|------|-------|-------------|
| `--query` | `-q` | Keywords (role / field / location). **Required.** There is no server-side location filter — put the country/city in the query. |
| `--jobage` | | Posted within N days (maps to the WP REST `after=` param). |
| `--page` | | 1-indexed page (100 results/page from the API). |
| `--limit` | `-n` | Cap results emitted (client-side). |
| `--format` | | `json` \| `table` \| `plain`. |

JSON shape: `{ "meta": { "count": <X-WP-Total>, "page": <n> }, "results": [ … ] }`.
Every result key is always present; missing values are `null`.
