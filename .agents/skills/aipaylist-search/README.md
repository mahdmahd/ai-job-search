# aipaylist-search

Portal skill for [AIPayList](https://aipaylist.com): paid AI training, evaluation,
and annotation contractor work. Matches the [ai-job-search](https://github.com/MadsLorentzen/ai-job-search)
`/add-portal` contract so `/scrape` auto-discovers a folder named `*-search`.

**Zero runtime dependencies** (bun + `fetch`). MIT. Listing URLs stay on
aipaylist.com. The Pay Index at `/pay.json` remains CC BY 4.0 and is **not**
this feed.

Public copy (this folder only, MIT):
https://github.com/alexmaiker007-bit/aipaylist-search

It is not mixed into the Next.js app routes. Do not clone the private aipaylist
app repo to get the skill.

## Install into a local ai-job-search checkout

```bash
git clone https://github.com/alexmaiker007-bit/aipaylist-search.git \
  "/path/to/ai-job-search/.agents/skills/aipaylist-search"

cd /path/to/ai-job-search
# optional, only installs TypeScript dev types
cd .agents/skills/aipaylist-search/cli && bun install && cd ../../../..

# smoke
bun run .agents/skills/aipaylist-search/cli/src/cli.ts search -q "writer" --limit 5 --format table
```

`/scrape` picks up any `.agents/skills/*-search/SKILL.md` automatically. No other
wiring. Do **not** copy this repo's Next.js app, `.env`, or ingest adapters.

Windows (PowerShell):

```powershell
git clone https://github.com/alexmaiker007-bit/aipaylist-search.git "D:\path\to\ai-job-search\.agents\skills\aipaylist-search"
```

## API it hits

- Search: `GET https://aipaylist.com/jobs.json?q=writer&country=US&min=30&page=1&limit=25`
- Detail: `GET https://aipaylist.com/jobs.json?id=<uuid>`
- User-Agent: `Mozilla/5.0 (compatible; aipaylist-search-cli/1.0; +https://aipaylist.com)`
- Local Next: `AIPAYLIST_API_URL=http://localhost:3000 bun run src/cli.ts search -q "writer"`

See `url-reference.md` for parameters and the pay-honesty fields.

## Tests

```bash
# AIPayList app + this CLI (node:test via tsx, no database, no bun required)
npm test -- src/lib/jobs-json.test.ts portal-skills/aipaylist-search/cli/tests/*.test.ts

# Optional, in an ai-job-search checkout that already has bun:
cd portal-skills/aipaylist-search/cli && bun install && bun run typecheck
```

## Attribution

The portal-skill command contract (search and detail commands, `--format json|table|plain`,
JSON errors on stderr with exit 1, exponential backoff on 429/5xx) follows the specification
published in [ai-job-search](https://github.com/MadsLorentzen/ai-job-search) by Mads Lorentzen,
MIT License, Copyright (c) 2026 Mads Lorentzen. This skill is MIT, Copyright (c) 2026 AIPayList.

---

## Posted to GitHub discussion #78

https://github.com/MadsLorentzen/ai-job-search/discussions/78#discussioncomment-18440899

Body as edited on 15 Sep 2026 (public skill URL filled in):

```
**AIPayList portal skill** (`aipaylist-search`). A standalone MIT skill folder, not a fork of this template.

- **What it adapts:** Global and remote paid AI training, RLHF and eval, data annotation, and expert contractor roles on [AIPayList](https://aipaylist.com). First-party: we operate the board, and the skill only reads our public JSON (`GET https://aipaylist.com/jobs.json`). No LinkedIn, Danish or freehire ingest.
- **Path:** `.agents/skills/aipaylist-search`. Copy the folder and `/scrape` discovers `*-search`.
- **Contract:** `search` / `detail`, `--format json|table|plain`, JSON errors on stderr with exit 1, exponential backoff on 429/5xx, zero runtime dependencies, honest UA `aipaylist-search-cli/1.0`. Offline bun tests for flags, mapping and backoff (20 tests).
- **Listing URLs** stay on `https://aipaylist.com/jobs/{id}` so referral disclosure holds. Pay extras (`pay_raw`, `is_up_to`, `pay_unit`, `pay_min`, `pay_max`) keep "up to $X" as a ceiling rather than flattening it into a fake salary. The Pay Index at `/pay.json` is separately CC BY 4.0 and is not this feed.
- **Automation:** search + detail only. No form filling, no sending.
- **How it tracks upstream:** skill folder only, drops into current master. We follow `/add-portal` rather than vendoring workflow specs.
- **Public link:** https://github.com/alexmaiker007-bit/aipaylist-search
```
