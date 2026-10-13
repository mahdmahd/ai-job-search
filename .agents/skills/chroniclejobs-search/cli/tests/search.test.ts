import { afterEach, describe, expect, test } from "bun:test";
import { runSearch, buildUrl } from "../src/commands/search";
import { parseJobCards } from "../src/helpers";

// Offline tests: fetch is stubbed, so nothing here touches the network.

const originalFetch = globalThis.fetch;
const originalStdoutWrite = process.stdout.write;

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.stdout.write = originalStdoutWrite;
});

function cardHtml(id: string, title: string): string {
  return `<li class="lister__item cf" id="item-${id}">
    <div class="lister__details cf js-clickable">
      <h3 class="lister__header"><a href=" /job/${id}/slug-${id}/ " class="js-clickable-area-link"><span>${title}</span></a></h3>
      <ul class="lister__meta">
        <li class="lister__meta-item lister__meta-item--location">Madison, Wisconsin</li>
        <li class="lister__meta-item lister__meta-item--recruiter">Example University</li>
        <li class="lister__meta-item lister__meta-item--salary"></li>
      </ul>
      <div class="lister__description js-clamp-2">A fine job.</div>
      <div class="lister__footer cf"></div>
    </div>
  </li>`;
}

async function captureStdout(fn: () => Promise<number>): Promise<{ code: number; out: string }> {
  let out = "";
  process.stdout.write = ((chunk: string | Uint8Array) => {
    out += chunk.toString();
    return true;
  }) as typeof process.stdout.write;
  const code = await fn();
  return { code, out };
}

describe("runSearch (stubbed fetch)", () => {
  test("emits the contract envelope with meta.count/page and always-present result keys", async () => {
    globalThis.fetch = (async () =>
      new Response(cardHtml("1", "Dean of Students") + cardHtml("2", "Postdoctoral Fellow"))) as typeof fetch;

    const { code, out } = await captureStdout(() =>
      runSearch({ query: "dean", page: 2, format: "json" }),
    );

    expect(code).toBe(0);
    const parsed = JSON.parse(out);
    expect(parsed.meta).toEqual({ count: 2, page: 2 });
    expect(parsed.results).toHaveLength(2);
    for (const r of parsed.results) {
      for (const k of ["id", "title", "company", "location", "date", "url", "salary", "snippet"]) {
        expect(Object.keys(r)).toContain(k);
      }
      // this board exposes no date anchor on search cards — null, not omitted
      expect(r.date).toBeNull();
      expect(r.salary).toBeNull(); // empty salary li
      expect(r.url).toMatch(/^https:\/\/jobs\.chronicle\.com\/job\/\d+\/slug-\d+\/$/);
    }
  });

  test("--limit caps results client-side", async () => {
    globalThis.fetch = (async () =>
      new Response(cardHtml("1", "A") + cardHtml("2", "B") + cardHtml("3", "C"))) as typeof fetch;

    const { code, out } = await captureStdout(() =>
      runSearch({ query: "postdoc", page: 1, limit: 2, format: "json" }),
    );

    expect(code).toBe(0);
    const parsed = JSON.parse(out);
    expect(parsed.meta.count).toBe(2);
    expect(parsed.results).toHaveLength(2);
  });

  test("zero hits render as 'No results.' in table format with exit 0", async () => {
    globalThis.fetch = (async () => new Response("<html><body>nothing here</body></html>")) as typeof fetch;

    const { code, out } = await captureStdout(() =>
      runSearch({ query: "zzzznonexistent", page: 1, format: "table" }),
    );

    expect(code).toBe(0);
    expect(out).toContain("No results.");
  });
});

describe("buildUrl", () => {
  test("sends Keywords and 1-indexed Page params", () => {
    expect(buildUrl({ query: "PhD candidate", page: 3, format: "json" })).toBe(
      "https://jobs.chronicle.com/searchjobs/?Keywords=PhD+candidate&Page=3",
    );
  });

  test("URL-encodes special characters in the query", () => {
    expect(buildUrl({ query: "dean of students & provost", page: 1, format: "json" })).toBe(
      "https://jobs.chronicle.com/searchjobs/?Keywords=dean+of+students+%26+provost&Page=1",
    );
  });
});

describe("parseJobCards on realistic page scaffolding", () => {
  test("finds cards inside a full Madgex page with ads and paginator", () => {
    const page = `<html><body>
      <ul id="listing" class="lister cf block">
        <li class="lister__item lister__item--ads lister__item--ads--empty"></li>
        ${cardHtml("11111111", "Assistant Professor")}
      </ul>
      <div class="ad ad--lister block"></div>
      <ul class="paginator__items"><li class="paginator__item">2</li></ul>
    </body></html>`;
    const cards = parseJobCards(page);
    expect(cards).toHaveLength(1);
    expect(cards[0].title).toBe("Assistant Professor");
    expect(cards[0].company).toBe("Example University");
  });
});
