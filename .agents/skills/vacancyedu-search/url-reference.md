# VacancyEdu URL Reference

Maintainer's cheat-sheet for vacancyedu.com's public WordPress REST API.
Update this file when the board's markup or API changes.

- **Portal**: https://vacancyedu.com/ — global, English-language academic job
  board (PhD, postdoc, faculty). WordPress + LiteSpeed + Cloudflare.
- **Auth**: none required. CORS is open (`Access-Control-Expose-Headers`
  includes `X-WP-Total`, `X-WP-TotalPages`).
- **robots.txt**: ALLOWED. Only `/wp-admin/` is disallowed; `/wp-json/` is
  not listed. No login wall. Personal-use / low-volume still applies.

## Search

```
GET https://vacancyedu.com/wp-json/wp/v2/posts?search=<q>&page=<n>&per_page=<n>&_fields=id,date,link,title
```

| Param | Meaning | Example |
|-------|---------|---------|
| `search` | Free-text query (title + content match) | `postdoc Netherlands` |
| `page` | 1-indexed page number | `1` |
| `per_page` | Results per page (API max `100`) | `100` |
| `after` | Only posts newer than this ISO 8601 datetime (no TZ offset) | `2026-10-06T00:00:00` |
| `_fields` | Limit response fields | `id,date,link,title` |

**No location parameter exists.** Institution/country live only in the title.

Response: a JSON **array** of post objects. Totals come from headers, not the body:

- `X-WP-Total` — total matches for the query (e.g. `3522` for "postdoc")
- `X-WP-TotalPages` — total pages at the requested `per_page`

Verified live 2026-10-13: `search=postdoc` → HTTP 200, `X-WP-Total: 3522`.

## Per-result fields (search)

| Field | Path | Notes |
|-------|------|-------|
| id | `.id` | integer post ID, e.g. `17395` |
| date | `.date` | `"2026-10-13T13:07:49"` — **no timezone offset** |
| url | `.link` | detail permalink, e.g. `/2026/10/13/<slug>/` |
| title | `.title.rendered` | HTML-escaped string; may contain entities (`&#233;`, `&amp;`) |
| company / location | *(parsed)* | from the title pattern `"... at <Institution>, <Country>"`; `null` when no match |

`excerpt.rendered` exists on the API but is **empty** — do not use it.
Request `content` only on the detail endpoint.

## Detail (single post)

```
GET https://vacancyedu.com/wp-json/wp/v2/posts/<id>?_fields=id,date,link,title,content
```

Resolve a pretty permalink (`/YYYY/MM/DD/<slug>/`) through the slug filter —
the path segments are a date, not the post ID:

```
GET https://vacancyedu.com/wp-json/wp/v2/posts?slug=<slug>&_fields=id,date,link,title,content
```

Returns a one-element array (or empty array `[]` when the slug is unknown).
An unknown numeric ID returns HTTP 404 (`rest_post_invalid_id`).

Field anchors inside `content.rendered`:

| What | Anchor | Example |
|------|--------|---------|
| Body | full HTML | `div.entry-content` on the HTML page; here it is the raw `content.rendered` string |
| Deadline | `<p><strong>Deadline :</strong> 30 November 2026</p>` | free text; **may appear multiple times** (one per sub-position) |
| Apply link | plain external `<a href="https://…">` anchors | no structured field; exclude `vacancyedu.com` self-links |
| Employment type | — | **none**; free text in body only |

Detail page HTML pattern (if the REST API ever disappears):
`https://vacancyedu.com/YYYY/MM/DD/<slug>/` — full description in
`div.entry-content`, same deadline/apply-link markup.

## Quirks worth remembering

1. **Aggregated posts.** One post often lists several sub-positions
   ("(01)", "(02)", …) in one body, each with its own deadline and apply
   link. Do not assume 1 post = 1 opening.
2. **Title-carried location only.** There is no server-side filter; a
   location flag would have to be a keyword in `search=`.
3. **Empty excerpts.** Listing pages cannot be summarized from the API
   without requesting `content` (heavy) — titles are the listing surface.
4. **TZ-less dates.** REST `date` strings carry no offset; `after=` accepts
   the same offset-less ISO form.
5. **Rate limits / backoff.** The CLI retries 429/5xx with exponential
   backoff (max ~6 retries). Cloudflare fronts the site; keep volume low.

## Access rules

- robots.txt: allowed (only `/wp-admin/` disallowed).
- No credential / API key required.
- No paid unlocker/proxy needed.
- Personal-use warning lives in `SKILL.md` and `cli/README.md`.
