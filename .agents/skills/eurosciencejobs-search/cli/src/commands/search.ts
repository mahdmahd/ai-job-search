import {
  SEARCH_BASE,
  htmlFetch,
  parseJobCards,
  siteEncode,
  writeError,
  type JobCard,
} from "../helpers.js";

export interface SearchOpts {
  query: string;
  location?: string;
  jobage?: number;
  page: number;
  limit?: number;
  format: "json" | "table" | "plain";
}

function buildUrl(opts: SearchOpts): string {
  // The site's own JS builds path-based search URLs:
  //   /job_search/keyword/<term>/keyword_location/<term>
  // (query-string ?keyword=... returns an unfiltered page). Terms are encoded
  // lowercase with _ for spaces, exactly as the site's job_search JS does.
  let path = `${SEARCH_BASE}/keyword/${siteEncode(opts.query)}`;
  if (opts.location) {
    path += `/keyword_location/${siteEncode(opts.location)}`;
  }
  return path;
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results.";
  const rows = cards.map((c) => {
    const title = (c.title || "").slice(0, 42).padEnd(42);
    const company = (c.company || "—").slice(0, 26).padEnd(26);
    const loc = (c.location || "—").slice(0, 24).padEnd(24);
    const date = c.date || "—";
    return `${c.id.padEnd(11)} ${title} ${company} ${loc} ${date}`;
  });
  const header =
    "ID".padEnd(11) +
    " " +
    "TITLE".padEnd(42) +
    " " +
    "COMPANY".padEnd(26) +
    " " +
    "LOCATION".padEnd(24) +
    " DATE";
  return [header, "-".repeat(header.length), ...rows].join("\n");
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    let html = await htmlFetch(buildUrl(opts));
    let cards = parseJobCards(html);

    // --jobage has no server-side equivalent on this portal, so filter
    // client-side on the relative "Posted N days ago" label. Cards without a
    // parseable day count pass through (absence of evidence is not recency).
    if (opts.jobage !== undefined) {
      const maxAge = opts.jobage;
      cards = cards.filter((c) => {
        if (!c.date) return true;
        const m = c.date.match(/(\d+)\s*(day|week|month|hour|minute)/i);
        if (!m) {
          // "today" / "yesterday" style labels
          if (/today/i.test(c.date)) return true;
          if (/yesterday/i.test(c.date)) return maxAge >= 1;
          return true;
        }
        const n = parseInt(m[1], 10);
        const unit = m[2].toLowerCase();
        const days =
          unit.startsWith("hour") || unit.startsWith("minute") ? 0 : unit.startsWith("week") ? n * 7 : unit.startsWith("month") ? n * 30 : n;
        return days <= maxAge;
      });
    }

    // No server-side pagination exists; --page slices client-side in chunks
    // of 20 (a generous underestimate of a full results page).
    const PAGE_SIZE = 20;
    const start = (opts.page - 1) * PAGE_SIZE;
    cards = cards.slice(start);
    if (opts.limit !== undefined && opts.limit >= 0)
      cards = cards.slice(0, opts.limit);

    if (opts.format === "table") {
      process.stdout.write(renderTable(cards) + "\n");
    } else if (opts.format === "plain") {
      process.stdout.write(
        cards
          .map(
            (c) =>
              `${c.title}\n  ${c.company || "—"} · ${c.location || "—"} · ${c.date || "—"}\n  id: ${c.id}\n  ${c.url}`,
          )
          .join("\n\n") + "\n",
      );
    } else {
      process.stdout.write(
        JSON.stringify(
          { meta: { count: cards.length, page: opts.page }, results: cards },
          null,
          2,
        ) + "\n",
      );
    }
    return 0;
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "SEARCH_FAILED");
    return 1;
  }
}
