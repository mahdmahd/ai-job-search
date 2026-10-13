# gcjobs-cli

Command-line search for **GC Jobs / Emplois GC** (`emploisfp-psjobs.cfp-psc.gc.ca`),
the Public Service Commission of Canada's federal recruitment site. Jobs open to the
public only.

Zero runtime dependencies — plain `bun` + `fetch` + regex parsing, with a small
hand-rolled cookie jar because the site is session-based.

## Install

```bash
cd .agents/skills/gcjobs-search/cli && bun install
```

## Use

```bash
bun run src/cli.ts search -q analyst -l Ottawa --format table
bun run src/cli.ts search -o "Parks Canada" --format table
bun run src/cli.ts search -l "British Columbia" --lang-req "English essential" --max-pages 6
bun run src/cli.ts detail 2445986 --format plain
```

Run without arguments for the full flag reference.

## Commands

| Command | Purpose |
|---------|---------|
| `search` | Sweep the public listing and filter locally. All flags optional. |
| `detail <id\|url>` | Full poster: duties, qualifications, level, salary, selection process. |

## Why search is slow

GC Jobs has no queryable API, and its criteria search cannot be replayed over HTTP.
This CLI opens a session, sweeps all ~20 listing pages (~400 postings), and filters
client-side — about 30 seconds. Use `--max-pages` for a faster partial sweep;
`meta.truncated` tells you when the result set came from an incomplete listing.

`../url-reference.md` documents the three-request session sequence, the required
fetch-metadata headers, and why the criteria form is deliberately unused.

## Conventions

- Results go to **stdout**; errors go to **stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.
- Search JSON is `{ "meta": { ... }, "results": [ ... ] }`; every result key is always
  present, `null` when unknown.
- The contract `date` field carries the **closing** date — GC Jobs publishes no posting date.

## Development

```bash
bun run typecheck   # tsc --noEmit
bun run test        # bun test
```

`bun test` runs the offline fixture suite only. The live sweeps (capped at two listing
pages) are gated behind `LIVE=1` so CI stays offline:

```bash
LIVE=1 bun test
```

Run those before trusting any parser change; they take about 20 seconds.
