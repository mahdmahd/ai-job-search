---
name: gcjobs-search
version: 1.0.0
description: >
  Use this skill to search federal public service jobs with the Government of
  Canada on GC Jobs / Emplois GC (emploisfp-psjobs.cfp-psc.gc.ca), the Public
  Service Commission's recruitment site. Covers advertisements open to the public
  across every federal department and agency — Statistics Canada, CRA, Health
  Canada, Parks Canada, RCMP, Global Affairs, Bank of Canada, Employment and
  Social Development Canada, Immigration Refugees and Citizenship Canada, and the
  rest. Invoke for government jobs, federal jobs, public service positions,
  departmental hiring, and postings with a language requirement (English
  essential, French essential, bilingual imperative). Trigger phrases: federal
  jobs, government of Canada jobs, GC Jobs, public service jobs, work for the
  federal government, jobs.gc.ca, emplois au gouvernement du Canada, fonction
  publique fédérale, Emplois GC, postes bilingues.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/gcjobs-search/cli/src/cli.ts *)
---

# GC Jobs Search Skill

Search live federal public service advertisements from **GC Jobs / Emplois GC**
(`emploisfp-psjobs.cfp-psc.gc.ca`), run by the Public Service Commission of Canada.

Only jobs **open to the public** are covered — the internal-to-government inventory
requires a login and is deliberately out of scope. No authentication, no API key,
**zero runtime dependencies**.

Federal postings barely overlap with `jobbank-ca-search`: they use their own
classification system (`EC-05`, `AS-02`, `IT-03`), publish exact salary ranges, and
state a language requirement and a "who can apply" residency rule that no commercial
board records.

## How searching works here (read this before using it)

GC Jobs has no queryable API, and its criteria search **cannot be replayed over plain
HTTP** — the server answers `500` to a scripted criteria submission. So this CLI:

1. opens a session the way the site's own JavaScript does,
2. sweeps the full public listing (roughly **400 postings across 20 pages**),
3. filters **client-side** on title, location, organization, and language requirement.

Consequences worth knowing:

- A full search takes **~30 seconds**. That is the sweep, not a hang.
- `--max-pages` trades coverage for speed. When a sweep stops early, `meta.truncated`
  is `true` and `table`/`plain` print a note to stderr — **do not report a truncated
  search as "no such jobs exist"**.
- Filtering matches the **listing** fields, so `--query` matches job titles, not
  full posting text.

## When to use this skill

- Find federal government openings by title, city/province, or department
- Filter by language requirement (English essential, French essential, bilingual)
- Read the full poster: duties, essential qualifications, conditions of employment,
  classification level, salary range, and the selection process number

## Commands

### Search advertisements

```bash
bun run .agents/skills/gcjobs-search/cli/src/cli.ts search [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — match the job title. Every term must appear. Accent-insensitive.
- `--location <text>` / `-l <text>` — match the location, e.g. `Ottawa`, `Ontario`, `"British Columbia"`.
- `--org <text>` / `-o <text>` — match the hiring organization, e.g. `"Parks Canada"`.
- `--lang-req <text>` — match the language requirement, e.g. `"English essential"`, `Bilingual`.
- `--page <n>` — page over the filtered results (20 per page).
- `--limit <n>` / `-n <n>` — cap results emitted.
- `--max-pages <n>` — listing pages to sweep. Default `20` (all).
- `--lang en|fr` — interface language. Default `en`.
- `--format json|table|plain` — default `json`.

With no filters it returns the whole public listing, newest closing dates first.

### Fetch full poster detail

```bash
bun run .agents/skills/gcjobs-search/cli/src/cli.ts detail <id|url> [--lang en|fr] [--format json|plain]
```

`id` is the poster id from `search` results (e.g. `2445986`), or a full poster URL.

Some federal jobs are advertised on the hiring organization's own site. For those,
GC Jobs serves a redirect notice rather than a poster; `detail` returns
`hostedExternally: true` and the real `externalUrl` instead of failing.

## Usage examples

```bash
# Analyst roles in Ottawa
bun run .agents/skills/gcjobs-search/cli/src/cli.ts search -q analyst -l Ottawa --format table

# Everything Parks Canada has open right now
bun run .agents/skills/gcjobs-search/cli/src/cli.ts search -o "Parks Canada" --format table

# Bilingual positions anywhere in Quebec
bun run .agents/skills/gcjobs-search/cli/src/cli.ts search -l "Québec" --lang-req Bilingual --format table

# Unilingual-English roles in BC, quick partial sweep
bun run .agents/skills/gcjobs-search/cli/src/cli.ts search -l "British Columbia" --lang-req "English essential" --max-pages 6 --format table

# Full poster
bun run .agents/skills/gcjobs-search/cli/src/cli.ts detail 2445986 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing IDs to `detail`, reading `meta.truncated` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single poster (`detail` command) |

Search JSON follows the repo's portal contract, with GC-Jobs-specific `meta` keys:

```json
{
  "meta": { "count": 3, "page": 1, "pageSize": 20, "totalResults": 3,
            "totalOpenPostings": 395, "listingPagesSwept": 5,
            "listingPagesAvailable": 20, "truncated": true,
            "lang": "en", "source": "emploisfp-psjobs.cfp-psc.gc.ca" },
  "results": [ { "id": "...", "title": "...", "company": "...", "location": "...",
                 "date": "...", "url": "...", "closingDate": "...",
                 "salary": null, "languageRequirement": "..." } ]
}
```

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the
process exits with code `1`.

## Notes

- **`date` holds the closing date.** GC Jobs advertises when a process closes, not when
  it opened, so the contract `date` field mirrors `closingDate` rather than inventing a
  posting date.
- Salary is a published range tied to the classification (`$151,272 to $185,702`), not
  an employer estimate — federal pay is set by collective agreement.
- `whoCanApply` on the detail record carries the residency/citizenship rule. Read it:
  many processes are restricted to people residing in Canada, or to a geographic radius.
- Language requirement values are a closed set: `English essential`, `French essential`,
  `English or French essential`, `Bilingual - imperative`, `Bilingual - non-imperative`,
  `Various language requirements`.
- The site publishes **no robots.txt**. The CLI still paces itself (1 s between requests)
  and holds a single session per invocation.
- Postings close on their closing date and then disappear; `detail` on a closed id exits
  `1` with code `NOT_FOUND`.
