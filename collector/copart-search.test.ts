import { describe, expect, test } from "bun:test";

import { buildCopartSaleDateWindowFilter, getCopartScheduledAuctionMillis } from "./copart-search";

describe("copart search helpers", () => {
  test("builds the native Copart sale-date window filter payload", () => {
    expect(buildCopartSaleDateWindowFilter("2026-04-16T12:34:56Z")).toEqual({
      filter: {
        SDAT: ['auction_date_utc:["2026-04-16T00:00:00Z" TO "2026-04-23T23:59:59Z"]'],
      },
      includeTagByField: {
        SDAT: "{!tag=SDAT}",
      },
    });
  });

  test("trusts Copart ad timestamps even when adt future-style lots are returned", () => {
    const ms = Date.parse("2026-04-20T12:00:00Z");

    expect(getCopartScheduledAuctionMillis({ ad: ms }, "2026-04-16T12:00:00Z")).toBe(ms);
  });

  test("rejects missing or implausible Copart ad timestamps", () => {
    expect(getCopartScheduledAuctionMillis({}, "2026-04-16T12:00:00Z")).toBeNull();
    expect(getCopartScheduledAuctionMillis({ ad: Date.parse("2035-01-01T00:00:00Z") }, "2026-04-16T12:00:00Z")).toBeNull();
  });
});
