// Network-free unit tests for the pure helpers: id normalization, HTML
// cleaning, salary formatting, and wire→contract reshaping.
import { describe, expect, test } from "bun:test";
import {
  cleanHtml,
  formatSalary,
  joinLocation,
  normalizeId,
  toDetail,
  toResult,
  type FlowxtraJobDetail,
  type FlowxtraJobSummary,
} from "../src/helpers";

describe("normalizeId", () => {
  test("accepts a bare has_id", () => {
    expect(normalizeId("M88PB")).toBe("M88PB");
    expect(normalizeId("  KrrNz  ")).toBe("KrrNz");
  });

  test("extracts from a flowxtra.com apply URL, with or without locale", () => {
    expect(normalizeId("https://flowxtra.com/apply/M88PB")).toBe("M88PB");
    expect(normalizeId("https://flowxtra.com/en/apply/M88PB")).toBe("M88PB");
  });

  test("extracts from a per-company career-page URL", () => {
    expect(normalizeId("https://arogreen.postular.link/job/operarioa-de-envasado/M88PB")).toBe("M88PB");
    expect(normalizeId("https://3s-spring.apply-link.net/job/sales/L99OW?utm=x")).toBe("L99OW");
  });

  test("rejects unparseable input", () => {
    expect(normalizeId("")).toBeNull();
    expect(normalizeId("https://example.com/careers/123")).toBeNull();
    expect(normalizeId("not a slug!")).toBeNull();
  });
});

describe("cleanHtml", () => {
  test("strips tags, decodes entities, keeps paragraph breaks", () => {
    const html = "<p>En Arogreen buscamos un/a&nbsp;Operario/a.</p><ul><li>Envasado &amp; control</li></ul>";
    const text = cleanHtml(html);
    expect(text).toContain("En Arogreen buscamos un/a Operario/a.");
    expect(text).toContain("Envasado & control");
    expect(text).not.toContain("<");
  });

  test("null for empty input", () => {
    expect(cleanHtml("")).toBeNull();
    expect(cleanHtml(null)).toBeNull();
  });
});

describe("formatSalary", () => {
  test("min only", () => {
    expect(formatSalary("EUR", 21000, null, null, "year")).toBe("EUR 21000/year");
  });
  test("range", () => {
    expect(formatSalary("USD", 100000, 300000, null, "year")).toBe("USD 100000–300000/year");
  });
  test("fixed salary wins over min/max", () => {
    expect(formatSalary("EUR", 1, null, 500, "month")).toBe("EUR 500/month");
  });
  test("max only", () => {
    expect(formatSalary("EUR", null, 90, null, "hour")).toBe("EUR up to 90/hour");
  });
  test("null when unset", () => {
    expect(formatSalary("EUR", null, null, null, "monthly")).toBeNull();
  });
});

describe("joinLocation", () => {
  test("joins non-empty parts", () => {
    expect(joinLocation("", "Barcelona", "Spain")).toBe("Barcelona, Spain");
  });
  test("null when everything is empty", () => {
    expect(joinLocation("", "", null)).toBeNull();
  });
});

function summary(overrides: Partial<FlowxtraJobSummary> = {}): FlowxtraJobSummary {
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

describe("toResult", () => {
  test("maps the contract fields with null-never-omitted semantics", () => {
    expect(toResult(summary())).toEqual({
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

  test("empty strings become null", () => {
    const r = toResult(
      summary({ name_company: "", city_company: "", state_company: "", country_company: "", min_salary: null }),
    );
    expect(r.company).toBeNull();
    expect(r.location).toBeNull();
    expect(r.salary).toBeNull();
  });
});

describe("toDetail", () => {
  test("maps detail fields; description is cleaned; date is null by design", () => {
    const detail: FlowxtraJobDetail = {
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
      company_office: {
        address: "Flassaders 18",
        country: { name: "Spain" },
        state: { name: "Barcelona" },
      },
    };
    const d = toDetail(detail);
    expect(d.id).toBe("M88PB");
    expect(d.company).toBe("Arogreen");
    expect(d.company_website).toBe("https://www.arogreen.com");
    expect(d.location).toBe("Barcelona, Spain");
    expect(d.seniority).toBe("Midlevel");
    expect(d.employment_types).toEqual(["Full-time"]);
    expect(d.salary).toBe("EUR 21000/year");
    expect(d.description).toBe("En Arogreen buscamos.");
    // The detail endpoint serializes date_share as null (see url-reference.md).
    expect(d.date).toBeNull();
    // Detail carries the company's own career-page apply URL.
    expect(d.url).toBe("https://arogreen.postular.link/job/operarioa-de-envasado/M88PB");
  });

  test("survives a null office", () => {
    const d = toDetail({
      has_id: "X",
      title: "T",
      workplace: "Remote",
      seniority: null,
      description: "",
      currency: "EUR",
      min_salary: null,
      max_salary: null,
      salary: null,
      rate_salary: "monthly",
      urlJobApplay: "https://flowxtra.com/apply/X",
      company: { name: "Co", website: null },
      job_type_job: [],
      company_office: null,
    });
    expect(d.location).toBeNull();
    expect(d.description).toBeNull();
    expect(d.employment_types).toEqual([]);
  });
});
