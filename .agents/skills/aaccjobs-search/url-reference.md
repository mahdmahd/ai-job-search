# AACC Jobs URL Reference

Public, unauthenticated endpoints used by this skill. AACC Jobs
(`jobs.aacc.nche.edu`) is a jobboard.io board: US community-college jobs
(faculty, adjunct, administration, staff), in English.

> Server-side keyword search is Cloudflare-walled (see below), so the CLI
> searches by fetching the RSS feed plus the homepage and filtering
> client-side on `-q`. Keep volume low — one search costs exactly 2 requests.

## robots.txt

`GET https://jobs.aacc.nche.edu/robots.txt` → 200. Public crawl of listings
is allowed; explicitly disallowed are trackers/auth/employer paths and several
query params (`lat`, `long`, `sort`, `city`, `state`, `skills`,
`open_to_remote`, `open_to_relocation`). Several named AI crawlers
(CCBot, GPTBot, Amazonbot, meta-externalagent, …) are disallowed site-wide —
the CLI sends an honest `aaccjobs-cli` UA, never an AI product name. The CLI
never touches the disallowed paths or params.

## Search (client-side filter over two public feeds)

```
GET https://jobs.aacc.nche.edu/jobs.rss        # RSS 2.0, ~30 latest jobs
GET https://jobs.aacc.nche.edu/                # homepage "Latest Jobs" cards
```

**Do NOT use these server-search paths** — they answer 403 "Just a moment"
(Cloudflare challenge) to non-browser clients (verified 2026-10-13):

- `/jobs/search?q=...` (query-param search)
- `/jobs/search/{category}` (e.g. `/jobs/search/faculty-jobs`,
  `/jobs/search/adjunct-jobs` — linked from the homepage but challenged)
- `/?keywords=...` (renders the homepage but applies NO filtering)

**RSS** (`<item>` per posting): `guid`/`link` → `/jobs/{numericId}-{slug}`;
`title` → `"Role at Institution (City, ST, USA)"` (no CDATA; decode entities,
collapse whitespace; split company/location on the last `" at "` + trailing
paren group); `description` → plain-text excerpt; `pubDate` → ISO date.
`--limit` caps after filtering; the feed usually holds ~30 items, so a large
`--limit` still returns at most the latest listings.

**Homepage** (`ul.jobList` → `li.job-listing`): title + URL from
`a.jobList-title` (`href="/jobs/{numericId}-{slug}"`, inner `<strong>`);
company + location from `ul.jobList-introMeta li` (building icon ⟹ company,
map icon ⟹ location; the trailing empty `<li>` is skipped); posted label from
`div.jobList-date` (e.g. `"Oct 12"`, no year). Entries merge with RSS by id,
preferring the richer RSS record.

**Pagination:** the homepage's `div.jobs-pagination` is empty and `/?page=N`
renders no job list — the board exposes a single latest-listings page. `--page`
is accepted for contract compatibility but only page 1 carries results.

## Detail

```
GET https://jobs.aacc.nche.edu/jobs/{numericId}[-{slug}]
```

A bare id resolves via the slug redirect; a full slugged URL is fetched
as given. Returns the posting page (`div.jobDetail-header` / `h1`,
`div.job-body`) with a **`script[type="application/ld+json"]`
schema.org/JobPosting** block — the CLI prefers it for title, datePosted,
validThrough (deadline), description, hiringOrganization, jobLocation
(PostalAddress), and employmentType. The apply link lives on
`a.apply-button` (typically an external `apptrkr.com` redirect).

Expired/invalid ids may collapse onto the homepage or a search/category page
with 200: the CLI treats any page *without* a JobPosting JSON-LD node, or a
redirect to a different job id, as NOT_FOUND rather than printing page chrome
as a result.

## Notes

- No authentication required for any path this skill uses.
- 429/5xx → exponential backoff with jitter (≤6 retries); 404 → empty.
- A 200 body containing a Cloudflare challenge throws a dedicated error
  naming bot protection rather than failing downstream as a parse error.
