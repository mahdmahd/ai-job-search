# AIPayList jobs.json reference

The endpoints this skill depends on. Update this file if the public JSON changes.
Base URL defaults to `https://aipaylist.com` and is overridable via `AIPAYLIST_API_URL`.

## Authentication

None. `GET /jobs.json` is a public directory feed. `/api/` on aipaylist.com is
robots-disallowed and holds private routes, and this feed is intentionally **not**
under `/api/` (same family as `/pay.json` and `/feed.xml`). A rewrite aliases
`/api/jobs.json` → `/jobs.json` for callers who guessed that path.

## `GET /jobs.json`

Search open listings (`status=open`). `meta.total` counts listings, one per country posting, so it is larger than the role count the site's headline shows, where a role re-posted once per country counts once.

| Param | CLI flag | Notes |
|-------|----------|-------|
| `q` | `--query` / `-q` | Keyword ilike on title + excerpt. Optional. |
| `country` / `location` | `--country` / `--location` | Display name, ISO alpha-2, slug, or `worldwide`. Worldwide-eligible roles match a country filter, as on the HTML feed. |
| `category` / `cat` | `--category` | Database key or facet slug. |
| `min` / `min_rate` | `--min` | Advertised **top** of an hourly band (`rate_max >= min`). "Up to $X" rows can match, and `is_up_to` remains true. |
| `platform` | `--platform` | `platform_id` slug. |
| `jobage` | `--jobage` | Whole days. `posted_at` (or `first_seen_at` when posted_at is null) ≥ now − N days. |
| `page` | `--page` | 1-indexed. Default 1, cap 100. |
| `limit` | `--limit` / `-n` | Default 25, cap 50. |
| `id` | `detail <id>` | UUID. Switches to a single-row lookup, including closed jobs. |

### Envelope

```jsonc
{
  "name": "AIPayList jobs",
  "license": "Live AIPayList directory listings. … Pay Index at /pay.json is separately licensed CC BY 4.0 …",
  "self": "https://aipaylist.com/jobs.json",
  "meta": { "count": 25, "page": 1, "limit": 25, "total": 1200 },
  "results": [ /* PortalJob */ ]
}
```

`detail` uses the same envelope with `results` of length 0 or 1.

### PortalJob (fields the skill reads)

```jsonc
{
  "id": "uuid",
  "title": "AI Writing Evaluator",
  "company": "Mercor",                 // platform display name
  "location": "Worldwide",             // geoLabel(countries, worldwide)
  "date": "2026-09-01T12:00:00Z",      // posted_at || first_seen_at
  "url": "https://aipaylist.com/jobs/uuid", // NEVER a platform apply URL
  "description": "… Pay: up to $65/hr. This figure is an advertised ceiling …",
  "pay_raw": "Up to $65/hr",
  "is_up_to": true,
  "pay_unit": "hourly",
  "pay_min": null,
  "pay_max": 65,
  "currency": "USD",
  "pay_display": "up to $65/hr",
  "category": "writing",
  "platform": "mercor",
  "status": "open",
  "countries": ["United States"],
  "worldwide": true
}
```

There is no `salary` field. Do not derive one from `pay_max` when `is_up_to` is true.

### Errors

JSON `{ "error": "…", "code": "…" }` with HTTP 400 / 404 / 429 / 503.
429 includes `Retry-After`. CORS: `Access-Control-Allow-Origin: *` on GET and OPTIONS.

## Caching and rate limits

Success: `Cache-Control: public, s-maxage=900, stale-while-revalidate=3600`.
Per-IP: 60 requests / 60 seconds on a warm instance (best-effort Map, same idea as the site's contact form). The CLI backs off on 429/5xx.

## Related public surfaces (not this skill)

| URL | What it is |
|-----|------------|
| `/pay.json` | CC BY 4.0 Pay Index (benchmarks, **not** listings) |
| `/feed.xml` | RSS of the 50 newest priced roles (no search) |
| `/llms.txt` | Machine citation guide |
