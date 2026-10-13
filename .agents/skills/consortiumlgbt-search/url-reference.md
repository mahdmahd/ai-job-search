# Consortium LGBT Jobs URL Reference

Public, unauthenticated WP Job Manager endpoints used by this skill.
Canonical host: **`www.consortium.lgbt`** (`.lgbt` TLD — the `.com`/`.org`
variants do not resolve to this board). No authentication required;
`robots.txt` (200) disallows only `/wp-admin/` (explicitly allowing
`/wp-admin/admin-ajax.php`) — the jobs paths are permitted.

> Low volume, personal use only — keep to a handful of requests per session.

## SSR check (verified 2026-10-13)

`GET https://www.consortium.lgbt/jobs/` returns 200 but the results list is
an **empty** `<ul class="job_listings">` — listings render only via
JavaScript (`<noscript>` says JS is required). The page carries the WPJM
shortcode config:

```html
<div class="job_listings" data-location="" data-keywords=""
     data-show_filters="true" data-show_pagination="false" data-per_page="20"
     data-orderby="featured" data-order="DESC" data-categories=""
     data-disable-form-state-storage="" data-featured_first="false"
     data-post_id="53">
```

The filter form uses `search_keywords` / `search_location` inputs plus a
`remote_position` checkbox and `filter_job_type[]` checkboxes
(`collaboration`, `employed`, `volunteer`). `?search_keywords=<q>` on the
page URL does **not** SSR-render results — always use the AJAX endpoint.

Localized script config (no nonce anywhere on the page):

```js
var job_manager_ajax_filters = {"ajax_url":"/jm-ajax/%%endpoint%%/", ...}
```

## Search (AJAX)

```
POST https://www.consortium.lgbt/jm-ajax/get_listings/
```

Form-encoded body params:

| Param | Meaning | Example |
|-------|---------|---------|
| `search_keywords` | Free-text query (empty = list all) | `peer support` |
| `search_location` | Location substring, matched against the listing location | `Rotherham`, `Remote` |
| `per_page` | Page size (shortcode default 20) | `20` |
| `page` | 1-indexed page | `1` |
| `post_id` | Jobs page id (shortcode `data-post_id`) | `53` |

Returns JSON: `{ found_jobs, showing, max_num_pages, showing_all,
showing_links, html }` where `html` is a string of `<li class="post-<id>
job_listing ...">` cards. Each card carries:

- id: `post-<id>` class (e.g. `post-36694`)
- URL + title: `<a href="https://www.consortium.lgbt/job/<slug>/">` wrapping
  `<div class="position"><h3>Title</h3><div class="company"><strong>Org</strong>`
- location: `<div class="location">…</div>` (e.g. `Rotherham`, or
  `Remote Position <small>(Remote)</small>`)
- posted date: `<li class="date"><time datetime="2026-10-12">…</time></li>`
- employment type: `<li class="job-type volunteer">Volunteer</li>` (class
  suffix `volunteer`/`employed`/`collaboration`)
- deadline: `<li class="application-deadline"><label>Closes:</label> 6th
  November 2026</li>`

Do NOT use the legacy `admin-ajax.php?action=get_job_listings` path — it
returns HTTP 400 on this site. The working endpoint name is `get_listings`
(confirmed in the plugin's `ajax-filters.js`:
`...replace("%%endpoint%%","get_listings")`), reached via the `/jm-ajax/`
pretty route.

## Detail

```
GET https://www.consortium.lgbt/job/<slug>/
```

Returns the full posting page (200). Anchors:

- JSON-LD `JobPosting` in `<script type="application/ld+json">`:
  `datePosted`, `validThrough` (deadline), `title`, `description` (HTML),
  `employmentType`, `hiringOrganization.name`, `jobLocation.address`.
- Visible title: `<span class="fl-heading-text">…</span>`; body copy starts
  after the `fl-module-fl-post-content` module (`<hr />` + `<p>` blocks).
- Numeric id → URL: `GET https://www.consortium.lgbt/?p=<id>` 301-redirects
  to the canonical `/job/<slug>/` URL. The WP REST route
  `/wp-json/wp/v2/job_listing/<id>` is **not** registered (404).

## Notes

- No authentication, no nonce, no session required for search or detail.
- `X-Requested-With: XMLHttpRequest` is sent but not strictly required.
- Retry 429/5xx with exponential backoff; keep volume low.
