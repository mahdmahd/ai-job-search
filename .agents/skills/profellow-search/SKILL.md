---
name: profellow-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to search fellowships, PhD funding,
  graduate fellowships, postdoctoral fellowships, or scholarships — on
  profellow.com, a global English-language fellowships and funding board (US
  heavy). Invoke even when the portal is not named explicitly: "fellowship
  search", "PhD funding", "graduate fellowships", "postdoctoral fellowships",
  "scholarships", "funded PhD", "are there any fellowships for <field>",
  "look up this fellowship posting". Pass keywords with --query; locations go
  in the query itself (e.g. "fellowship Germany").
context: fork
enabled: true
allowed-tools: Bash(bun run .agents/skills/profellow-search/cli/src/cli.ts *)
---

# ProFellow Search Skill

Search live fellowship and PhD-funding listings from ProFellow.com — a
**global, English-language** board (US-heavy) of open calls: fellowships,
graduate funding, postdoctoral fellowships, and scholarships. No
authentication, no API key, and **zero runtime dependencies** — it runs with
just `bun`, against the site's public WordPress pages.

## ⚠️ Personal use only

`robots.txt` allows the listing and detail paths and no login is required, but
this is a personal search tool: **keep volume low** (a handful of requests
per session), don't use it commercially or for bulk data collection, and run
it on your own responsibility. The WP `?s=` search endpoint is
CleanTalk-blocked, so the CLI reads the structured `/open-calls/` archive
instead — one lightweight page fetch per search.

## When to use this skill

- Search fellowships by keyword (field, "PhD", "postdoctoral", "graduate")
- Narrow by country by putting it in the keyword (e.g. `"fellowship Germany"`)
- Check application deadlines (cards and detail both carry deadline prose)
- Get the full description, eligibility section, and apply link(s) of one call

## Scope

This skill covers **fellowships and open funding calls**, not traditional
employment — ProFellow is a funding board, not a job board. For salaried
research jobs use the academic job skills instead. Listings are low-volume
(one structured archive page holds ~15 open calls; paginate with `--page`).

## Commands

### Search open calls

```bash
bun run .agents/skills/profellow-search/cli/src/cli.ts search --query "<keywords>" [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — keyword search. **Required.** Matched
  **client-side** against the fetched archive page's titles, excerpts, and
  eligibility text (all query words must appear). Put the country in the
  query to narrow by place (there is no server-side location filter).
- `--page <n>` — archive page (1-indexed, ~15 open calls/page). Default 1.
  Filtering happens per page, so a narrow query on a later page can return
  zero rows — broaden `-q` or scan more pages.
- `--limit <n>` / `-n <n>` — cap results emitted (client-side, after filtering).
- `--format json|table|plain` — default `json`.

> **No `--jobage`.** Cards carry no posting date — only an application
> deadline — so a freshness filter would be silently meaningless and is
> deliberately not offered. No `--location` either: location is not a
> first-class card field (cards routinely cover multiple countries or none);
> put the place in `--query`.

### Fetch full call detail

```bash
bun run .agents/skills/profellow-search/cli/src/cli.ts detail <slug|url> [--format json|plain]
```

`id` is the slug from `search` results (e.g.
`apply-now-2027-fellowships-at-auschwitz-for-the-study-of-professional-ethics`).
You may also pass a full `https://www.profellow.com/open-call/<slug>/` URL.
Returns the full plain-text description, the Eligibility section, the
deadline, and external apply link(s).

## Usage examples

```bash
# PhD-relevant funding, last 5 in a table
bun run .agents/skills/profellow-search/cli/src/cli.ts search -q "PhD candidate" --limit 5 --format table

# Postdoctoral fellowships
bun run .agents/skills/profellow-search/cli/src/cli.ts search -q "postdoctoral fellowship" --format table

# Graduate fellowships mentioning Germany
bun run .agents/skills/profellow-search/cli/src/cli.ts search -q "graduate fellowship Germany" --format table

# Scan the second archive page for research funding
bun run .agents/skills/profellow-search/cli/src/cli.ts search -q "research" --page 2 --format table

# Scholarships as plain text
bun run .agents/skills/profellow-search/cli/src/cli.ts search -q "scholarship" --format plain

# Full details (description, eligibility, apply link) for one call
bun run .agents/skills/profellow-search/cli/src/cli.ts detail apply-now-2027-fellowships-at-auschwitz-for-the-study-of-professional-ethics --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing slugs to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading search hits or a single call's full detail (`detail` command) |

JSON shape: `{ "meta": { "count": <matches on this page>, "page": <n> }, "results": [ … ] }`
with every key (`id`, `title`, `company`, `location`, `date`, `url`) always
present — missing values are `null`, never omitted. `count` is the number of
cards on the fetched archive page that matched `-q`, not a portal-wide total.

All errors are written to **stderr** as `{ "error": "...", "code": "..." }`
and the process exits with code `1`.

## Notes (portal quirks)

- **Archive-first search.** The standard WP `GET /?s=<query>` returns HTTP 200
  with a 62-byte CleanTalk "Forbidden. Sender blacklisted." body (verified
  live 2026-10-13) — the search CPT coverage question is moot because the
  endpoint never answers. The CLI therefore lists `GET /open-calls/`
  (`/open-calls/page/N/` for N ≥ 2) and filters client-side.
- **IDs are slugs** (e.g. `2027-princeton-in-asia`) — cards carry no numeric
  post ID. Pass them as-is to `detail`.
- **`location` is always `null`.** Cards carry no location field; many calls
  are multi-country or location-free. Put the place in `-q` — it matches
  against title/excerpt/eligibility text.
- **`company` is the `Sponsored by X` host** (featured cards only); otherwise
  `null`. It is a sponsor/host label, not an employer.
- **`date` is the application deadline prose** (e.g. `"October 30, 2026"`),
  not a posting date. Detail repeats it as `deadline`.
- Detail bodies follow Program Benefits / Eligibility / How to Apply /
  Application Deadline sections; the CLI surfaces the Eligibility section
  separately plus external `btn--primary` apply links.
- The CLI retries 429/5xx with exponential backoff. Keep volume low (see the
  personal-use note above).
