---
name: chroniclejobs-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to search jobs on Chronicle of Higher
  Education Jobs (jobs.chronicle.com) — the leading US (and global) higher-ed
  job board covering faculty, postdoc, research, and academic-administration
  positions, in English. Invoke for professor / lecturer / dean / provost /
  department-chair openings, postdoctoral fellowships, research-staff and
  student-affairs roles, or to look up a specific Chronicle posting. Trigger
  phrases: "chronicle jobs", "chronicle higher education", "faculty jobs",
  "higher ed administration jobs", "academe jobs", "postdoc openings",
  "professor search", "dean position", "university administration jobs",
  "look up this Chronicle posting".
context: fork
allowed-tools: Bash(bun run .agents/skills/chroniclejobs-search/cli/src/cli.ts *)
---

# Chronicle of Higher Education Jobs Search Skill

Search live job listings from **Chronicle of Higher Education Jobs**
(`jobs.chronicle.com`) — the main US job board for academe, with heavy
coverage of faculty positions, postdoctoral fellowships, and higher-ed
administration, plus postings from institutions worldwide. No authentication,
no API key, and **zero runtime dependencies** — it runs with just `bun`,
against the site's public HTML pages.

**The Chronicle news paywall is irrelevant here**: only the news-article site
(chronicle.com) is paywalled; the jobs subdomain is free to read, and the
officially listed jobs pages are what this skill fetches.

## Personal use, low volume

`robots.txt` allows the search and job paths (it disallows only email/preview/
analytics routes), and no login is required. This is still a personal job-search
tool: **keep volume low** — a handful of requests per session, not a crawl —
don't use it commercially or for bulk data collection, and run it on your own
responsibility.

## When to use this skill

- Search faculty, postdoc, or higher-ed administration openings by keyword
- Pull the full description, posted/closing dates, salary, and external apply
  link for one posting
- Page through a broad query (20 results per page)

## Commands

### Search job listings

```bash
bun run .agents/skills/chroniclejobs-search/cli/src/cli.ts search --query "<keywords>" [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — **required.** Keywords (title, role, field).
  There is no `--location` flag — include a place in the query if you need one
  (e.g. `-q "professor economics Texas"`).
- `--page <n>` — page number (1-indexed, 20 results per page).
- `--limit <n>` / `-n <n>` — cap total results emitted (client-side).
- `--format json|table|plain` — default `json`.

There is **no `--jobage` flag**: the portal exposes no posting-age filter, and
search cards carry no date. Unsupported flags are rejected with an
`UNKNOWN_FLAG` error, never silently discarded.

### Fetch full job detail

```bash
bun run .agents/skills/chroniclejobs-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the numeric job ID from `search` results (e.g. `38047649`). You may also
pass a full `jobs.chronicle.com/job/...` URL. Returns the description (from the
page's JSON-LD `JobPosting`), posted date, closing date (`validThrough`),
employment type, salary (when published), and the apply link — which points at
an external ATS.

## Usage examples

```bash
# PhD-level positions
bun run .agents/skills/chroniclejobs-search/cli/src/cli.ts search -q "PhD candidate" --limit 5 --format table

# Academic leadership roles
bun run .agents/skills/chroniclejobs-search/cli/src/cli.ts search -q "dean of students" --format table

# Postdoctoral fellowships, page 2
bun run .agents/skills/chroniclejobs-search/cli/src/cli.ts search -q "postdoctoral fellow" --page 2 --format json

# Faculty search in a field, capped at 10
bun run .agents/skills/chroniclejobs-search/cli/src/cli.ts search -q "assistant professor economics" --limit 10 --format table

# Full details for one posting (id from search results)
bun run .agents/skills/chroniclejobs-search/cli/src/cli.ts detail 38047649 --format plain

# Full details from a job URL
bun run .agents/skills/chroniclejobs-search/cli/src/cli.ts detail "https://jobs.chronicle.com/job/38047649/some-slug/" --format json
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing IDs to `detail` |
| `table` | Quick human-readable scanning (ID, title, company, location, salary) |
| `plain` | Reading a single job's full detail (`detail` command) |

Each JSON search result has: `id`, `title`, `company`, `location`, `date`,
`url`, `salary`, `snippet`. Missing values are `null`, never omitted. The
envelope is `{ "meta": { "count", "page" }, "results": [...] }`. `date` is
always `null` on search cards (the board exposes no date anchor there) — take
the posting date from `detail`, whose JSON result carries `date` (the JSON-LD
`datePosted`) plus `validThrough`, `employmentType`, `description`,
`applyUrl`.

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and
the process exits with code `1`.

## Notes

- **Platform: Madgex** — the same job-board software behind
  nature.com/naturecareers and careers.insidehighered.com. If the portal's
  markup changes, the parsing anchors live in `url-reference.md` and the
  Madgex conventions (lister classes, JSON-LD detail, `/apply/<id>/...` links)
  will likely change in step on those sister boards.
- **href whitespace quirk**: Madgex emits search-card hrefs with stray
  whitespace/newlines inside the quoted value
  (`href=" \n\t/job/<id>/<slug>/ "`) and appends tracking query strings
  (`?LinkSource=PromotedJob`); the CLI trims and strips them. Keep this in
  mind if you parse the pages yourself.
- Search-card `date` is always `null` — posting dates live only in the detail
  page's JSON-LD (`datePosted` / `validThrough`).
- Promoted/sponsored cards, empty ad slots, and similar-jobs mini-listers are
  skipped; each result card is parsed independently so one malformed card
  cannot break the rest.
- The apply button links to an external ATS (Interfolio, Workday, etc.) via
  `/apply/<id>/<slug>?LinkSource=JobDetails`; `applyUrl` gives that link, not
  an on-site application form.
- The Chronicle **news** paywall (chronicle.com articles) does not apply to the
  jobs subdomain; no credentials are used or needed.
- The site rate-limits aggressively at volume; the CLI retries 429/5xx with
  exponential backoff, but keep session volume to a handful of requests.
