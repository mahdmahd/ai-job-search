---
name: vacancyedu-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to search academic jobs worldwide —
  PhD positions, PhD candidate openings, postdoctoral researcher / fellowship
  roles, faculty and assistant/associate/full professor openings, lecturer and
  university jobs — on vacancyedu.com, a global English-language academic job
  board. Invoke even when the portal is not named explicitly: "academic jobs",
  "postdoc positions", "PhD vacancies", "faculty openings", "university jobs",
  "research positions", "are there any PhDs in <country>", "look up this
  academic posting". Locations are embedded in keywords — include the country
  or city in the query (e.g. "postdoc Netherlands", "PhD candidate Canada").
context: fork
enabled: true
allowed-tools: Bash(bun run .agents/skills/vacancyedu-search/cli/src/cli.ts *)
---

# VacancyEdu Search Skill

Search live academic job listings from VacancyEdu.com — a **global,
English-language** board covering PhD positions, postdoctoral fellowships,
and faculty openings at universities worldwide. No authentication, no API key,
and **zero runtime dependencies** — it runs with just `bun`, against the
site's public WordPress REST API.

## ⚠️ Personal use only

`robots.txt` allows the API and detail paths and no login is required, but
this is a personal job-search tool: **keep volume low** (a handful of requests
per session), don't use it commercially or for bulk data collection, and run
it on your own responsibility.

## When to use this skill

- Search academic openings by role/field keyword (PhD, postdoc, faculty)
- Narrow by country/city via the keyword (e.g. `"postdoc Netherlands"`)
- Filter by posting age (last N days)
- Get the full description, deadline(s), and apply link(s) of a specific posting

## Commands

### Search job listings

```bash
bun run .agents/skills/vacancyedu-search/cli/src/cli.ts search --query "<keywords>" [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — keyword search. **Required.** Include the
  country or city in the query to narrow by location.
- `--jobage <days>` — posted within N days (maps to the WP REST `after=` param).
  Omit for all postings.
- `--page <n>` — page number (1-indexed, 100 results per page from the API).
- `--limit <n>` / `-n <n>` — cap results emitted (client-side, after the page fetch).
- `--format json|table|plain` — default `json`.

> **No server-side location filter.** VacancyEdu has **no** `location`
> parameter. Institution and country live only in the post title
> (`"... at <Institution>, <Country>"`); the CLI parses them out for you, but
> you must put the place in `--query` yourself (e.g. `-q "postdoc Netherlands"`
> or `-q "PhD candidate Germany"`). A `--location` flag is deliberately not
> offered — it would be silently ignored, which is worse than an error.

### Fetch full job detail

```bash
bun run .agents/skills/vacancyedu-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the post ID from `search` results (e.g. `17395`). You may also pass a
full VacancyEdu permalink (`https://vacancyedu.com/2026/10/13/<slug>/`) — the
CLI resolves the slug through the REST API. Returns the full plain-text
description, any `Deadline :` line(s), and external apply link(s). Note that
a single post often **aggregates several sub-positions**, each with its own
deadline; read the body carefully.

## Usage examples

```bash
# PhD candidate openings (anywhere), last 5 results in a table
bun run .agents/skills/vacancyedu-search/cli/src/cli.ts search -q "PhD candidate" --limit 5 --format table

# Postdoctoral researcher roles in the Netherlands
bun run .agents/skills/vacancyedu-search/cli/src/cli.ts search -q "postdoctoral researcher Netherlands" --format table

# Postdoc positions in Germany, posted in the last 30 days
bun run .agents/skills/vacancyedu-search/cli/src/cli.ts search -q "postdoc Germany" --jobage 30 --format table

# Assistant professor roles in Canada
bun run .agents/skills/vacancyedu-search/cli/src/cli.ts search -q "assistant professor Canada" --format table

# Scan a broader page of results as plain text
bun run .agents/skills/vacancyedu-search/cli/src/cli.ts search -q "PhD candidate Canada" --page 2 --format plain

# Full details (description, deadlines, apply links) for one posting
bun run .agents/skills/vacancyedu-search/cli/src/cli.ts detail 17395 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing IDs to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

JSON shape: `{ "meta": { "count": <X-WP-Total>, "page": <n> }, "results": [ … ] }`
with every key (`id`, `title`, `company`, `location`, `date`, `url`) always
present — missing values are `null`, never omitted. `count` is the portal's
`X-WP-Total` (total matches for the query), not the length of this page.

All errors are written to **stderr** as `{ "error": "...", "code": "..." }`
and the process exits with code `1`.

## Notes (portal quirks)

- **Location is title-carried.** There is no server-side location filter;
  `company`/`location` are parsed from the `"... at <Institution>, <Country>"`
  title pattern. Titles without that pattern yield `null` for both.
- **Posts often aggregate multiple sub-positions** in one body (e.g.
  "Postdoctoral Fellowship (05)" listing 5 roles). One `detail` call can
  surface several deadlines and apply links.
- **`excerpt.rendered` is always empty** on this board — the CLI uses
  `title` for search results and `content.rendered` for detail only.
- **REST dates have no timezone offset** (e.g. `2026-10-13T13:07:49`).
  Treat them as the site's local posting time.
- **No employment-type field** exists in the API; employment type, if any,
  is free text inside the body.
- The CLI retries 429/5xx with exponential backoff. Keep volume low (see the
  personal-use note above). Post IDs are small integers (e.g. `17395`).
