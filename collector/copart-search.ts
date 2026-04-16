import { DateTime } from "luxon";

export interface CopartSearchFilterPayload {
  filter: Record<string, string[]>;
  includeTagByField: Record<string, string>;
}

function formatCopartUtcBoundary(value: DateTime): string {
  return value.toUTC().toFormat("yyyy-MM-dd'T'HH:mm:ss'Z'");
}

export function buildCopartSaleDateWindowFilter(nowIso: string, saleWindowDays = 7): CopartSearchFilterPayload {
  const now = DateTime.fromISO(nowIso);
  const windowStart = (now.isValid ? now : DateTime.utc()).startOf("day");
  const windowEnd = (now.isValid ? now : windowStart).plus({ days: saleWindowDays }).endOf("day");
  const range = `auction_date_utc:["${formatCopartUtcBoundary(windowStart)}" TO "${formatCopartUtcBoundary(windowEnd)}"]`;

  return {
    filter: {
      SDAT: [range],
    },
    includeTagByField: {
      SDAT: "{!tag=SDAT}",
    },
  };
}

// Copart sometimes marks future-sale lots with `adt: "F"` while still returning a concrete
// `ad` timestamp that participates in the native sale-date filter. Trust the timestamp whenever
// it is present and plausible, and let the 7-day timing filter decide whether the lot stays.
export function getCopartScheduledAuctionMillis(item: { ad?: unknown }, nowIso: string): number | null {
  const ms = item?.ad;
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms <= 0) {
    return null;
  }

  const when = DateTime.fromMillis(ms);
  if (!when.isValid) {
    return null;
  }

  const now = DateTime.fromISO(nowIso);
  if (now.isValid) {
    const earliest = now.minus({ days: 2 });
    const latest = now.plus({ years: 1 });
    if (when < earliest || when > latest) {
      return null;
    }
  }

  return ms;
}
