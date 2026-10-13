---
name: nationalevacaturebank-search
version: 1.0.1
description: >
  Use this skill to search live vacancies in the Netherlands on Nationale
  Vacaturebank, or to retrieve a specific vacancy by its ID or API job URL.
  Use it for Dutch job searches across roles and sectors, especially requests
  such as vacatures in Amsterdam, developer banen in Nederland, or details for
  a Nationale Vacaturebank vacancy.
context: fork
enabled: true
allowed-tools: Bash(bun run .agents/skills/nationalevacaturebank-search/cli/src/cli.ts *)
---

# Nationale Vacaturebank Search Skill

Search live Netherlands vacancies from Nationale Vacaturebank's public JSON API.
No authentication or API key is required, and the CLI has **zero runtime
dependencies**: only `bun` and its built-in `fetch` are used.

## ⚠️ Personal use and rate limits

Use this skill for personal, low-volume job searching only. Respect Nationale
Vacaturebank's terms and API rate limits; do not use it for bulk collection or
commercial harvesting. The CLI retries transient `429` and server errors, but
requests should still be kept infrequent and targeted.

## Commands

### Search vacancies

```bash
bun run .agents/skills/nationalevacaturebank-search/cli/src/cli.ts search [--query "<role>"] [--city "<plaats>"] [flags]
```

Supply at least one of `--query` or `--city`. `--query` maps to the API's
`dcoTitle` filter. A city search resolves the city centre through the public
geolocation endpoint, then sends `city`, `latitude`, `longitude`, and `distance`
filters together; the jobs API rejects `distance` without coordinates.

| Flag | Alias | Description |
|------|-------|-------------|
| `--query <text>` | `-q` | Job title or role, e.g. `developer`. |
| `--city <text>` | | Dutch search centre, e.g. `Amsterdam`; each result still reports its actual vacancy location. |
| `--distance <km>` | | Distance filter in kilometres; default `40`. Applied with `--city`. |
| `--jobage <days>` | | Sorts by date and filters returned jobs by `startDate` when available. |
| `--page <n>` | | One-indexed page; default `1`. |
| `--limit <n>` | `-n` | Results per page; default `10`. |
| `--format <fmt>` | | `json` (default), `table`, or `plain`. |

### Retrieve a vacancy

```bash
bun run .agents/skills/nationalevacaturebank-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

Pass the `id` from a search result, or the API detail URL returned as that
result's `url`. JSON detail output is the complete job object returned by the
public API, including its description.

## Examples

```bash
# Developer vacancies in Amsterdam
bun run .agents/skills/nationalevacaturebank-search/cli/src/cli.ts search -q developer --city Amsterdam --format table

# Recent data vacancies nationwide
bun run .agents/skills/nationalevacaturebank-search/cli/src/cli.ts search -q "data engineer" --jobage 14 -n 20 --format json

# All vacancies matching a city
bun run .agents/skills/nationalevacaturebank-search/cli/src/cli.ts search --city Utrecht --distance 25 --format plain

# Complete detail for a result
bun run .agents/skills/nationalevacaturebank-search/cli/src/cli.ts detail 12345 --format plain
```

## Output and errors

Search JSON follows the portal-skill contract:

```json
{
  "meta": { "count": 1, "page": 1, "total": 42 },
  "results": [{ "id": "12345", "title": "…", "company": "…", "companyUrl": null, "location": "Amsterdam", "date": "…", "url": "…" }]
}
```

All errors are JSON written to **stderr** as `{ "error": "...", "code": "..." }`;
the process exits with code `1`.

See [url-reference.md](url-reference.md) for the exact endpoints and filter grammar.
