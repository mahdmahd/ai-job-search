import { describe, expect, test } from "bun:test";
import {
  parseJobCards,
  parseTotalCount,
  RESULT_KEYS,
} from "../src/helpers";
import {
  CARD_COMPLETE,
  CARD_MALFORMED,
  CARD_NO_DEADLINE,
  SEARCH_PAGE,
  SEARCH_PAGE_NO_PAGER,
} from "./fixtures";

describe("parseJobCards (fixture markup)", () => {
  const cards = parseJobCards(SEARCH_PAGE);

  test("parses the two well-formed cards and skips the malformed one", () => {
    expect(cards.length).toBe(2);
  });

  test("extracts id and canonical url from the /jobs/<id> anchor", () => {
    expect(cards[0].id).toBe("472465");
    expect(cards[0].url).toBe("https://euraxess.ec.europa.eu/jobs/472465");
    expect(cards[1].id).toBe("472460");
  });

  test("extracts the title span text, entities decoded", () => {
    expect(cards[0].title).toBe("PhD Candidate on Resilient Coastal Structures");
    expect(cards[1].title).toBe("Postdoctoral Researcher in Active Rooftops");
  });

  test("extracts organisation from the first primary-meta item", () => {
    expect(cards[0].company).toBe("TU Delft");
    expect(cards[1].company).toBe("University of Aveiro");
  });

  test("extracts the verbatim posted date", () => {
    expect(cards[0].date).toBe("13 October 2026");
  });

  test("extracts the work-locations text", () => {
    expect(cards[0].location).toBe(
      "Number of offers: 1, Netherlands, TU Delft, 2628 CN, Delft, Stevinweg 1",
    );
    expect(cards[1].location).toContain("Portugal");
    expect(cards[1].location).toContain("Aveiro");
  });

  test("extracts the ISO deadline attribute; absent deadline is null", () => {
    expect(cards[0].deadline).toBe("2026-11-01T23:59:59+00:00");
    expect(cards[1].deadline).toBeNull();
  });

  test("extracts the description snippet with entities decoded", () => {
    expect(cards[0].snippet).toContain(
      "hydraulic engineering & coastal resilience",
    );
    expect(cards[1].snippet).toContain("Active RoofTops South Europe");
  });

  test("every result carries all contract keys, nulls included", () => {
    for (const card of cards) {
      for (const key of RESULT_KEYS) {
        expect(Object.hasOwn(card, key)).toBe(true);
      }
    }
  });

  test("a card split across multiple articles still parses independently", () => {
    const cards = parseJobCards(
      `<ul>${CARD_COMPLETE}</ul><ul>${CARD_NO_DEADLINE}</ul>`,
    );
    expect(cards.length).toBe(2);
  });

  test("returns empty (not a crash) for a response with no cards", () => {
    expect(parseJobCards("<html><body>nothing here</body></html>")).toEqual([]);
  });

  test("ignores job data embedded in scripts (no <article> wrapper)", () => {
    const html = `<script>{"id":"472444","title":"Research-Technical Employee"}</script>${CARD_COMPLETE}`;
    const cards = parseJobCards(html);
    expect(cards.length).toBe(1);
    expect(cards[0].id).toBe("472465");
  });
});

describe("parseTotalCount (pagination footer)", () => {
  test("computes lastPage * 10 from the last-page link", () => {
    expect(parseTotalCount(SEARCH_PAGE)).toBe(590);
  });

  test("returns null when no pager is rendered", () => {
    expect(parseTotalCount(SEARCH_PAGE_NO_PAGER)).toBeNull();
  });
});
