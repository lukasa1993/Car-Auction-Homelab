import { DateTime } from "luxon";

export interface IaaiSearchEntry {
  Facets?: unknown;
  FullSearch?: string | null;
  LongRanges?: unknown;
  LongDiscretes?: unknown;
}

function formatIaaiAuctionDateFacetValue(value: DateTime): string {
  return value.toFormat("MMddyyyy");
}

function hasSearchCriteria(entry: IaaiSearchEntry): boolean {
  if (String(entry.FullSearch || "").trim()) {
    return true;
  }
  if (Array.isArray(entry.Facets) && entry.Facets.length > 0) {
    return true;
  }
  if (Array.isArray(entry.LongRanges) && entry.LongRanges.length > 0) {
    return true;
  }
  if (Array.isArray(entry.LongDiscretes) && entry.LongDiscretes.length > 0) {
    return true;
  }
  return false;
}

function isAuctionDateFacetEntry(entry: IaaiSearchEntry): boolean {
  return Array.isArray(entry.Facets) && entry.Facets.some((facet) => facet && typeof facet === "object" && facet.Group === "AuctionDate");
}

export function normalizeIaaiSearchEntries(entries: IaaiSearchEntry[]): IaaiSearchEntry[] {
  return entries
    .map((entry) => ({
      Facets: entry?.Facets ?? null,
      FullSearch: entry?.FullSearch == null ? null : String(entry.FullSearch).trim(),
      LongRanges: entry?.LongRanges ?? null,
      LongDiscretes: entry?.LongDiscretes ?? null,
    }))
    .filter(hasSearchCriteria);
}

export function buildIaaiSaleDateFacetSearches(nowIso: string, saleWindowDays = 7): IaaiSearchEntry[] {
  const start = DateTime.fromISO(nowIso);
  const dayZero = (start.isValid ? start : DateTime.utc()).startOf("day");
  const entries: IaaiSearchEntry[] = [];

  for (let offset = 0; offset <= saleWindowDays; offset += 1) {
    const current = dayZero.plus({ days: offset });
    entries.push({
      Facets: [{ Group: "AuctionDate", Value: formatIaaiAuctionDateFacetValue(current) }],
      FullSearch: null,
      LongDiscretes: null,
      LongRanges: null,
    });
  }

  return entries;
}

export function appendIaaiSaleDateFacetSearches(entries: IaaiSearchEntry[], nowIso: string, saleWindowDays = 7): IaaiSearchEntry[] {
  const normalized = normalizeIaaiSearchEntries(entries).filter((entry) => !isAuctionDateFacetEntry(entry));
  return [...normalized, ...buildIaaiSaleDateFacetSearches(nowIso, saleWindowDays)];
}
