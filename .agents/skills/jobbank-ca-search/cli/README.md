# jobbank-ca-cli

Command-line search for **Job Bank Canada** (`jobbank.gc.ca`) and **Guichet-Emplois**
(`guichetemplois.gc.ca`), the Government of Canada's national job board.

Zero runtime dependencies — plain `bun` + `fetch` + regex parsing. `bun install` only
pulls TypeScript types for `typecheck`.

## Install

```bash
cd .agents/skills/jobbank-ca-search/cli && bun install
```

## Use

```bash
bun run src/cli.ts search -q "software developer" -l "Toronto, ON" --format table
bun run src/cli.ts search -q "registered nurse" -p BC --jobage 7 --sort date
bun run src/cli.ts search -q "développeur" --lang fr -l "Montréal, QC" --format table
bun run src/cli.ts cities Windsor --format table
bun run src/cli.ts detail 49974823 --format plain
```

Run without arguments for the full flag reference.

## Commands

| Command | Purpose |
|---------|---------|
| `search` | Search postings. Needs at least one of `--query`, `--location`, `--province`. |
| `detail <id\|url>` | Full posting: description, salary, deadline, requirements, how to apply. |
| `cities <name>` | Resolve a city name to the numeric id the search filter requires. |

## Conventions

- Results go to **stdout**; errors go to **stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.
- Search JSON is `{ "meta": { ... }, "results": [ ... ] }`; every result key is always
  present, `null` when unknown.
- The site's `robots.txt` asks for `Crawl-delay: 5` and the CLI waits that long between
  requests. Multi-page sweeps are slow on purpose.

## Development

```bash
bun run typecheck   # tsc --noEmit
bun run test        # bun test
```

`bun test` runs the offline fixture suite only. The live tests against jobbank.gc.ca are
gated behind `LIVE=1` so CI stays offline:

```bash
LIVE=1 bun test
```

Run those before trusting any parser change.

See `../url-reference.md` for the endpoint documentation and the parsing anchors to
update if Job Bank changes its markup.
