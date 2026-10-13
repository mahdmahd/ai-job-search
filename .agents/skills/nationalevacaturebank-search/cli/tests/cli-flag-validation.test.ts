import { describe, expect, test } from "bun:test"
import { runCLI } from "./helpers"

function parsedStderr(stderr: string): { error?: string; code?: string } {
  try {
    return JSON.parse(stderr) as { error?: string; code?: string }
  } catch {
    return {}
  }
}

describe("Nationale Vacaturebank CLI flag validation", () => {
  test("missing query and city exits 1 with MISSING_REQUIRED", async () => {
    const result = await runCLI(["search"])
    expect(result.exitCode).toBe(1)
    expect(parsedStderr(result.stderr).code).toBe("MISSING_REQUIRED")
  })

  for (const name of ["distance", "jobage", "page", "limit"]) {
    test(`--${name} rejects a non-numeric value`, async () => {
      const result = await runCLI(["search", "-q", "developer", `--${name}`, "not-a-number"])
      expect(result.exitCode).toBe(1)
      const error = parsedStderr(result.stderr)
      expect(error.code).toBe("BAD_ARG")
      expect(error.error).toMatch(new RegExp(name))
    })
  }

  test("negative page is rejected", async () => {
    const result = await runCLI(["search", "--city", "Amsterdam", "--page", "-1"])
    expect(result.exitCode).toBe(1)
    expect(parsedStderr(result.stderr).code).toBe("BAD_ARG")
  })

  test("detail without an ID exits 1 with NO_ID", async () => {
    const result = await runCLI(["detail"])
    expect(result.exitCode).toBe(1)
    expect(parsedStderr(result.stderr).code).toBe("NO_ID")
  })
})
