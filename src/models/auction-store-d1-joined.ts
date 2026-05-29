import "@tanstack/react-start/server-only";
import { and, desc, eq, ne } from "drizzle-orm";
import { type DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "@/lib/db/schema";
import { lotImages, lots } from "@/lib/db/schema";
import type { LotListItem, LotRow } from "@/lib/types";
import { normalizeVinPattern } from "@/lib/vin-patterns";
import { AuctionD1Store as BaseAuctionD1Store } from "@/models/auction-store-d1";

type AuctionDb = DrizzleD1Database<typeof schema>;
type LotRecord = typeof lots.$inferSelect;

function toLotRow(row: LotRecord): LotRow {
  return {
    ...row,
    vinPattern: row.vinPattern ? normalizeVinPattern(row.vinPattern) : null,
  };
}

function lotListSortValue(row: LotRow): number {
  if (row.status === "done") return 9_999_999_999_999;
  if (!row.auctionDate) return 9_999_999_999_998;
  const milliseconds = Date.parse(row.auctionDate);
  return Number.isNaN(milliseconds) ? 9_999_999_999_997 : milliseconds;
}

export class AuctionD1Store extends BaseAuctionD1Store {
  override async getLotList(includeRemoved = false): Promise<LotListItem[]> {
    const db = (this as unknown as { db: AuctionDb }).db;

    const rows = await db
      .select({
        lot: lots,
        primaryImageId: lotImages.id,
      })
      .from(lots)
      .leftJoin(lotImages, and(eq(lotImages.lotId, lots.id), eq(lotImages.active, true)))
      .where(includeRemoved ? undefined : ne(lots.workflowState, "removed"))
      .orderBy(desc(lots.updatedAt));

    return rows
      .map(({ lot, primaryImageId }) => ({
        ...toLotRow(lot),
        primaryImageId: primaryImageId ?? null,
        imageCount: primaryImageId == null ? 0 : 1,
      }))
      .sort(
        (left, right) =>
          lotListSortValue(left) - lotListSortValue(right) ||
          left.carType.localeCompare(right.carType) ||
          left.marker.localeCompare(right.marker) ||
          left.sourceLabel.localeCompare(right.sourceLabel) ||
          left.lotNumber.localeCompare(right.lotNumber),
      );
  }
}
