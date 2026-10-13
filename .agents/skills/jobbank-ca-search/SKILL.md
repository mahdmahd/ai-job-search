---
name: jobbank-ca-search
version: 1.0.0
description: >
  Use this skill to search for jobs anywhere in Canada on Job Bank
  (jobbank.gc.ca), the Government of Canada's national job board, and its French
  counterpart Guichet-Emplois (guichetemplois.gc.ca). Covers every province and
  territory and every sector — trades, healthcare, tech, retail, hospitality,
  administration, transport. Invoke for open positions, vacancies, and hiring in
  Canadian cities (Toronto, Vancouver, Montréal, Calgary, Ottawa, Edmonton,
  Winnipeg, Halifax, Québec City, Mississauga, Brampton, Hamilton, Surrey,
  Saskatoon, Regina, St. John's, Victoria, Whitehorse, Yellowknife, Iqaluit).
  Trigger phrases: Canadian jobs, jobs in Canada, Job Bank, Guichet-Emplois,
  jobs in Ontario/BC/Alberta/Quebec, find a job in Canada, job search Canada,
  emplois au Canada, offres d'emploi, recherche d'emploi, postes vacants,
  emplois disponibles, chercher un emploi.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/jobbank-ca-search/cli/src/cli.ts *)
---

# Job Bank Canada Search Skill

Search live job listings from **Job Bank** (`jobbank.gc.ca`), the Government of Canada's
national job board run by Employment and Social Development Canada, and its French
counterpart **Guichet-Emplois** (`guichetemplois.gc.ca`).

No authentication, no API key, and **zero runtime dependencies** — it runs with just `bun`.

Job Bank aggregates postings employers submit directly plus feeds from partner boards,
and it is the only board that covers every province and territory uniformly, including
the territories and rural areas that commercial boards skip.

## Access and etiquette

`jobbank.gc.ca/robots.txt` allows every path this skill touches and asks for
`Crawl-delay: 5`. The CLI **honours that delay between requests**, so a multi-page sweep
is deliberately slow — a three-page search takes about 15 seconds. Do not parallelise it.

This is public government data; there is no personal-use restriction beyond ordinary
courtesy to a public service.

## When to use this skill

- Search job openings anywhere in Canada, filtered by city, province/territory, or both
- Filter by how recently a job was posted
- Search in French against Guichet-Emplois
- Get the full description, salary, deadline, and application instructions for a posting
- Resolve an ambiguous Canadian city name (there are five Windsors)

## Commands

### Search job listings

```bash
bun run .agents/skills/jobbank-ca-search/cli/src/cli.ts search [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — keywords (job title, skill, NOC title). Recommended.
- `--location <city>` / `-l <city>` — city filter, e.g. `"Toronto"` or `"Toronto, ON"`.
  Resolved to Job Bank's internal city id automatically (see Notes).
- `--province <code>` / `-p <code>` — `AB BC MB NB NL NS NT NU ON PE QC SK YT`.
- `--jobage <days>` — posted within N days (`1` = today).
- `--page <n>` — page number (1-indexed, 25 results per page).
- `--limit <n>` / `-n <n>` — cap results emitted (client-side).
- `--sort relevance|date` — default `relevance`.
- `--lang en|fr` — English Job Bank or French Guichet-Emplois. Default `en`.
- `--format json|table|plain` — default `json`.

At least one of `--query`, `--location`, or `--province` is required.

### Fetch full job detail

```bash
bun run .agents/skills/jobbank-ca-search/cli/src/cli.ts detail <id|url> [--lang en|fr] [--format json|plain]
```

`id` is the posting id from `search` results (e.g. `49974823`); a full Job Bank or
Guichet-Emplois posting URL works too. Returns the description, salary range and unit,
work hours, employment terms, vacancies, language/education/experience requirements,
application deadline, and how-to-apply instructions.

### Resolve a city name to a city id

```bash
bun run .agents/skills/jobbank-ca-search/cli/src/cli.ts cities <name> [--format json|table|plain]
```

Useful when a city name repeats across provinces, or to confirm Job Bank's spelling
before scripting a search.

## Usage examples

```bash
# Software developer roles in Toronto
bun run .agents/skills/jobbank-ca-search/cli/src/cli.ts search -q "software developer" -l "Toronto, ON" --format table

# Registered nurse roles anywhere in BC, posted in the last week, newest first
bun run .agents/skills/jobbank-ca-search/cli/src/cli.ts search -q "registered nurse" -p BC --jobage 7 --sort date --format table

# Red seal trades in Alberta
bun run .agents/skills/jobbank-ca-search/cli/src/cli.ts search -q "journeyman electrician" -p AB --format table

# French-language search against Guichet-Emplois
bun run .agents/skills/jobbank-ca-search/cli/src/cli.ts search -q "développeur" --lang fr -l "Montréal, QC" --format table

# Which Windsor did you mean?
bun run .agents/skills/jobbank-ca-search/cli/src/cli.ts cities Windsor --format table

# Full details for one posting
bun run .agents/skills/jobbank-ca-search/cli/src/cli.ts detail 49974823 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing IDs to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

Search JSON follows the repo's portal contract:

```json
{
  "meta": { "count": 8, "page": 1, "pageSize": 25, "totalResults": 88,
            "location": "Toronto, ON", "province": null, "lang": "en",
            "source": "jobbank.gc.ca" },
  "results": [ { "id": "...", "title": "...", "company": null, "location": "...",
                 "date": "...", "url": "...", "salary": null,
                 "jobNumber": null, "workLocation": null } ]
}
```

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the
process exits with code `1`.

## Notes

- **City filtering needs an id.** Job Bank ignores a plain city name in the URL — it only
  filters when `locationparam` carries the numeric city id. `--location` performs that
  lookup for you against Job Bank's public city index. This is the single easiest thing
  to get wrong when hand-building a Job Bank URL: the page happily returns nationwide
  results while displaying your city in its heading.
- **Page size is fixed at 25.** Use `--page` to walk further; `meta.totalResults` tells
  you how many matched in total.
- `--jobage` maps to Job Bank's `fage` parameter, which counts days back from today.
- Salary is often absent on the search card but present on the detail page, split into
  `salaryMin`/`salaryMax`/`salaryUnit` (`HOUR`, `YEAR`, …) with `salaryCurrency` `CAD`.
- French postings return accented titles and French month names in `date`
  (`23 juillet 2026`) — expected, not a parsing fault.
- Job ids are numeric (e.g. `49974823`). The separate `jobNumber` field (`#3632881`) is
  Job Bank's employer-facing reference, not a valid `detail` argument.
- Postings expire; `detail` on an expired id exits `1` with code `NOT_FOUND`.
