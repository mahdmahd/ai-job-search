# aaccjobs-cli

Search AACC Jobs ([jobs.aacc.nche.edu](https://jobs.aacc.nche.edu)) — the
American Association of Community Colleges job board (jobboard.io platform):
US community-college jobs (faculty, adjunct, administration, staff).
No authentication, zero runtime dependencies (plain `bun` + `fetch` + regex).

## Important: client-side search

Server-side keyword search (`/jobs/search/*`) is Cloudflare-walled for
non-browser clients, so `search` fetches the public RSS feed plus the
homepage's "Latest Jobs" list (2 requests) and filters **client-side** on
`-q`. Results cover the latest ~30 listings, not the full archive. See
`../../url-reference.md` for the recon details.

## Usage

```bash
bun run src/cli.ts search -q "adjunct" --limit 5 --format table
bun run src/cli.ts search -q "biology faculty" --format json
bun run src/cli.ts detail 623296164 --format plain
bun run src/cli.ts detail https://jobs.aacc.nche.edu/jobs/623296164-superintendent-president-at-imperial-valley-college
```

Flags: `search` takes `--query`/`-q` (required), `--page` (single-page feed —
accepted for compatibility, only page 1 carries results), `--limit`/`-n`
(client-side cap after filtering), `--format json|table|plain` (default
`json`). `detail` takes `<id|url>` plus `--format json|plain`. There is no
`--location` flag: put the city/state in `-q` (e.g. `-q "adjunct Texas"`).
Unknown flags exit 1 with a JSON error on stderr — never silently ignored.

`detail` accepts a bare numeric id, a `/jobs/{id}[-{slug}]` path, or a full
AACC Jobs URL (other hosts are rejected before any request). Pages without a
JobPosting JSON-LD node, or redirects to a different job id, report
NOT_FOUND.

## Dev

```bash
bun install   # dev types only (typescript, @types/bun)
bun run typecheck
bun run test  # offline fixture tests; no network
```

Keep volume low — personal use only.
