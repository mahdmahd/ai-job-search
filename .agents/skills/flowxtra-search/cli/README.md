# flowxtra-cli

CLI for searching **[Flowxtra](https://flowxtra.com)**'s public cross-tenant
jobs API — every company hosted on the Flowxtra ATS in one board-wide feed.
Zero runtime dependencies (plain `bun` + `fetch`); `bun install` only pulls
dev types for `typecheck`.

```bash
# From this directory
bun run src/cli.ts search -q "sales" --format table
bun run src/cli.ts search -q "engineer" -l Spain --workplace Remote --format table
bun run src/cli.ts detail M88PB --format plain

# Tests (network-free: mocked fetch + flag validation) and typecheck
bun test
bun run typecheck
```

- Search narrowing (`--query`, `--location`, `--company`, `--workplace`) is
  server-side; `--jobage` is client-side (the API has no age parameter).
- Errors go to stderr as `{ "error", "code" }` with exit code 1.
- 429/5xx retry with exponential backoff and jitter (max 6 retries); 404 maps
  to a clean `NOT_FOUND`.
- Base URL override: `FLOWXTRA_API_URL` (used by tests; there is only one
  hosted instance).

See `../SKILL.md` for the full flag reference and `../url-reference.md` for
the endpoint documentation.
