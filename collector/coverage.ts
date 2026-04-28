import { DateTime } from "luxon";

export const MAX_SOURCE_PAGES = 50;

export type FilterReason =
  | "duplicate"
  | "identity"
  | "vin"
  | "year"
  | "not-upcoming"
  | "outside-window"
  | "missing-lot-number";

export type ScopeStopReason = "exhausted" | "repeated-page" | "page-ceiling" | "unexpected-empty-page";
export type ScopeCoverageStatus = "complete" | "partial";

export interface SourceCoverageCounters {
  rawPages: number;
  rawListings: number;
  uniqueLots: number;
  acceptedLots: number;
  filtered: Record<FilterReason, number>;
  // Up to MAX_FILTER_SAMPLES short strings per reason (e.g. rejected VIN,
  // identity title, etc.). Lets the diagnostic endpoint distinguish
  // "year code wrong" from "prefix wrong" without re-running with debug.
  samples: Record<FilterReason, string[]>;
}

export const MAX_FILTER_SAMPLES = 5;

export interface SaleWindowRecord {
  auctionDate: string;
  status: string;
}

export interface ScopeCoverageSummary {
  status: ScopeCoverageStatus;
  stopReason: ScopeStopReason;
  notes: string;
}

export interface CopartTraversalDecision {
  shouldStop: boolean;
  shouldContinue: boolean;
  stopReason: ScopeStopReason | null;
}

const FILTER_REASON_LABELS: Record<FilterReason, string> = {
  duplicate: "dup",
  identity: "id",
  vin: "vin",
  year: "year",
  "not-upcoming": "notUp",
  "outside-window": "outWin",
  "missing-lot-number": "noLot",
};

export function createSourceCoverageCounters(): SourceCoverageCounters {
  return {
    rawPages: 0,
    rawListings: 0,
    uniqueLots: 0,
    acceptedLots: 0,
    filtered: {
      duplicate: 0,
      identity: 0,
      vin: 0,
      year: 0,
      "not-upcoming": 0,
      "outside-window": 0,
      "missing-lot-number": 0,
    },
    samples: {
      duplicate: [],
      identity: [],
      vin: [],
      year: [],
      "not-upcoming": [],
      "outside-window": [],
      "missing-lot-number": [],
    },
  };
}

export function recordRawPage(counters: SourceCoverageCounters, listingCount: number): void {
  counters.rawPages += 1;
  counters.rawListings += Math.max(0, Number(listingCount) || 0);
}

export function recordUniqueLot(counters: SourceCoverageCounters): void {
  counters.uniqueLots += 1;
}

export function recordAcceptedLot(counters: SourceCoverageCounters): void {
  counters.acceptedLots += 1;
}

export function incrementFilterReason(
  counters: SourceCoverageCounters,
  reason: FilterReason,
  sample?: string | null | undefined,
): void {
  counters.filtered[reason] += 1;
  if (sample) {
    const list = counters.samples[reason];
    if (list.length < MAX_FILTER_SAMPLES && !list.includes(sample)) {
      list.push(sample);
    }
  }
}

export function isUpcomingStatus(record: SaleWindowRecord, nowIso: string): boolean {
  if (record.status === "done") {
    return false;
  }
  if (record.auctionDate === "future") {
    return true;
  }
  if (record.auctionDate) {
    if (record.auctionDate.includes("T")) {
      const scheduled = DateTime.fromISO(record.auctionDate, { setZone: true });
      const now = DateTime.fromISO(nowIso);
      if (scheduled.isValid && now.isValid) {
        return scheduled >= now;
      }
    }
    return record.auctionDate >= nowIso.slice(0, 10);
  }
  return record.status === "upcoming";
}

export function isWithinSaleWindow(record: SaleWindowRecord, nowIso: string, saleWindowDays = 7): boolean {
  if (!record.auctionDate || record.auctionDate === "future") {
    return false;
  }
  const now = DateTime.fromISO(nowIso);
  const windowEnd = now.plus({ days: saleWindowDays }).endOf("day");
  if (record.auctionDate.includes("T")) {
    const scheduled = DateTime.fromISO(record.auctionDate, { setZone: true });
    return scheduled.isValid && scheduled >= now && scheduled <= windowEnd;
  }
  const scheduledDate = DateTime.fromISO(record.auctionDate).endOf("day");
  return scheduledDate.isValid && scheduledDate >= now.startOf("day") && scheduledDate <= windowEnd;
}

