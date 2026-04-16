import { describe, expect, test } from "bun:test";

import { appendIaaiSaleDateFacetSearches, buildIaaiSaleDateFacetSearches, normalizeIaaiSearchEntries } from "./iaai-search";

describe("iaai search helpers", () => {
  test("builds exact AuctionDate facet searches for the full rolling window", () => {
    const entries = buildIaaiSaleDateFacetSearches("2026-04-16T18:20:00Z");

    expect(entries).toHaveLength(8);
    expect(entries[0]).toEqual({
      Facets: [{ Group: "AuctionDate", Value: "04162026" }],
      FullSearch: null,
      LongDiscretes: null,
      LongRanges: null,
    });
    expect(entries[7]).toEqual({
      Facets: [{ Group: "AuctionDate", Value: "04232026" }],
      FullSearch: null,
      LongDiscretes: null,
      LongRanges: null,
    });
  });

  test("normalizes facet-only searches instead of dropping them", () => {
    expect(normalizeIaaiSearchEntries([
      { Facets: [{ Group: "AuctionDate", Value: "AuctionToday" }], FullSearch: null, LongRanges: null, LongDiscretes: null },
      { Facets: null, FullSearch: " 2023 Tesla Model 3 ", LongRanges: null, LongDiscretes: null },
      { Facets: null, FullSearch: " ", LongRanges: null, LongDiscretes: null },
    ])).toEqual([
      { Facets: [{ Group: "AuctionDate", Value: "AuctionToday" }], FullSearch: null, LongRanges: null, LongDiscretes: null },
      { Facets: null, FullSearch: "2023 Tesla Model 3", LongRanges: null, LongDiscretes: null },
    ]);
  });

  test("replaces existing AuctionDate facet searches with the exact rolling window", () => {
    const entries = appendIaaiSaleDateFacetSearches([
      { Facets: null, FullSearch: "2023 Tesla Model 3", LongRanges: null, LongDiscretes: null },
      { Facets: [{ Group: "AuctionDate", Value: "ThisWeek" }], FullSearch: null, LongRanges: null, LongDiscretes: null },
    ], "2026-04-16T18:20:00Z");

    expect(entries[0]).toEqual({
      Facets: null,
      FullSearch: "2023 Tesla Model 3",
      LongRanges: null,
      LongDiscretes: null,
    });
    expect(entries.slice(1)).toHaveLength(8);
    expect(entries.slice(1).every((entry) => Array.isArray(entry.Facets) && entry.Facets[0]?.Group === "AuctionDate")).toBe(true);
    expect(entries.some((entry) => Array.isArray(entry.Facets) && entry.Facets[0]?.Value === "ThisWeek")).toBe(false);
  });
});
