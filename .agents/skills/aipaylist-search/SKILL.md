---
name: aipaylist-search
version: 1.0.0
description: >
  Use this skill to search live paid AI training, model evaluation, data
  annotation, RLHF, red-teaming and expert contractor roles aggregated by
  AIPayList (global / remote, pay floor $10/hr or $10 per task). Trigger
  phrases: AIPayList, AI training jobs, RLHF jobs, data annotation jobs,
  paid AI eval work, AI tutor jobs, find AI contractor gigs, look up this
  aipaylist job.
context: fork
enabled: true
allowed-tools: Bash(bun run .agents/skills/aipaylist-search/cli/src/cli.ts *)
---

# AIPayList Search Skill

Search live job listings from **[AIPayList](https://aipaylist.com)**, a hosted
directory of paid AI training / evaluation / annotation contractor work,
aggregated from platforms' own public job feeds. No API key. **Zero runtime
dependencies**. It runs with just `bun`.

This skill talks to AIPayList's public JSON at `https://aipaylist.com/jobs.json`.
Every result `url` is an `https://aipaylist.com/jobs/{id}` page (never a raw
platform apply link), so referral disclosure on the listing still holds.

> **First-party.** AIPayList operates this board and this skill. Reads are public
> and unauthenticated. Some outbound apply links on aipaylist.com are labelled
> referrals (`rel="sponsored"`). Ranking is not affected. Details:
> https://aipaylist.com/disclosure

## Pay honesty

AIPayList shows the **top of each advertised band**. Many roles are "up to $X/hr".
This skill **does not flatten a ceiling into a fake `salary`**. JSON extras:

- `pay_raw`: source wording
- `is_up_to`: true when the platform advertised a ceiling
- `pay_unit`: `hourly` | `per_task` | `per_project` | `salary` | `unknown`
- `pay_min` / `pay_max`: stored numbers, and `pay_min` is null on pure ceilings
- `pay_display`: the same label the HTML directory uses (`up to $X/hr` when honest)

The **Pay Index** at https://aipaylist.com/pay.json is a separate CC BY 4.0
dataset of benchmarks, not this listings feed.

## Commands

### Search job listings

```bash
bun run .agents/skills/aipaylist-search/cli/src/cli.ts search [-q "<keywords>"] [flags]
```

Key flags:

- `--query` / `-q`: keyword search (title and excerpt). Optional.
- `--location` / `-l` / `--country`: country name, ISO alpha-2 (`US`, `DE`), or `worldwide`.
- `--category`: `writing`, `coding`, `annotation`, `rlhf_eval`, `expert_domain`, `multilingual`, `audio_speech`, `security`, `red_teaming`, `studies`, `other` (facet slugs like `model-evaluation` also work).
- `--min`: minimum advertised **top** hourly rate in USD. "Up to $X" roles can match, and `is_up_to` stays on the row.
- `--platform`: platform id slug (`mercor`, `dataannotation`, …).
- `--jobage`: posted or first-seen within N days.
- `--page`: 1-indexed page. Default 1.
- `--limit` / `-n`: page size. Default 25, API cap 50.
- `--format` `json|table|plain`: default `json`.

### Fetch full job detail

```bash
bun run .agents/skills/aipaylist-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the UUID from a search result. You may also pass `https://aipaylist.com/jobs/<uuid>`.
Closed roles are still returned here (with `status`). Search only lists open ones.

## Usage examples

```bash
# Writing roles advertising at least $30/hr at the top of the band
bun run .agents/skills/aipaylist-search/cli/src/cli.ts search -q "writer" --min 30 --format table

# Coding eval jobs eligible in the United States (worldwide roles included)
bun run .agents/skills/aipaylist-search/cli/src/cli.ts search --category coding --country US --jobage 14 --format table

# Domain-expert / legal contractor work, worldwide
bun run .agents/skills/aipaylist-search/cli/src/cli.ts search --category expert_domain -q "legal" --location worldwide

# One listing
bun run .agents/skills/aipaylist-search/cli/src/cli.ts detail aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default. `{ "meta": { "count", "page", "total" }, "results": [...] }` |
| `table` | Scanning title / platform / location / pay |
| `plain` | Reading one job (`detail`) |

Each result has at least `id`, `title`, `company` (platform name), `location`, `date`, `url`. Missing values are `null`, never omitted. Errors go to **stderr** as `{ "error": "...", "code": "..." }` with exit `1`.

## Notes

- Data source: `GET https://aipaylist.com/jobs.json`. Override host with `AIPAYLIST_API_URL` (local Next server, etc.).
- Company in this contract is the **platform name** (Mercor, DataAnnotation, …), not an underlying lab.
- Location is AIPayList's geo label (`Worldwide`, `United States, Canada +N`).
- Date is `posted_at`, falling back to `first_seen_at`.
- The CLI retries 429/5xx with exponential backoff. Keep volume polite, the API rate-limits per IP.
- No application-form filling or sending. Search and detail only.
