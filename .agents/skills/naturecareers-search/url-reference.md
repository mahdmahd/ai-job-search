# Nature Careers URL Reference

Maintainer cheat-sheet for the `naturecareers-search` skill. Re-verify anchors
against live pages after any portal change — Madgex markup drifts.

Platform: Madgex jobseeker frontend, mounted at `https://www.nature.com/naturecareers/`.
Language en-GB. No credentials required for search or detail.

## Search

```
GET https://www.nature.com/naturecareers/searchjobs/?Keywords=<urlencoded>&Page=<n>
```

Query params:

| Param | Meaning | Example / notes |
|-------|---------|-----------------|
| `Keywords` | Free-text query | `postdoc`, `PhD+candidate` |
| `Page` | 1-based page number | `1`, `2`, … — **20 results per page** |
| `sort` | Sort order | `Date` (newest first). Omit for default `Relevance`. |
| `countrycode` | Country pin | **Never send.** The server may inject `countrycode=GB` (geo IP) into its own pagination/RSS links; omitting it keeps results global. |

Not used by the CLI (present in page forms, but outside the clean search path):
`LocationId`, `RadialLocation`, `CountryCode`, `Discipline`, `JobType`,
`employertype`, `SalaryBand`, `Sector`, `Qualification`, `Duration`.
There is **no** posting-age (`jobage`) parameter and **no** supported
server-side location parameter for this CLI — document both as unsupported.

Verified live (2026-10-13): `Keywords=postdoc` → 159 results.

### Count signals (meta.count)

In order of preference, both present on the results page:

1. Analytics config: `'returned\x2dresults': '159',` (literal `\x2d` escape).
   Also present: `'total\x2djob\x2dcount'` (board-wide total — do NOT use),
   `'page\x2dnumber'`.
2. Meta description: `<meta name="description" content="159 jobs using the term 'postdoc' …">`.

If neither parses, the CLI falls back to `results.length` of the current page
(that is `meta.count`'s documented fallback in SKILL.md).

### List anchors

```html
<ul id="listing" class="lister cf block">
  <li class="lister__item cf ..." id="item-{numeric_id}">
    <h3 class="lister__header">
      <a href=" \n\t/naturecareers/job/{id}/{slug}/?LinkSource=..." class="js-clickable-area-link">
        <span>Title</span>
      </a>
    </h3>
    <ul class="lister__meta">
      <li class="lister__meta-item lister__meta-item--location">Milan (IT)</li>
      <li class="lister__meta-item lister__meta-item--salary">…</li>   <!-- optional -->
      <li class="lister__meta-item lister__meta-item--recruiter">Human Technopole</li>
    </ul>
    <p class="lister__description js-clamp-2">Snippet…</p>
    <li class="job-actions__action pipe">19 days ago</li>              <!-- optional -->
  </li>
```

Parsing rules:
- Split the listing on `id="item-`; parse each chunk independently (chunk-safe —
  empty-ad `<li>` cards and truncated markup are skipped, never fatal).
- **`href` values contain stray whitespace/newlines inside the quotes** — trim
  (`\s+` → "") before use, then resolve relative paths against
  `https://www.nature.com`.
- Age text (`"19 days ago"`) is relative — surface verbatim as `date`; when
  absent, `date` is `null`. Never invent an absolute date.

## Detail

```
GET https://www.nature.com/naturecareers/job/{numeric_id}/{slug}/
GET https://www.nature.com/naturecareers/job/{numeric_id}/     → 200 (slug optional; verified live)
```

404 on unknown id (verified live: bogus id + slug → 404). The CLI requests the
bare-id form for `detail <id>` and full URLs for `detail <url>`.

Best data source: JSON-LD in `script[type="application/ld+json"]` with
`@type: JobPosting` (pages may embed several ld+json scripts — pick the
JobPosting; tolerate array / `@graph` wrappers; skip unparsable scripts).

| JSON-LD field | CLI field | Notes |
|---|---|---|
| `title` | `title` | Fallback: `<h1>` |
| `datePosted` | `date` | ISO timestamp, e.g. `2026-09-24T13:40:00.000Z` |
| `validThrough` | `deadline` | Closing deadline, ISO |
| `hiringOrganization.name` | `company` | |
| `jobLocation[].address` | `location` | Locality/Region/Country joined. Often only `addressCountry`; then fall back to the page config `"LocationDescription": "Milan (IT)"` |
| `employmentType` | `employmentType` | **Quirk:** sometimes the literal string `'["FULL_TIME"]'` (JSON array encoded as a string) — normalize by JSON-parsing strings starting with `[` |
| `description` | `description` | HTML → strip tags, keep paragraph/`<br>` breaks, decode entities |

Apply link (outside JSON-LD): first `a[href*="/naturecareers/apply/"]` — relative,
resolve against origin.

## robots.txt verdict (`https://www.nature.com/robots.txt`)

`User-agent: *` group (the one that governs this CLI's honest UA):

| Path | Verdict |
|---|---|
| `/naturecareers/searchjobs/` | **allowed** (no Disallow) — search endpoint |
| `/naturecareers/job/` | **allowed** (no Disallow) — detail endpoint |
| `/naturecareers/jobs/search` | **DISALLOWED** — never request |
| `/naturecareers/jobsrss/` | **DISALLOWED** — never request |

Separate named-UA groups disallow **site-wide**: `anthropic-ai`, `ClaudeBot`,
`GPTBot`, `CCBot`, `Google-Extended`, `Bytespider`, `PerplexityBot`,
`meta-externalagent`, and others. **Never put these product names in the CLI's
User-Agent.** The CLI sends `Mozilla/5.0 (compatible; naturecareers-cli/1.0)`.

## Quirks summary

1. List-anchor `href` whitespace/newlines — always trim.
2. Server may inject `countrycode` into its own links — never send it back.
3. Empty/malformed `<li>` cards interspersed in `ul#listing` — chunk-safe parse.
4. JSON-LD `employmentType` may be a JSON-encoded string.
5. `jobLocation` often country-only — fall back to `LocationDescription`.
6. List `date` is relative age text; detail `date`/`deadline` are ISO from JSON-LD.
7. Bare `/naturecareers/job/{id}/` works (200) — slug not required for detail.
