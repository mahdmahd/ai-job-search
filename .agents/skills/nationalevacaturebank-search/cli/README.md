# nationalevacaturebank-cli

Zero-dependency Bun CLI for searching vacancies on Nationale Vacaturebank's
public Netherlands job API. It uses only `bun` and built-in `fetch`; `bun install`
installs TypeScript development types only.

**Authentication:** none.  
**Runtime dependencies:** none.

> **Personal, low-volume use only.** Respect Nationale Vacaturebank's terms and
> API rate limits. Do not use this CLI for bulk collection or commercial
> harvesting. It retries transient `429`/server errors, but callers must keep
> requests targeted and infrequent.

## Install and run

```bash
cd .agents/skills/nationalevacaturebank-search/cli
bun install
bun run src/cli.ts search -q developer --city Amsterdam --format table
```

## Commands

| Command | Description |
|---------|-------------|
| `search` | Search vacancies; provide `--query`, `--city`, or both. |
| `detail` | Return the complete API job object for an ID or detail URL. |

### Search flags

| Flag | Alias | Description |
|------|-------|-------------|
| `--query <text>` | `-q` | Maps to the `dcoTitle` API filter. |
| `--city <text>` | | Resolves the city centre and applies the API's city/geolocation filters. |
| `--distance <km>` | | Radius from the resolved city centre; default `40`. |
| `--jobage <days>` | | Sort by date and filter available `startDate` values. |
| `--page <n>` | | One-indexed page; default `1`. |
| `--limit <n>` | `-n` | Results per page; default `10`. |
| `--format <fmt>` | | `json`, `table`, or `plain`; default `json`. |

```bash
# Amsterdam developer vacancies
bun run src/cli.ts search -q developer --city Amsterdam --distance 40 --format table

# Recent nationwide vacancies
bun run src/cli.ts search -q "data engineer" --jobage 7 -n 20

# Detail by result ID or API URL
bun run src/cli.ts detail 12345 --format plain
```

Search JSON uses the shared portal-skill envelope:

```json
{ "meta": { "count": 1, "page": 1, "total": 42 }, "results": [] }
```

Errors are JSON on stderr (`{ "error": "...", "code": "..." }`) and exit
with status `1`. See `../SKILL.md` and `../url-reference.md` for full usage and
the API endpoint reference.
