# euraxess-cli

Search research jobs on [EURAXESS](https://euraxess.ec.europa.eu/jobs/search)
(European Commission — EU/EEA research mobility) from the command line. No
authentication, zero runtime dependencies: plain `bun` + `fetch` + regex
parsing, so it runs on a fresh clone with nothing but `bun` (dev-only types via
`bun install` enable `typecheck`).

## ⚠️ Personal use only

EURAXESS's robots.txt disallows parameterized URLs (`Disallow: /*?`) and job
detail pages (`Disallow: /jobs/*`). This tool exists because the user
explicitly accepted a low-volume personal-use tradeoff. Keep requests to a
handful per session; no commercial or bulk use; run it on your own
responsibility. Never a browser impersonation — requests identify as
`euraxess-cli/1.0`.

## Usage

```bash
# install dev types (optional, for typecheck)
bun install

bun run src/cli.ts search -q "PhD candidate Netherlands" --format table
bun run src/cli.ts search -q "postdoctoral researcher" --page 2 --limit 5
bun run src/cli.ts detail 472465 --format plain
```

Flags: `-q/--query` (required), `--page <n>`, `--limit/-n <n>`,
`--format json|table|plain`. `--location`/`--jobage` are unsupported by
EURAXESS's GET search URL and are rejected with `UNKNOWN_FLAG` — include the
country in the query instead.

Output shape (`json`): `{ meta: { count, page }, results: [{ id, title,
company, location, date, url, deadline, snippet }] }` — keys always present,
missing values `null`. Errors go to stderr as `{ error, code }` with exit 1.

## Known limitation: detail pages

EURAXESS serves `/jobs/<id>` only intermittently to non-browser clients (307
redirect to the search page, or a content-less stub). The `detail` command
parses full pages when they come through and otherwise exits 1 with
`DETAIL_BLOCKED` — it never fabricates data. See `../url-reference.md` for the
full endpoint and markup reference.
