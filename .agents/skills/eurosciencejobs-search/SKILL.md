---
name: eurosciencejobs-search
version: 1.0.0
description: >
  Search European science jobs, postdoc positions in Europe, and research jobs
  across Europe on EuroScienceJobs — postdocs, PhD positions, group leaders,
  and research scientist roles (life sciences, physics, chemistry, data).
  Trigger phrases: "european science jobs", "postdoc Europe", "research jobs
  Europe", "postdoc positions", "science jobs Europe", "PhD positions Europe".
context: fork
allowed-tools: Bash(bun run skills/eurosciencejobs-search/cli/src/cli.ts *)
---

# EuroScienceJobs Search Skill

Search live European science job listings from **EuroScienceJobs.com** — postdocs,
PhD positions, research scientists, group leaders, and faculty roles across Europe.
No authentication, no API key, and **zero runtime dependencies** — it runs with
just `bun`. English-language postings.

## When to use this skill

- Search for postdoc / PhD / research roles in a European country or city
- Find science jobs by keyword (field, technique, organism, instrument)
- Get the full description and deadline of a specific posting

## Commands

### Search job listings

```bash
bun run skills/eurosciencejobs-search/cli/src/cli.ts search --query "<text>" [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — **required.** Keywords (role, field, technique), e.g. `"postdoc"`, `"PhD candidate"`, `"cryo-EM"`.
- `--location <text>` / `-l <text>` — location filter, e.g. `"Berlin"`, `"Paris"`. Optional.
- `--jobage <days>` — posted within N days (client-side filter on the relative "Posted N days ago" label). Omit for all postings.
- `--page <n>` — page number (1-indexed, client-side slice of 20). Default 1.
- `--limit <n>` / `-n <n>` — cap total results emitted (client-side).
- `--format json|table|plain` — default `json`.

### Fetch full job detail

```bash
bun run skills/eurosciencejobs-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the numeric job ID from `search` results (e.g. `297575`). You may also
pass a full `job_display/...` URL. Returns the full description, deadline,
salary (when listed), and active/closed status.

## Usage examples

```bash
# Postdoc roles across Europe
bun run skills/eurosciencejobs-search/cli/src/cli.ts search -q "postdoc" --format table

# PhD positions in Berlin
bun run skills/eurosciencejobs-search/cli/src/cli.ts search -q "PhD candidate" -l "Berlin" --limit 5 --format table

# Structural biology postdocs, recent postings
bun run skills/eurosciencejobs-search/cli/src/cli.ts search -q "cryo-EM" --jobage 30 --format table

# Computational postdocs in Switzerland
bun run skills/eurosciencejobs-search/cli/src/cli.ts search -q "postdoc machine learning" -l "Switzerland" --format table

# Neuroscience PhD roles in the Netherlands
bun run skills/eurosciencejobs-search/cli/src/cli.ts search -q "PhD neuroscience" -l "Netherlands" --format table

# Full details for a specific posting
bun run skills/eurosciencejobs-search/cli/src/cli.ts detail 297575 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing IDs to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading listings or a single job's full detail (`detail` command) |

Each search result has `id`, `title`, `company`, `location`, `date`, `url`
(missing values are `null`, never omitted). All errors are written to
**stderr** as `{ "error": "...", "code": "..." }` and the process exits with
code `1`.

## Notes

- **Low-volume site** — search stays on the `www` host (`www2` returns 403 for
  search). Keep request volume low; the CLI retries 429/5xx with exponential
  backoff.
- Honest `User-Agent` names the tool (`eurosciencejobs-cli/1.0`); the site's
  robots.txt explicitly disallows AI-crawler product names (ClaudeBot, GPTBot,
  …), which are never used.
- Search is a GET with no CSRF involvement. The query-string form
  (`?keyword=`) returns an unfiltered page — the CLI uses the site's own
  path-based form `/job_search/keyword/<term>/keyword_location/<term>`.
- No server-side pagination or posting-age filter exists; `--page` and
  `--jobage` are applied client-side.
- Job IDs are numeric (e.g. `297575`) — pass them as-is to `detail`.