export function classifySaleTiming(record: SaleWindowRecord, nowIso: string): "not-upcoming" | "outside-window" | null {
  if (!isUpcomingStatus(record, nowIso)) {
    return "not-upcoming";
  }
  if (!isWithinSaleWindow(record, nowIso)) {
    return "outside-window";
  }
  return null;
}

export function buildPageSignature(values: Array<string | null | undefined>): string {
  return values.map((value) => String(value || "").trim() || "<empty>").join("|");
}

export function isRepeatedPage(rawLotKeys: Array<string | null | undefined>, seenPageSignatures: Set<string>): boolean {
  const signature = buildPageSignature(rawLotKeys);
  if (seenPageSignatures.has(signature)) {
    return true;
  }
  seenPageSignatures.add(signature);
  return false;
}

export function shouldContinueCopartTraversal({
  pageIndex,
  rawListingCount,
  acceptedOnPage,
  maxPages = MAX_SOURCE_PAGES,
}: {
  pageIndex: number;
  rawListingCount: number;
  acceptedOnPage: number;
  maxPages?: number;
}): CopartTraversalDecision {
  void acceptedOnPage;
  if (rawListingCount === 0) {
    return { shouldStop: true, shouldContinue: false, stopReason: "exhausted" };
  }
  if (pageIndex + 1 >= maxPages) {
    return { shouldStop: true, shouldContinue: false, stopReason: "page-ceiling" };
  }
  return { shouldStop: false, shouldContinue: true, stopReason: null };
}

export function planIaaiTraversal(totalPages: number, maxPages = MAX_SOURCE_PAGES): {
  finalPage: number;
  stopReason: ScopeStopReason;
  status: ScopeCoverageStatus;
} {
  const normalizedTotalPages = Math.max(1, Number(totalPages) || 0);
  if (normalizedTotalPages > maxPages) {
    return {
      finalPage: maxPages,
      stopReason: "page-ceiling",
      status: "partial",
    };
  }
  return {
    finalPage: normalizedTotalPages,
    stopReason: "exhausted",
    status: "complete",
  };
}

export function summarizeScopeCoverage(counters: SourceCoverageCounters, stopReason: ScopeStopReason): ScopeCoverageSummary {
  const status: ScopeCoverageStatus = stopReason === "exhausted" ? "complete" : "partial";
  const filtered = (Object.entries(counters.filtered) as Array<[FilterReason, number]>)
    .map(([reason, count]) => `${FILTER_REASON_LABELS[reason]}=${count}`)
    .join(",");
  const sampleParts: string[] = [];
  for (const [reason, list] of Object.entries(counters.samples) as Array<[FilterReason, string[]]>) {
    if (list.length > 0) {
      sampleParts.push(`${FILTER_REASON_LABELS[reason]}=${list.join("|")}`);
    }
  }
  const samples = sampleParts.length > 0 ? ` samples[${sampleParts.join(";")}]` : "";
  return {
    status,
    stopReason,
    notes: `pages=${counters.rawPages} raw=${counters.rawListings} unique=${counters.uniqueLots} accepted=${counters.acceptedLots} filtered[${filtered}]${samples} stop=${stopReason}`,
  };
}

export function buildScopeCoverageLog({
  sourceKey,
  targetKey,
  counters,
  stopReason,
  status,
}: {
  sourceKey: string;
  targetKey: string;
  counters: SourceCoverageCounters;
  stopReason: ScopeStopReason;
  status: ScopeCoverageStatus;
}): Record<string, unknown> {
  return {
    message: "collector-scope-coverage",
    sourceKey,
    targetKey,
    status,
    stopReason,
    rawPages: counters.rawPages,
    rawListings: counters.rawListings,
    uniqueLots: counters.uniqueLots,
    acceptedLots: counters.acceptedLots,
    filtered: { ...counters.filtered },
  };
}
