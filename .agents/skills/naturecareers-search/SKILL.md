---
name: naturecareers-search
version: 1.0.0
description: >
  Search live job listings on Nature Careers (nature.com/naturecareers) — the
  global science/academic and industry research job board, English-language
  postings worldwide. Use for research jobs, university and institute roles,
  and industry R&D positions. Trigger phrases: Nature jobs, academic research
  jobs, science jobs, postdoc, PhD candidate, "find a job on Nature Careers",
  "search Nature Careers for X", look up this Nature Careers posting.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/naturecareers-search/cli/src/cli.ts *)
---

# Nature Careers Search Skill

Search live job listings from **Nature Careers** (https://www.nature.com/naturecareers/)
— a global, English-language board for science/academic research jobs (postdocs,
PhD positions, faculty, research staff) and industry research roles. No
authentication, no API key, and **zero runtime dependencies** — it runs with just `bun`.

## ⚠️ Keep volume low

This reads Nature's public job pages. robots.txt allows the search and detail
paths this CLI uses, but keep requests polite and low-volume anyway: personal
use only, no bulk crawling or commercial redistribution. The CLI retries 429/5xx
with exponential backoff and sends an honest `naturecareers-cli` User-Agent —
never a named AI crawler (those are blocked site-wide).

## When to use this skill

- Find postdocs, PhD-candidate roles, research staff and faculty openings
- Find industry research jobs (biotech, pharma, data science in research orgs)
- Get the full description, deadline and employment type of a specific posting

## Commands

### Search job listings

```bash
bun run .agents/skills/naturecareers-search/cli/src/cli.ts search --query "<keywords>" [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — **required.** Keywords (title, skill, role).
  Put the city in the query — e.g. `-q "postdoc London"` — because the clean
  search path has **no server-side location parameter**.
- `--page <n>` — page number (1-indexed, 20 results per page).
- `--limit <n>` / `-n <n>` — cap total results emitted (client-side).
- `--sort <order>` — `relevance` (default) or `date`.
- `--format json|table|plain` — default `json`.

**Location filtering is unsupported**: there is no `--location` flag (it is
rejected as unknown). Location appears per-result in each row; combine it with
keywords as shown in the examples.

**Posting-age filtering is unsupported**: there is no `--jobage` flag. Each
result carries the portal's relative age text (e.g. `"19 days ago"`), never an
invented absolute date.

### Fetch full job detail

```bash
bun run .agents/skills/naturecareers-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the numeric job ID from `search` results (e.g. `12864992`). You may also
pass a full Nature Careers job URL (`https://www.nature.com/naturecareers/job/{id}/{slug}/`).
Detail data comes from the page's **JSON-LD `JobPosting`** block: title, posting
date, `validThrough` deadline, organization, location, employment type, and the
full description (HTML stripped to readable text). The apply link is included.

## Usage examples

```bash
# PhD candidate roles anywhere, first 5 as a table
bun run .agents/skills/naturecareers-search/cli/src/cli.ts search -q "PhD candidate" --limit 5 --format table

# Postdoctoral researcher roles in London, newest first
bun run .agents/skills/naturecareers-search/cli/src/cli.ts search -q "postdoctoral researcher London" --sort date --format table

# Computational biology roles in Boston
bun run .agents/skills/naturecareers-search/cli/src/cli.ts search -q "computational biology Boston" --format table

# Remote-friendly research keywords, page 2, JSON for tooling
bun run .agents/skills/naturecareers-search/cli/src/cli.ts search -q "machine learning Remote" --page 2 --format json

# Full detail for a specific posting
bun run .agents/skills/naturecareers-search/cli/src/cli.ts detail 12864992 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing IDs to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

JSON search output:

```json
{ "meta": { "count": 159, "page": 1 }, "results": [ { "id": "...", "title": "...", "company": "...", "location": "...", "date": "...", "url": "...", "salary": null, "snippet": "..." } ] }
```

Keys are always present; missing values are `null`, never omitted. `meta.count`
is the total matching postings when the page embeds a count signal, otherwise
the length of the current page. `date` is the portal's relative age text
(`"19 days ago"`), not an absolute date.

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and
the process exits with code `1`.

## Notes

- **href whitespace quirk:** list-anchor `href` values contain stray
  newlines/spaces; the CLI trims them before use and resolves them against
  `https://www.nature.com`.
- **countrycode injection:** the server may inject `countrycode` (e.g. `GB`)
  into its own links based on your IP. The CLI never sends it, so searches stay
  global.
- **empty ad cards:** `ul#listing` contains interspersed empty `<li>` items;
  parsing is chunk-based and skips malformed cards instead of crashing.
- **JSON-LD is the detail source:** `script[type="application/ld+json"]` with
  `@type: JobPosting` (there may be several ld+json scripts — the CLI picks the
  JobPosting one). `employmentType` sometimes arrives as a JSON-encoded string
  (`'["FULL_TIME"]'`); the CLI normalizes it.
- **robots paths:** never request `/naturecareers/jobs/search` (disallowed) or
  `/naturecareers/jobsrss/` (disallowed). The CLI only uses
  `/naturecareers/searchjobs/` and `/naturecareers/job/{id}/`, both allowed.
  Never put AI crawler product names (`ClaudeBot`, `GPTBot`, `anthropic-ai`, …)
  in the User-Agent — robots.txt disallows them site-wide.
