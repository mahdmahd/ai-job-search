import { describe, expect, test } from "bun:test"
import { runCLI, parseJSON } from "./helpers.js"

/**
 * Live tests hit the real portal, so they are opt-in: CI deliberately runs only
 * fixture/mock suites (see .github/workflows/ci.yml). Enable with LIVE=1.
 */
const live = process.env.LIVE === "1"

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
    expect(result.stdout).toContain("gcjobs-cli")
  })

  test("unknown command errors on stderr with a code", async () => {
    const result = await runCLI(["frobnicate"])
    expect(result.exitCode).toBe(1)
    expect(result.stdout).toBe("")
    expect(parseStderrJSON(result.stderr).code).toBe("BAD_CMD")
  })
})

describe("flag validation", () => {
  test("non-numeric --limit is rejected", async () => {
    const result = await runCLI(["search", "--limit", "lots"])
    expect(result.exitCode).toBe(1)
    expect(parseStderrJSON(result.stderr).code).toBe("BAD_ARG")
  })

  test("non-numeric --max-pages is rejected", async () => {
    const result = await runCLI(["search", "--max-pages", "all"])
    expect(result.exitCode).toBe(1)
    expect(parseStderrJSON(result.stderr).code).toBe("BAD_ARG")
  })

  test("an invalid --lang is rejected", async () => {
    const result = await runCLI(["search", "--lang", "de"])
    expect(result.exitCode).toBe(1)
    expect(parseStderrJSON(result.stderr).code).toBe("BAD_LANG")
  })

  test("detail without an id is rejected", async () => {
    const result = await runCLI(["detail"])
    expect(result.exitCode).toBe(1)
    expect(parseStderrJSON(result.stderr).code).toBe("NO_ID")
  })

  test("detail with an unparseable id is rejected", async () => {
    const result = await runCLI(["detail", "no-digits"])
    expect(result.exitCode).toBe(1)
    expect(parseStderrJSON(result.stderr).code).toBe("BAD_ID")
  })
})

describe.skipIf(!live)("live endpoints", () => {
  // A two-page sweep keeps these honest without hammering the site.
  test("search returns the contract envelope from a live sweep", async () => {
    const result = await runCLI(["search", "--max-pages", "2", "--limit", "5"])
    const payload = parseJSON<{
      meta: {
        count: number
        page: number
        totalResults: number
        totalOpenPostings: number | null
        truncated: boolean
        listingPagesAvailable: number | null
      }
      results: {
        id: string
        title: string
        url: string
        company: string | null
        location: string | null
        closingDate: string | null
      }[]
    }>(result)

    expect(payload.meta.page).toBe(1)
    expect(payload.meta.totalOpenPostings).toBeGreaterThan(0)
    expect(payload.results.length).toBeGreaterThan(0)
    expect(payload.results.length).toBeLessThanOrEqual(5)

    for (const job of payload.results) {
      expect(job.id).toMatch(/^\d+$/)
      expect(job.title.length).toBeGreaterThan(0)
      expect(job.url).toContain("page1800?poster=")
      for (const key of ["company", "location", "closingDate", "salary", "languageRequirement"]) {
        expect(job).toHaveProperty(key)
      }
    }
  })

  test("a partial sweep is flagged as truncated", async () => {
    const result = await runCLI(["search", "--max-pages", "1", "--limit", "1"])
    const payload = parseJSON<{ meta: { truncated: boolean; listingPagesAvailable: number } }>(result)
    // The public listing always runs to many pages, so one page is always partial.
    expect(payload.meta.listingPagesAvailable).toBeGreaterThan(1)
    expect(payload.meta.truncated).toBe(true)
  })

  test("client-side filtering narrows the live result set", async () => {
    const all = await runCLI(["search", "--max-pages", "2"])
    const filtered = await runCLI(["search", "--max-pages", "2", "-l", "Ottawa"])

    const allPayload = parseJSON<{ meta: { totalResults: number } }>(all)
    const filteredPayload = parseJSON<{
      meta: { totalResults: number }
      results: { location: string | null }[]
    }>(filtered)

    expect(filteredPayload.meta.totalResults).toBeLessThanOrEqual(allPayload.meta.totalResults)
    for (const job of filteredPayload.results) {
      expect(job.location?.toLowerCase()).toContain("ottawa")
    }
  })

  test("detail returns either a full poster or a flagged external link", async () => {
    const search = await runCLI(["search", "--max-pages", "1", "--limit", "1"])
    const found = parseJSON<{ results: { id: string }[] }>(search)
    if (found.results.length === 0) return

    const result = await runCLI(["detail", found.results[0].id])
    const job = parseJSON<{
      id: string
      title: string
      description: string | null
      hostedExternally: boolean
      externalUrl: string | null
    }>(result)

    expect(job.id).toBe(found.results[0].id)
    expect(job.title.length).toBeGreaterThan(0)
    expect(job.description).not.toBeNull()
    expect(job.description).not.toContain("<div")

    // Both posting types are valid; each must be internally consistent.
    if (job.hostedExternally) {
      expect(job.externalUrl).toMatch(/^https?:\/\//)
    } else {
      expect(job.externalUrl).toBeNull()
    }
  })
})
