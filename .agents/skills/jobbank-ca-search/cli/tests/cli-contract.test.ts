import { describe, expect, test } from "bun:test"
import { runCLI, parseJSON } from "./helpers.js"

/**
 * Live tests hit the real portal, so they are opt-in: CI deliberately runs only
 * fixture/mock suites (see .github/workflows/ci.yml). Enable with LIVE=1.
 */
const live = process.env.LIVE === "1"

/**
 * Contract tests: every portal skill in this repo exposes the same commands,
 * the same JSON envelope, and the same stderr error convention. These run
 * offline except where noted.
 */

interface ErrorPayload {
  error: string
  code: string
}

function parseStderrJSON(stderr: string): ErrorPayload {
  return JSON.parse(stderr.split("\n").filter(Boolean).pop() as string) as ErrorPayload
}

describe("help and dispatch", () => {
  test("bare invocation prints help and exits 1", async () => {
    const result = await runCLI([])
    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain("jobbank-ca-cli")
  })

  test("--help exits 0 when a command is given", async () => {
    const result = await runCLI(["search", "--help"])
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("SEARCH FLAGS")
  })

  test("unknown command errors on stderr with a code", async () => {
    const result = await runCLI(["frobnicate"])
    expect(result.exitCode).toBe(1)
    expect(result.stdout).toBe("")
    expect(parseStderrJSON(result.stderr).code).toBe("BAD_CMD")
  })
})

describe("flag validation", () => {
  test("search with no criteria is rejected", async () => {
    const result = await runCLI(["search"])
    expect(result.exitCode).toBe(1)
    expect(parseStderrJSON(result.stderr).code).toBe("NO_CRITERIA")
  })

  test("non-numeric --jobage is rejected", async () => {
    const result = await runCLI(["search", "-q", "nurse", "--jobage", "soon"])
    expect(result.exitCode).toBe(1)
    expect(parseStderrJSON(result.stderr).code).toBe("BAD_ARG")
  })

  test("non-numeric --limit is rejected", async () => {
    const result = await runCLI(["search", "-q", "nurse", "--limit", "many"])
    expect(result.exitCode).toBe(1)
    expect(parseStderrJSON(result.stderr).code).toBe("BAD_ARG")
  })

  test("an invalid province code is rejected before any request", async () => {
    const result = await runCLI(["search", "-q", "nurse", "-p", "XX"])
    expect(result.exitCode).toBe(1)
    expect(parseStderrJSON(result.stderr).code).toBe("BAD_PROVINCE")
  })

  test("an invalid --lang is rejected", async () => {
    const result = await runCLI(["search", "-q", "nurse", "--lang", "de"])
    expect(result.exitCode).toBe(1)
    expect(parseStderrJSON(result.stderr).code).toBe("BAD_LANG")
  })

  test("an invalid --sort is rejected", async () => {
    const result = await runCLI(["search", "-q", "nurse", "--sort", "sideways"])
    expect(result.exitCode).toBe(1)
    expect(parseStderrJSON(result.stderr).code).toBe("BAD_ARG")
  })

  test("detail without an id is rejected", async () => {
    const result = await runCLI(["detail"])
    expect(result.exitCode).toBe(1)
    expect(parseStderrJSON(result.stderr).code).toBe("NO_ID")
  })

  test("detail with an unparseable id is rejected", async () => {
    const result = await runCLI(["detail", "not-a-job"])
    expect(result.exitCode).toBe(1)
    expect(parseStderrJSON(result.stderr).code).toBe("BAD_ID")
  })

  test("cities without a name is rejected", async () => {
    const result = await runCLI(["cities"])
    expect(result.exitCode).toBe(1)
    expect(parseStderrJSON(result.stderr).code).toBe("NO_QUERY")
  })
})

describe.skipIf(!live)("live endpoints", () => {
  test("cities resolves a real Canadian city to an id", async () => {
    const result = await runCLI(["cities", "Toronto", "--limit", "5"])
    const payload = parseJSON<{ results: { cityId: string; name: string; province: string }[] }>(result)
    expect(payload.results.length).toBeGreaterThan(0)
    const toronto = payload.results.find((c) => c.name === "Toronto")
    expect(toronto).toBeDefined()
    expect(toronto?.province).toBe("ON")
    expect(toronto?.cityId).toMatch(/^\d+$/)
  })

  test("search returns the contract envelope with usable results", async () => {
    const result = await runCLI([
      "search",
      "-q",
      "software developer",
      "-p",
      "ON",
      "--limit",
      "5",
    ])
    const payload = parseJSON<{
      meta: { count: number; page: number; totalResults: number | null }
      results: { id: string; title: string; url: string; company: string | null }[]
    }>(result)

    expect(payload.meta.page).toBe(1)
    expect(payload.results.length).toBeGreaterThan(0)
    expect(payload.results.length).toBeLessThanOrEqual(5)

    for (const job of payload.results) {
      expect(job.id).toMatch(/^\d+$/)
      expect(job.title.length).toBeGreaterThan(0)
      expect(job.url).toContain("jobbank.gc.ca/jobsearch/jobposting/")
      // Every contract key must be present even when the value is unknown.
      for (const key of ["company", "location", "date", "salary"]) {
        expect(job).toHaveProperty(key)
      }
    }
  })

  test("detail returns a readable description for a live posting", async () => {
    const search = await runCLI(["search", "-q", "developer", "-p", "ON", "--limit", "1"])
    const found = parseJSON<{ results: { id: string }[] }>(search)
    if (found.results.length === 0) return // nothing posted right now; nothing to assert

    const result = await runCLI(["detail", found.results[0].id])
    const job = parseJSON<{ id: string; title: string; description: string | null }>(result)
    expect(job.id).toBe(found.results[0].id)
    expect(job.title.length).toBeGreaterThan(0)
    expect(job.description).not.toBeNull()
    // Description must be text, not leftover markup.
    expect(job.description).not.toContain("<div")
  })
})
