# aipaylist-search-cli

CLI for [AIPayList](https://aipaylist.com) via its public JSON (`/jobs.json`).

**Data source**: `https://aipaylist.com/jobs.json`  
**Authentication**: none  
**Dependencies**: none (plain `bun` + `fetch`)

Listing `url` values are always `https://aipaylist.com/jobs/{id}`. The Pay Index
(`/pay.json`, CC BY 4.0) is a different dataset.

## Installation

```bash
cd .agents/skills/aipaylist-search/cli   # after copying the skill folder
bun install   # optional, TypeScript types only
```

## Commands

| Command | Description |
|---------|-------------|
| `search` | Search open roles (`--query`, `--country`, `--category`, `--min`, `--jobage`, `--page`, `--limit`) |
| `detail` | One job by UUID or `/jobs/{uuid}` URL |

`--format json|table|plain` (default `json`). Errors on stderr as JSON, exit 1.

```bash
bun run src/cli.ts search -q "writer" --min 30 --format table
bun run src/cli.ts detail aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee --format plain
```

`AIPAYLIST_API_URL` overrides the host (default `https://aipaylist.com`).
