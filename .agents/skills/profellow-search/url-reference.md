# profellow.com — URL reference for `profellow-cli`

Base: `https://www.profellow.com/` — WordPress (WP Rocket cached), English,
global fellowships + PhD-funding board, US-heavy. Honest UA used everywhere:
`Mozilla/5.0 (compatible; profellow-cli/1.0)` — no browser impersonation.

All paths below verified live on **2026-10-13** (HTTP 200 via curl). If the
portal changes its markup, update the anchors in `cli/src/helpers.ts` to match.

## Access rules

`robots.txt` (200) disallows only `/profile/` and `/members/`:

```
User-agent: *
Disallow: /profile/
Disallow: /members/
```

Search (`/?s=`) and `/open-call/…` are **allowed**. No login wall on listings.
A CleanTalk anti-bot script is present but does not block plain page fetches.

## Endpoints

| Purpose | Request | Notes |
|---------|---------|-------|
| Search listing | `GET /open-calls/` (page 1), `GET /open-calls/page/N/` (N ≥ 2) | ~15 `article.open-call` cards per page. There is **no server-side keyword parameter**; `search -q` filters client-side (see below). |
| Detail | `GET /open-call/<slug>/` | Full call page. 404 for unknown slugs (CLI surfaces `NOT_FOUND`). |
| WP search (DO NOT USE) | `GET /?s=<urlencoded>` | Returns HTTP 200 with a 62-byte body: `*** Forbidden. Sender blacklisted. Anti-Spam by CleanTalk. ***` — CleanTalk blocks search queries outright, so the open-call CPT coverage question is moot. Re-checked 2026-10-13; if this ever unblocks, prefer it as a primary source and keep the archive as fallback. |

## Card anchors (both `?s=` results and `/open-calls/` — same `article.open-call` markup)

```html
<article class="open-call">
  <div class="open-call__image-wrapper">
    <div class="open-call__sponsor sponsored-tag">   <!-- featured cards only -->
      Sponsored by Boston Consulting Group / Jobstream
    </div>
  </div>
  <div class="open-call__content post__content">
    <h2 class="open-call-content__title post__title h3">   <!-- featured -->
    <!-- OR -->
    <h4 class="open-call-content__title post__title">     <!-- normal -->
      <a href="https://www.profellow.com/open-call/<slug>/">Title</a>
    </h2/h4>
    <div class="post__excerpt"><p>…</p></div>
    <div class="open-call-eligibility"><strong>Eligibility:</strong><ul><li>…</li></ul></div>
    <div class="open-call-deadline">
      <strong>Deadline:</strong> October 30, 2026
    </div>
    <div class="open-call-cta">…Apply/Learn-More buttons…</div>
  </div>
</article>
```

- Title anchor: `h2.open-call-content__title.post__title.h3` (featured, inside
  `.open-call-list--featured`) or `h4.open-call-content__title.post__title`
  (normal, inside `.open-call-list--normal`).
- Deadline is **prose** (`"Deadline: October 30, 2026"` — sometimes "Rolling"
  or multi-date text); there is no machine date, no posting date, no location
  on cards, and no numeric post id → card `id` is the URL slug.
- `company` = `Sponsored by X` text with the prefix stripped (featured only);
  otherwise `null`.
- Client-side `-q` filter: every whitespace-separated query word
  (case-insensitive) must appear in title + excerpt + eligibility text
  (first ~4000 chars of the card chunk).

## Detail anchors (`/open-call/<slug>/`)

- Title: `h1.entry-title`
- Meta: `.open-call__meta` → `.open-call-meta__deadline` (prose date, no
  "Deadline:" prefix) and `.open-call-meta__cta` → `a.btn--primary`
  (`title="Apply Link"`, external `href`) — present twice (top + `--bottom`
  variant); CLI dedupes.
- Sponsor: `.single-post__sponsor` (`"Sponsored by X"`, may be absent).
- Body: `.single-post__body` with `<h2>` sections — Program Benefits /
  Eligibility / How to Apply / Application Deadline. CLI extracts plain text
  plus the Eligibility section separately.

## Parameters

| CLI flag | Portal mapping |
|----------|----------------|
| `--query`/`-q` | No server-side param — client-side AND filter over the fetched page (see above). |
| `--page` | Archive page: page 1 = `/open-calls/`, N ≥ 2 = `/open-calls/page/N/`. |
| `--limit`/`-n` | Client-side cap after filtering. |
| `--format` | Output rendering only. |
| _(no `--jobage` / `--location`)_ | Deliberately not offered: no posting date and no location field exist on cards — either flag would be silently meaningless (see `jobindex-search` precedent). |

## Quirks / drift watch

- CleanTalk may escalate blocking if volume rises — keep to a handful of
  requests per session; the CLI fetches exactly one page per `search`.
- `data-lazy-src`/`data-lazy-srcset` image attributes and `noscript` fallbacks
  are irrelevant to parsing (no image fields are extracted).
- Deadline prose varies (`"Rolling admissions"`, multi-date strings); `date`
  carries the raw prose and is `null` only when the div is absent.
