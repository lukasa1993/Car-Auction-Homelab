import { describe, expect, test } from "bun:test";

import {
  buildPageSignature,
  classifySaleTiming,
  createSourceCoverageCounters,
  isRepeatedPage,
  MAX_SOURCE_PAGES,
  planIaaiTraversal,
  shouldContinueCopartTraversal,
  summarizeScopeCoverage,
} from "./coverage";

describe("collector coverage helpers", () => {
  test("copart continues after a non-empty raw page even when zero matches are accepted", () => {
    const decision = shouldContinueCopartTraversal({
      pageIndex: 0,
      rawListingCount: 37,
      acceptedOnPage: 0,
    });

    expect(decision.shouldContinue).toBe(true);
    expect(decision.shouldStop).toBe(false);
    expect(decision.stopReason).toBeNull();
  });

  test("copart marks partial when a repeated page signature is seen", () => {
    const seenPageSignatures = new Set<string>();
    const lotKeys = ["111", "222", "333"];

    expect(buildPageSignature(lotKeys)).toBe("111|222|333");
    expect(isRepeatedPage(lotKeys, seenPageSignatures)).toBe(false);
    expect(isRepeatedPage(lotKeys, seenPageSignatures)).toBe(true);

    const coverage = summarizeScopeCoverage(createSourceCoverageCounters(), "repeated-page");
    expect(coverage.status).toBe("partial");
    expect(coverage.stopReason).toBe("repeated-page");
  });

  test("copart marks partial when the defensive page ceiling is reached", () => {
    const decision = shouldContinueCopartTraversal({
      pageIndex: MAX_SOURCE_PAGES - 1,
      rawListingCount: 12,
      acceptedOnPage: 4,
    });

    expect(decision.shouldContinue).toBe(false);
    expect(decision.shouldStop).toBe(true);
    expect(decision.stopReason).toBe("page-ceiling");

    const coverage = summarizeScopeCoverage(createSourceCoverageCounters(), "page-ceiling");
    expect(coverage.status).toBe("partial");
  });

  test("iaai walks all parsed pages and only caps when the total exceeds the guardrail", () => {
    expect(planIaaiTraversal(12)).toEqual({
      finalPage: 12,
      stopReason: "exhausted",
      status: "complete",
    });

    expect(planIaaiTraversal(75)).toEqual({
      finalPage: MAX_SOURCE_PAGES,
      stopReason: "page-ceiling",
      status: "partial",
    });
  });

  test("seven-day timing filter still excludes future and out-of-window lots", () => {
    const nowIso = "2026-04-16T12:00:00Z";

    expect(classifySaleTiming({ status: "upcoming", auctionDate: "future" }, nowIso)).toBe("outside-window");
    expect(classifySaleTiming({ status: "upcoming", auctionDate: "2026-04-24T12:00:00Z" }, nowIso)).toBe("outside-window");
    expect(classifySaleTiming({ status: "done", auctionDate: "2026-04-16T11:00:00Z" }, nowIso)).toBe("not-upcoming");
    expect(classifySaleTiming({ status: "upcoming", auctionDate: "2026-04-18T12:00:00Z" }, nowIso)).toBeNull();
  });
});
