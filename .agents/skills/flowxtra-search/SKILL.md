---
name: flowxtra-search
version: 1.0.0
description: >
  Use this skill to search live job listings across every company hosted on the
  Flowxtra ATS platform (flowxtra.com) via its public cross-tenant API, or to
  look up a specific Flowxtra posting. One skill covers the whole platform —
  many companies, many countries (Europe-leaning: Spain, Germany, Austria,
  Tunisia, and more), all roles — with real server-side search. Trigger
  phrases: search Flowxtra jobs, Flowxtra vacancies, jobs on Flowxtra, find
  jobs on the Flowxtra platform, look up this Flowxtra posting, evaluate this
  flowxtra.com/apply link, Flowxtra Stellenangebote, ofertas en Flowxtra,
  وظائف فلو اكسترا.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/flowxtra-search/cli/src/cli.ts *)
---

# Flowxtra Search Skill

Search live job listings from **[Flowxtra](https://flowxtra.com)** — a
multi-tenant ATS whose public central API lists postings from every company
hosted on the platform in one board-wide feed. No authentication, no API key,
and **zero runtime dependencies** — it runs with just `bun`.

> Like `freehire-search`, this queries a public JSON API (no HTML parsing), so
> results are structured. Unlike freehire, narrowing is **server-side free
> text** (`--query`, `--location`, `--company`) plus one exact facet
> (`--workplace`), not controlled vocabularies.

## ℹ️ First-party skill — no ToS concern

This skill is maintained by Flowxtra itself: the API is public by design and
automated read access is explicitly sanctioned by the operator, so no
personal-use warning applies. Reads are search + detail only — the skill never
submits applications (applying happens through the apply URL each result
carries, reviewed by you).

## When to use this skill

- Search openings across all companies on Flowxtra by keyword, location,
  company, or workplace type
- Get the full description of a specific posting by its id or any
  `flowxtra.com/apply/...` / company career-page URL
- Feed `/scrape` with an additional structured source

## Commands

### Search job listings

```bash
bun run .agents/skills/flowxtra-search/cli/src/cli.ts search [-q "<keywords>"] [flags]
```

Key flags:

- `--query <text>` / `-q <text>` — job-title keywords (server-side). Optional.
- `--location <text>` / `-l <text>` — company city, state, or country
  (server-side), e.g. `"Spain"` or `"Barcelona"`.
- `--workplace <type>` — exact facet: `On-site` | `Hybrid` | `Remote`.
- `--company <text>` — company-name search (server-side).
- `--jobage <days>` — posted within N days. **Client-side**: the API has no
  posting-age parameter, so this filters the returned page on its posting
  date; `meta.total` stays the server's unfiltered count.
- `--page <n>` — 1-indexed page. Default 1.
- `--limit <n>` / `-n <n>` — results per page (server-side). Default 25.
- `--format json|table|plain` — default `json`.

### Fetch full job detail

```bash
bun run .agents/skills/flowxtra-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the `id` from a `search` result (e.g. `M88PB`). You may also pass a
full apply URL (`https://flowxtra.com/apply/<id>`, with or without a locale
segment) or a company career-page URL
(`https://<company>.<career-domain>/job/<slug>/<id>`). Returns the full
(HTML-stripped) description, company name and website, office location,
seniority, employment types, salary, and the company's own career-page apply
URL.

## Usage examples

```bash
# Sales roles, table view
bun run .agents/skills/flowxtra-search/cli/src/cli.ts search -q "sales" --limit 10 --format table

# Engineering roles in Spain
bun run .agents/skills/flowxtra-search/cli/src/cli.ts search -q "engineer" -l Spain --format table

# Remote roles posted in the last 14 days
bun run .agents/skills/flowxtra-search/cli/src/cli.ts search --workplace Remote --jobage 14 --format table

# Everything a specific company has open
bun run .agents/skills/flowxtra-search/cli/src/cli.ts search --company Arogreen --format table

# Full details for a specific job (id or URL both work)
bun run .agents/skills/flowxtra-search/cli/src/cli.ts detail M88PB --format plain
bun run .agents/skills/flowxtra-search/cli/src/cli.ts detail "https://flowxtra.com/apply/M88PB" --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing a result's `id` to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

Search JSON is `{ "meta": { "count", "page", "total", "last_page" }, "results": [...] }`;
each result carries at least `id`, `title`, `company`, `location`, `date`, and
`url` (missing values are `null`), plus `workplace` and `salary` as a permitted
superset. All errors are written to **stderr** as
`{ "error": "...", "code": "..." }` and the process exits with code `1`.

## Notes

- The server hardcodes the visibility window: live, admin-approved postings
  shared within the last 90 days and not expired. There is no status flag.
- `date` comes from the list only — the detail endpoint serializes the posting
  date as null (upstream quirk), so `detail` output has `date: null`.
- Search results carry a `https://flowxtra.com/apply/<id>` URL; `detail`
  returns the company's own career-page URL for the same posting. Both open
  the same application.
- The upstream API also exposes an `employment_type` parameter, but it is a
  live no-op (returns zero rows for every value), so this skill does not offer
  it; employment types are visible in `detail` output instead.
- The API retries 429/5xx with exponential backoff; an unreachable API exits
  non-zero with a clear message.
- Platform-wide syndication feeds also exist (`https://flowxtra.com/feed` hub:
  jobs.xml / feed.xml / atom.xml / feed.json) — this skill uses the richer
  JSON API instead, but the feeds are handy for feed-reader workflows.
