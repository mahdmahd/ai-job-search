# jobRxiv — endpoint & markup reference

Everything below was verified against the live site on **2026-10-13** with an
honest User-Agent (`Mozilla/5.0 (compatible; jobrxiv-cli/1.0)`), no cookies,
no login. If the CLI starts returning empty or garbled results, check these
anchors first — this file is the map a maintainer needs.

## Site stack

WordPress + WP Job Manager + Workscout theme (Workscout child), Elementor,
WooCommerce. ~3.3k job listings. English-language, global research/science
postings.

## Access rules

- `robots.txt` (200): allows `/jm-ajax/` listing calls and `/job/...` detail
  pages. Only disallows `/wp-admin/` (except `admin-ajax.php`, explicitly
  allowed), WooCommerce log/upload paths, and `?add-to-cart=` links.
  Sitemap: `https://jobrxiv.org/sitemap_index.xml`.
- No login required for reading listings or details.
- Honest UA works on every endpoint; no browser impersonation needed.

## Search endpoint (used by the CLI)

WP Job Manager's public AJAX listings rewrite (`job_manager_ajax_filters.ajax_url`
= `/jm-ajax/%%endpoint%%/` → endpoint `get_listings`):

```
GET https://jobrxiv.org/jm-ajax/get_listings/?search_keywords=<urlencoded>&page=<n>&per_page=<m>
```

| Param | Meaning | Notes |
|-------|---------|-------|
| `search_keywords` | keyword query | matches titles, descriptions, locations. There is **no** location or date param on this endpoint. |
| `page` | 1-indexed page | server-side pagination, verified distinct across pages |
| `per_page` | results per page | board default is 25; the CLI sends 25 |

Response: JSON envelope (all keys always present):

```json
{
  "found_jobs": true,
  "showing": "Search completed. Found 1006 matching records.",
  "max_num_pages": 503,
  "showing_all": true,
  "showing_links": "<a ...>Clear Filters</a> ...",
  "html": "<li class=\"right post-155928 job_listing ...\"> ... </li> ...",
  "post_count": 1006
}
```

- `post_count` — total matches (number). `showing` carries the same total as
  text (`Found 1,006 matching records.`) as a fallback.
- `max_num_pages` — page count for pagination.
- `html` — concatenated `<li class="... job_listing ...">` cards (Workscout
  rich layout).

### Card markup anchors (`html` field)

```html
<li class="right post-155928 job_listing type-job_listing status-publish
    hentry job_listing_region-ireland job_listing_category-phd
    job_listing_type-full-time ..." data-longitude="" data-latitude="">
  <a href="https://jobrxiv.org/job/{slug}/">
    <img class="company_logo" alt="<employer>" />
    <div class="job-list-content">
      <h4><Title> <span class="job-type full-time">Full-time</span></h4>
      <div class="job-icons">
        <div class="job-salary-range"><span class="job-salary">$33,585 - $33,585</span></div>
        <span class="ws-meta-company-name"><i class="fa fa-briefcase"></i> <Employer></span>
        <span class="ws-meta-job-location"><i class="fa fa-map-marker"></i>  <Region></span>
        <span class="ws-meta-salary"><i class="fa fa-money"></i><City></span>
        <span class="ws-meta-job-date"><i class="fa fa-calendar"></i> <time datetime="2026-10-07">Posted on 7 October 2026</time></span>
      </div>
      <div class="listing-desc"><p><excerpt>&#8230;</p></div>
    </div>
  </a>
  <div class="clearfix"></div>
</li>
```

- **ID**: numeric WP post id from the class list (`post-155928`). Stable
  identifier; slugs sometimes embed a different number (e.g.
  `...-dublin-27778-...`) which is *not* the post id.
- **Status**: `status-publish` vs `status-expired` in the class list. Expired
  postings stay in search results and their `<a href>` falls back to
  `https://jobrxiv.org/?post_type=job_listing&amp;p=153878` instead of a
  pretty permalink (still resolvable by `detail`).
- `ws-meta-salary` usually holds a **city**, not money — the money value lives
  in `.job-salary-range .job-salary` and is often absent.

## Fallback / alternative endpoints (documented, not wired in)

- **WP core search**: `GET /?s=<q>&post_type=job_listing` (200; paginates via
  `/page/<n>/?s=...&post_type=job_listing`). Renders the *blog archive*
  layout (`article.post-container.post-<id>.job_listing` with `<a href><h3>`
  title, `.author-link`, excerpt `<p>`) — no company/location/date meta. The
  JM endpoint is strictly richer; the core-search page is a fallback only.
- **Category archives**: `/job-category/postdoc/`, `/job-category/phd/`,
  `/job-category/faculty/`, etc. — same rich `li.job_listing` cards, paginated
  server-side via `/page/<n>/`.
- Homepage `?search_keywords=<q>` renders the same rich cards but paginates
  client-side ("Show More Jobs" AJAX), so `/page/2/` is ignored there — do not
  use it for pagination.

## Detail endpoint

```
GET https://jobrxiv.org/job/{slug}/
```

Numeric post ids resolve via WordPress's `GET /?p=<id>` canonical redirect
(works for expired postings too; the CLI follows redirects).

### Detail-page anchors

| Field | Anchor |
|-------|--------|
| title | `#titlebar h1` (a `<span class="job-type ...">` badge is nested inside — strip before cleaning) |
| employment type | first `.job-type` span in the titlebar h1 |
| employer | `.company-info h4 strong` (fallback: `img.company_logo[alt]`) |
| employer website | `.company-info a.website[href]` |
| posted date | `.job-overview` → "Date Posted" → `<time datetime="YYYY-MM-DD">` |
| location | `.job-overview` → "Location" → `span.location` (links to `/job-region/...`) |
| description | `.single_job_listing .job_description` |
| apply link | `#apply-dialog .small-dialog-content a[href]` (external URL; drop jobrxiv.org self-links) |
| closed state | an expired/filled banner above the description block; the detection scope stops at `class="single_job_listing"` so recruiter boilerplate inside the body can't false-flag |

Each detail page also embeds a `schema.org/JobPosting` JSON-LD block
(`application/ld+json`) with `datePosted`, `title`, `description`,
`hiringOrganization`, `jobLocation`, `employmentType` — a good secondary
source if the DOM anchors drift.

## Quirks

- The WPJM endpoint returns JSON even without an `X-Requested-With` header;
  the CLI sends it anyway (harmless, matches what the site's own JS does).
- `www.` → apex 301: always use the `https://jobrxiv.org/` apex.
- Keep request volume low: the board is an honour-system-run academic service
  (its own copy says so); personal-use only.
