// Command-level tests with a mocked fetch — no network. Mirrors the
// freehire-search commands test structure.
import { afterEach, describe, expect, test } from "bun:test";
import { runSearch, type SearchOpts } from "../src/commands/search";
import { runDetail } from "../src/commands/detail";
import type { FlowxtraJobSummary } from "../src/helpers";

const originalFetch = globalThis.fetch;
const originalStdoutWrite = process.stdout.write;
const originalStderrWrite = process.stderr.write;

function captureStdout(): { get: () => string } {
  let buf = "";
  process.stdout.write = ((chunk: string | Uint8Array) => {
    buf += chunk.toString();
    return true;
  }) as typeof process.stdout.write;
  return { get: () => buf };
}

function captureStderr(): { get: () => string } {
  let buf = "";
  process.stderr.write = ((chunk: string | Uint8Array) => {
    buf += chunk.toString();
    return true;
  }) as typeof process.stderr.write;
  return { get: () => buf };
}

let lastFetchedUrl = "";

function mockFetch(status: number, body: unknown): void {
  globalThis.fetch = (async (input: string | URL | Request) => {
    lastFetchedUrl = String(input);
    return new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

function job(overrides: Partial<FlowxtraJobSummary> = {}): FlowxtraJobSummary {
  return {
    has_id: "M88PB",
    title: "Operario/a de envasado",
    workplace: "On-site",
    currency: "EUR",
    date_share: "2026-07-23T16:22:27.000000Z",
    min_salary: 21000,
    max_salary: null,
    salary: null,
    rate_salary: "year",
    name_company: "Arogreen",
    city_company: "",
    state_company: "Barcelona",
    country_company: "Spain",
    employment_types: [{ name: "Full-time" }],
    urlJobApplay: "https://flowxtra.com/apply/M88PB",
    ...overrides,
  };
}

function listEnvelope(jobs: FlowxtraJobSummary[], total = jobs.length) {
  return {
    success: true,
    data: { current_page: 1, last_page: 3, total, data: jobs },
    message: "200",
  };
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.stdout.write = originalStdoutWrite;
  process.stderr.write = originalStderrWrite;
});

const searchOpts: SearchOpts = {
  jobage: 9999,
  page: 1,
  limit: 25,
  format: "json",
};

describe("runSearch (mocked fetch)", () => {
  test("emits the contract envelope with meta and null-safe results", async () => {
    mockFetch(200, listEnvelope([job()], 116));
    const out = captureStdout();

    const code = await runSearch({ ...searchOpts, query: "envasado" });
    expect(code).toBe(0);

    const parsed = JSON.parse(out.get());
    expect(parsed.meta).toEqual({ count: 1, page: 1, total: 116, last_page: 3 });
    expect(parsed.results).toHaveLength(1);
    expect(parsed.results[0]).toEqual({
      id: "M88PB",
      title: "Operario/a de envasado",
      company: "Arogreen",
      location: "Barcelona, Spain",
      date: "2026-07-23T16:22:27.000000Z",
      url: "https://flowxtra.com/apply/M88PB",
      workplace: "On-site",
      salary: "EUR 21000/year",
    });
  });

  test("builds the server-side query params the API expects", async () => {
    mockFetch(200, listEnvelope([]));
    captureStdout();

    await runSearch({
      ...searchOpts,
      query: "sales",
      location: "Spain",
      workplace: "Remote",
      company: "Arogreen",
      page: 2,
      limit: 10,
    });

    const url = new URL(lastFetchedUrl);
    expect(url.pathname.endsWith("/central/jobs")).toBe(true);
    expect(url.searchParams.get("search-key")).toBe("sales");
    expect(url.searchParams.get("location")).toBe("Spain");
    expect(url.searchParams.get("workplace")).toBe("Remote");
    expect(url.searchParams.get("company_name")).toBe("Arogreen");
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("per_page")).toBe("10");
  });

  test("--jobage filters client-side on date_share (API has no age param)", async () => {
    mockFetch(
      200,
      listEnvelope([
        job(),
        job({ has_id: "OLD01", title: "Old role", date_share: "2020-01-01T00:00:00.000000Z" }),
      ]),
    );
    const out = captureStdout();

    // A far-future-proof cutoff isn't possible with a fixed fixture date, so
    // use a huge window for the fresh job and rely on 2020 being past any
    // realistic cutoff for the old one.
    const code = await runSearch({ ...searchOpts, jobage: 36500 });
    expect(code).toBe(0);
    let parsed = JSON.parse(out.get());
    expect(parsed.results).toHaveLength(2);

    const out2 = captureStdout();
    await runSearch({ ...searchOpts, jobage: 30 });
    parsed = JSON.parse(out2.get());
    const ids = parsed.results.map((r: { id: string }) => r.id);
    expect(ids).not.toContain("OLD01");
    // The age param never reaches the server.
    expect(new URL(lastFetchedUrl).searchParams.has("jobage")).toBe(false);
  });

  test("a 5xx after retries exits 1 with a JSON error on stderr", async () => {
    // Immediate-failure variant: make fetch throw so there is no retry loop.
    globalThis.fetch = (async () => {
      throw new Error("connect ECONNREFUSED");
    }) as typeof fetch;
    const err = captureStderr();

    const code = await runSearch({ ...searchOpts });
    expect(code).toBe(1);
    const parsed = JSON.parse(err.get());
    expect(parsed.code).toBe("SEARCH_FAILED");
    expect(parsed.error).toContain("could not reach");
  });
});

describe("runDetail (mocked fetch)", () => {
  test("emits the detail shape with a cleaned description", async () => {
    mockFetch(200, {
      success: true,
      data: {
        has_id: "M88PB",
        title: "Operario/a de envasado",
        workplace: "On-site",
        seniority: "Midlevel",
        description: "<p>En Arogreen buscamos.</p>",
        currency: "EUR",
        min_salary: 21000,
        max_salary: null,
        salary: null,
        rate_salary: "year",
        urlJobApplay: "https://arogreen.postular.link/job/operarioa-de-envasado/M88PB",
        company: { name: "Arogreen", website: "https://www.arogreen.com" },
        job_type_job: [{ name: "Full-time" }],
        company_office: { address: null, country: { name: "Spain" }, state: { name: "Barcelona" } },
      },
    });
    const out = captureStdout();

    const code = await runDetail({ id: "M88PB", format: "json" });
    expect(code).toBe(0);
    const parsed = JSON.parse(out.get());
    expect(parsed.id).toBe("M88PB");
    expect(parsed.description).toBe("En Arogreen buscamos.");
    expect(parsed.employment_types).toEqual(["Full-time"]);
    expect(parsed.url).toBe("https://arogreen.postular.link/job/operarioa-de-envasado/M88PB");
  });

  test("a 404 exits 1 with NOT_FOUND", async () => {
    mockFetch(404, { success: false, message: "Central job not found" });
    const err = captureStderr();

    const code = await runDetail({ id: "ZZZZZ99", format: "json" });
    expect(code).toBe(1);
    expect(JSON.parse(err.get()).code).toBe("NOT_FOUND");
  });

  test("accepts a full apply URL as the id", async () => {
    mockFetch(200, {
      success: true,
      data: {
        has_id: "L99OW",
        title: "sales",
        workplace: "Remote",
        seniority: null,
        description: "",
        currency: "EUR",
        min_salary: 100,
        max_salary: null,
        salary: null,
        rate_salary: "monthly",
        urlJobApplay: "https://3s-spring.apply-link.net/job/sales/L99OW",
        company: { name: "3S Spring", website: null },
        job_type_job: [{ name: "Internship" }],
        company_office: { address: "BIZERT", country: { name: "Tunisia" }, state: { name: "Bizerte" } },
      },
    });
    captureStdout();

    const code = await runDetail({ id: "https://flowxtra.com/apply/L99OW", format: "json" });
    expect(code).toBe(0);
    expect(lastFetchedUrl).toContain("/candidate/jobs/L99OW");
  });
});
