import "@tanstack/react-start/server-only";
import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  inArray,
  isNotNull,
  like,
  max,
  ne,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "@/lib/db/schema";
import {
  lotActions,
  lotImages,
  lotNotificationLog,
  lotSnapshots,
  lotSoldPrices,
  lots,
  pushSubscriptions,
  syncRuns,
  vinTargets,
} from "@/lib/db/schema";
import { DEFAULT_TARGETS } from "@/lib/default-targets";
import type {
  IngestPayload,
  LotDetail,
  LotListItem,
  LotRow,
  RunnerScope,
  ScrapedLotRecord,
  SoldPriceExplorerItem,
  SoldPriceQueueItem,
  SoldPriceResultInput,
  SoldPriceRow,
  SoldPriceStats,
  SourceKey,
  TargetMetadataUpdatePayload,
  VinTarget,
  VinTargetMetadataUpdate,
  WorkflowState,
} from "@/lib/types";
import {
  deriveVinPrefix,
  getVinTargetValidationError,
  hasGenericVinTargetYearRange,
  inferVinTargetDefinition,
  isGenericVinTargetMetadata,
  normalizeVinPattern,
} from "@/lib/vin-patterns";

type AuctionDb = DrizzleD1Database<typeof schema>;
type VinTargetRow = typeof vinTargets.$inferSelect;
type LotRecord = typeof lots.$inferSelect;
type SoldPriceRecord = typeof lotSoldPrices.$inferSelect;

interface RunnerSummary {
  runId: string;
  upserted: number;
  missingMarked: number;
}

interface TargetMetadataUpdateSummary {
  applied: number;
}

interface SoldPriceResultSummary {
  accepted: number;
  skipped: number;
}

function normalizeWhitespace(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSourceLabel(sourceKey: SourceKey): string {
  return sourceKey === "iaai" ? "IAAI" : "Copart";
}

function extFromMimeType(mimeType: string | null | undefined): string {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/avif":
      return "avif";
    case "image/gif":
      return "gif";
    default:
      return "bin";
  }
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digestInput = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const digest = await crypto.subtle.digest("SHA-256", digestInput);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function buildGenericTargetMetadata(
  vinPattern: string,
): Pick<VinTarget, "label" | "carType" | "marker"> {
  const inferred = inferVinTargetDefinition(vinPattern);
  return {
    label: inferred.vinPrefix || inferred.vinPattern,
    carType: inferred.vinPrefix || inferred.vinPattern,
    marker: `VIN · ${inferred.vinPattern}`,
  };
}

function normalizeLotStatus(status: string | null | undefined): LotRow["status"] {
  switch ((status ?? "").toLowerCase()) {
    case "upcoming":
      return "upcoming";
    case "done":
      return "done";
    case "missing":
      return "missing";
    case "canceled":
      return "canceled";
    default:
      return "unknown";
  }
}

function normalizedTextOrNull(value: string | null | undefined): string | null {
  const normalized = normalizeWhitespace(value);
  return normalized || null;
}

function parseJsonStringList(value: unknown): string[] {
  if (typeof value !== "string" || !value.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.map((item) => normalizeWhitespace(String(item ?? ""))).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

function normalizeStringList(
  values: Array<string | null | undefined> | null | undefined,
): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values || []) {
    const normalized = normalizeWhitespace(String(value || ""));
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function preferredText(
  next: string | null | undefined,
  fallback: string | null | undefined,
): string | null {
  return normalizedTextOrNull(next) ?? normalizedTextOrNull(fallback);
}

function preferredNumber(
  next: number | null | undefined,
  fallback: number | null | undefined,
): number | null {
  return next == null ? (fallback ?? null) : Number(next);
}

function serializeJsonOrNull(value: unknown): string | null {
  if (value == null) {
    return null;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

function shouldPreserveKnownLotStatus(
  nextStatus: LotRow["status"],
  currentStatus: LotRow["status"],
): boolean {
  return nextStatus === "unknown" && (currentStatus === "upcoming" || currentStatus === "done");
}

function hasProtectedImageDimensions(
  width: number | null | undefined,
  height: number | null | undefined,
): boolean {
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    return false;
  }
  const longEdge = Math.max(Number(width), Number(height));
  const shortEdge = Math.min(Number(width), Number(height));
  return longEdge >= 1024 && shortEdge >= 720;
}

function toVinTarget(row: VinTargetRow): VinTarget {
  const vinPattern = normalizeVinPattern(row.vinPattern);
  const generic = buildGenericTargetMetadata(vinPattern);
  const legacyGenericFallback = isGenericVinTargetMetadata({
    label: row.label,
    carType: row.carType,
    marker: row.marker,
    vinPattern,
    vinPrefix: deriveVinPrefix(vinPattern),
    copartSlug: row.copartSlug,
    iaaiPath: row.iaaiPath,
  });
  return {
    id: row.id,
    key: row.key,
    label: legacyGenericFallback ? generic.label : row.label,
    carType: legacyGenericFallback ? generic.carType : row.carType,
    marker: legacyGenericFallback ? generic.marker : row.marker,
    vinPattern,
    vinPrefix: deriveVinPrefix(vinPattern),
    yearFrom: row.yearFrom,
    yearTo: row.yearTo,
    copartSlug: row.copartSlug,
    iaaiPath: row.iaaiPath,
    rejectColors: parseJsonStringList(row.rejectColorsJson),
    rejectLocations: parseJsonStringList(row.rejectLocationsJson),
    enabledCopart: row.enabledCopart,
    enabledIaai: row.enabledIaai,
    active: row.active,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toLotRow(row: LotRecord): LotRow {
  return {
    ...row,
    vinPattern: row.vinPattern ? normalizeVinPattern(row.vinPattern) : null,
  };
}

function normalizeSoldPriceLookupStatus(
  status: string | null | undefined,
): SoldPriceRow["lookupStatus"] {
  switch ((status ?? "").toLowerCase()) {
    case "found":
      return "found";
    case "blocked":
      return "blocked";
    case "failed":
      return "failed";
    default:
      return "not_found";
  }
}

function lotListSortValue(row: LotRow): number {
  if (row.status === "done") return 9_999_999_999_999;
  if (!row.auctionDate) return 9_999_999_999_998;
  const milliseconds = Date.parse(row.auctionDate);
  return Number.isNaN(milliseconds) ? 9_999_999_999_997 : milliseconds;
}

const SOLD_TIMEOUT_MS = 2 * 60 * 60 * 1000;

function isExactPastAuction(lot: LotRow, nowMs: number): boolean {
  if (!lot.auctionDate || !lot.auctionDate.includes("T")) {
    return false;
  }
  const auctionMs = Date.parse(lot.auctionDate);
  return Number.isFinite(auctionMs) && auctionMs <= nowMs - SOLD_TIMEOUT_MS;
}

function getNextSoldPriceAttemptAt(
  status: SoldPriceRow["lookupStatus"],
  attemptCount: number,
  nowIso: string,
): string | null {
  if (status === "found") return null;
  const exponent = Math.max(0, Math.min(8, attemptCount - 1));
  const hours =
    status === "not_found" ? Math.min(72, 6 * 2 ** exponent) : Math.min(24, 2 ** exponent);
  return new Date(Date.parse(nowIso) + hours * 60 * 60 * 1000).toISOString();
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function quartiles(
  values: number[],
): Pick<SoldPriceStats, "medianUsd" | "q1Usd" | "q3Usd" | "iqrUsd"> {
  const sorted = [...values].sort((left, right) => left - right);
  const medianUsd = median(sorted);
  if (!sorted.length) {
    return { medianUsd: null, q1Usd: null, q3Usd: null, iqrUsd: null };
  }
  const middle = Math.floor(sorted.length / 2);
  const lower = sorted.length % 2 === 0 ? sorted.slice(0, middle) : sorted.slice(0, middle);
  const upper = sorted.length % 2 === 0 ? sorted.slice(middle) : sorted.slice(middle + 1);
  const q1Usd = median(lower.length ? lower : sorted);
  const q3Usd = median(upper.length ? upper : sorted);
  return { medianUsd, q1Usd, q3Usd, iqrUsd: q1Usd == null || q3Usd == null ? null : q3Usd - q1Usd };
}

function buildSoldPriceStats(
  items: Array<LotListItem & { soldPrice: SoldPriceRow }>,
): SoldPriceExplorerItem[] {
  const groups = new Map<string, Array<LotListItem & { soldPrice: SoldPriceRow }>>();
  for (const item of items) {
    const groupModel = item.targetKey || item.carType;
    const groupYear = item.modelYear == null ? "unknown" : String(item.modelYear);
    const groupKey = `${item.sourceKey}:${groupModel}:${groupYear}`;
    const group = groups.get(groupKey) ?? [];
    group.push(item);
    groups.set(groupKey, group);
  }

  return items.map((item) => {
    const groupModel = item.targetKey || item.carType;
    const groupYear = item.modelYear == null ? "unknown" : String(item.modelYear);
    const groupKey = `${item.sourceKey}:${groupModel}:${groupYear}`;
    const group = groups.get(groupKey) ?? [];
    const values = group
      .map((groupItem) => groupItem.soldPrice.finalBidUsd)
      .filter((value): value is number => value != null && Number.isFinite(value));
    const stats = quartiles(values);
    const price = item.soldPrice.finalBidUsd;
    const deltaUsd = price == null || stats.medianUsd == null ? null : price - stats.medianUsd;
    const deltaPercent = deltaUsd == null || !stats.medianUsd ? null : deltaUsd / stats.medianUsd;
    let outlier: SoldPriceStats["outlier"] = null;
    if (
      values.length >= 5 &&
      price != null &&
      stats.q1Usd != null &&
      stats.q3Usd != null &&
      stats.iqrUsd != null
    ) {
      const lowFence = stats.q1Usd - 1.5 * stats.iqrUsd;
      const highFence = stats.q3Usd + 1.5 * stats.iqrUsd;
      outlier = price < lowFence ? "low" : price > highFence ? "high" : null;
    }
    return {
      ...item,
      stats: {
        groupKey,
        groupLabel: [item.sourceLabel, item.carType, item.modelYear ? String(item.modelYear) : null]
          .filter(Boolean)
          .join(" · "),
        groupCount: values.length,
        ...stats,
        deltaUsd,
        deltaPercent,
        outlier,
      },
    };
  });
}

function normalizeColorForTargetFilter(value: string | null | undefined): string {
  return normalizeWhitespace(String(value || "")).toLowerCase();
}

function normalizeLocationForTargetFilter(value: string | null | undefined): string {
  return normalizeWhitespace(
    String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " "),
  );
}

function expandLocationFilterAliases(value: string): string[] {
  const normalized = normalizeLocationForTargetFilter(value);
  if (!normalized) return [];
  const aliases = new Set<string>([normalized]);
  if (normalized === "ca" || normalized === "california") {
    aliases.add("ca");
    aliases.add("california");
  }
  if (normalized === "wa" || normalized === "washington") {
    aliases.add("wa");
    aliases.add("washington");
  }
  if (
    ["dc", "d c", "washington dc", "washington d c", "district of columbia"].includes(normalized)
  ) {
    aliases.add("dc");
    aliases.add("d c");
    aliases.add("washington dc");
    aliases.add("washington d c");
    aliases.add("district of columbia");
  }
  return [...aliases];
}

function matchesLocationFilter(location: string | null | undefined, filterValue: string): boolean {
  const normalizedLocation = normalizeLocationForTargetFilter(location);
  if (!normalizedLocation) return false;
  const locationTokens = new Set(normalizedLocation.split(" ").filter(Boolean));
  return expandLocationFilterAliases(filterValue).some((candidate) =>
    candidate.includes(" ")
      ? normalizedLocation.includes(candidate)
      : locationTokens.has(candidate),
  );
}

function getTargetBlacklistMatch(
  target: Pick<VinTarget, "rejectColors" | "rejectLocations">,
  record: { color?: string | null; location?: string | null },
) {
  const reasons: string[] = [];
  const rejectColors = normalizeStringList(target.rejectColors || []);
  const normalizedColor = normalizeColorForTargetFilter(record.color);
  if (
    normalizedColor &&
    rejectColors.some((value) => normalizeColorForTargetFilter(value) === normalizedColor)
  ) {
    reasons.push("color");
  }
  const rejectLocations = normalizeStringList(target.rejectLocations || []);
  if (rejectLocations.some((value) => matchesLocationFilter(record.location, value))) {
    reasons.push("location");
  }
  return { matched: reasons.length > 0, reasons };
}

function formatBlacklistNote(
  lot: Pick<LotListItem, "color" | "location">,
  reasons: string[],
): string {
  const details = [
    lot.color ? `color=${lot.color}` : "",
    lot.location ? `location=${lot.location}` : "",
  ].filter(Boolean);
  return `Auto-rejected by target blacklist (${reasons.join("+")})${details.length ? `: ${details.join("; ")}` : ""}`;
}

export class AuctionD1Store {
  private readonly db: AuctionDb;

  constructor(
    d1: D1Database,
    private readonly images: R2Bucket,
  ) {
    this.db = drizzle(d1, { schema });
  }

  async ensureSeeded(): Promise<void> {
    const [{ value }] = await this.db.select({ value: count() }).from(vinTargets);
    if (value > 0) return;
    const now = new Date().toISOString();
    await this.db.insert(vinTargets).values(
      DEFAULT_TARGETS.map((target) => ({
        id: crypto.randomUUID(),
        key: target.key,
        label: target.label,
        carType: target.carType,
        marker: target.marker,
        vinPattern: target.vinPattern,
        vinPrefix: target.vinPrefix,
        yearFrom: target.yearFrom,
        yearTo: target.yearTo,
        copartSlug: target.copartSlug,
        iaaiPath: target.iaaiPath,
        rejectColorsJson: "[]",
        rejectLocationsJson: "[]",
        enabledCopart: target.enabledCopart,
        enabledIaai: target.enabledIaai,
        active: target.active,
        sortOrder: target.sortOrder,
        createdAt: now,
        updatedAt: now,
      })),
    );
  }

  async getVinTargets(activeOnly = false): Promise<VinTarget[]> {
    const rows = await this.db
      .select()
      .from(vinTargets)
      .where(activeOnly ? eq(vinTargets.active, true) : undefined)
      .orderBy(asc(vinTargets.sortOrder), asc(vinTargets.key));
    return rows.map(toVinTarget);
  }

  async getScrapeConfig(): Promise<{ configVersion: string; targets: VinTarget[] }> {
    const [row] = await this.db
      .select({ updatedAt: max(vinTargets.updatedAt) })
      .from(vinTargets)
      .where(eq(vinTargets.active, true));
    return {
      configVersion: row?.updatedAt ?? new Date().toISOString(),
      targets: await this.getVinTargets(true),
    };
  }

  async getRecentSyncRuns(limit = 20): Promise<Array<Record<string, unknown>>> {
    const boundedLimit = Math.max(1, Math.min(100, Number(limit) || 20));
    const rows = await this.db
      .select()
      .from(syncRuns)
      .orderBy(desc(sql`COALESCE(${syncRuns.completedAt}, ${syncRuns.submittedAt})`))
      .limit(boundedLimit);
    return rows.map((row) => {
      let sourceKeys: unknown = [];
      let scopes: unknown = [];
      try {
        sourceKeys = JSON.parse(row.sourceKeysJson);
      } catch {
        sourceKeys = [];
      }
      try {
        scopes = JSON.parse(row.coveredScopesJson);
      } catch {
        scopes = [];
      }
      return {
        id: row.id,
        runnerId: row.runnerId,
        runnerVersion: row.runnerVersion,
        machineName: row.machineName,
        submittedAt: row.submittedAt,
        startedAt: row.startedAt,
        completedAt: row.completedAt,
        status: row.status,
        sourceKeys,
        scopes,
        recordsReceived: row.recordsReceived,
        recordsUpserted: row.recordsUpserted,
        recordsMissingMarked: row.recordsMissingMarked,
        errorText: row.errorText,
      };
    });
  }

  async getLatestCollectorIngestAt(): Promise<string | null> {
    const [runRow] = await this.db
      .select({
        ingestedAt: max(
          sql<string>`COALESCE(${syncRuns.completedAt}, ${syncRuns.startedAt}, ${syncRuns.submittedAt})`,
        ),
      })
      .from(syncRuns)
      .where(eq(syncRuns.status, "complete"));
    if (runRow?.ingestedAt) return runRow.ingestedAt;
    const [lotRow] = await this.db.select({ ingestedAt: max(lots.lastIngestedAt) }).from(lots);
    return lotRow?.ingestedAt ?? null;
  }

  private async getNextVinTargetSortOrder(): Promise<number> {
    const [row] = await this.db.select({ value: max(vinTargets.sortOrder) }).from(vinTargets);
    return (row?.value ?? 0) + 10;
  }

  async upsertVinTarget(input: Partial<VinTarget> & { vinPattern: string }): Promise<string> {
    const validationError = getVinTargetValidationError(input.vinPattern);
    if (validationError) throw new Error(validationError);
    const inferred = inferVinTargetDefinition(input.vinPattern);
    if (!inferred.vinPattern) throw new Error("VIN pattern is required.");
    const [existingRow] = await this.db
      .select()
      .from(vinTargets)
      .where(or(eq(vinTargets.id, input.id ?? ""), eq(vinTargets.key, input.key ?? inferred.key)))
      .limit(1);
    const existing = existingRow ? toVinTarget(existingRow) : null;
    const generic = buildGenericTargetMetadata(inferred.vinPattern);
    const keepExistingMetadata = existing ? !isGenericVinTargetMetadata(existing) : false;
    const inferredMarker = inferred.modelLabel
      ? `${inferred.modelLabel} · ${inferred.vinPattern}`
      : `VIN · ${inferred.vinPattern}`;
    const isDeterministicTesla = inferred.deterministicTesla;
    const now = new Date().toISOString();
    const label =
      input.label ??
      (isDeterministicTesla
        ? inferred.label
        : keepExistingMetadata
          ? (existing?.label ?? generic.label)
          : generic.label);
    const carType =
      input.carType ??
      (isDeterministicTesla
        ? inferred.carType
        : keepExistingMetadata
          ? (existing?.carType ?? generic.carType)
          : generic.carType);
    const marker =
      input.marker ??
      (isDeterministicTesla
        ? inferredMarker
        : keepExistingMetadata
          ? (existing?.marker ?? generic.marker)
          : generic.marker);
    const yearFrom =
      input.yearFrom ??
      (isDeterministicTesla
        ? inferred.yearFrom
        : (existing?.yearFrom ?? inferred.inferredYear ?? inferred.yearFrom));
    const yearTo =
      input.yearTo ??
      (isDeterministicTesla
        ? inferred.yearTo
        : (existing?.yearTo ?? inferred.inferredYear ?? inferred.yearTo));
    const copartSlug =
      input.copartSlug ??
      (isDeterministicTesla
        ? inferred.copartSlug
        : inferred.copartSlug || existing?.copartSlug || "");
    const iaaiPath =
      input.iaaiPath ??
      (isDeterministicTesla ? inferred.iaaiPath : inferred.iaaiPath || existing?.iaaiPath || "");
    const rejectColors = normalizeStringList(input.rejectColors ?? existing?.rejectColors ?? []);
    const rejectLocations = normalizeStringList(
      input.rejectLocations ?? existing?.rejectLocations ?? [],
    );
    const enabledCopart = input.enabledCopart ?? (existing ? existing.enabledCopart : true);
    const enabledIaai =
      input.enabledIaai ??
      (existing
        ? existing.enabledIaai
        : !isGenericVinTargetMetadata({
            label,
            carType,
            marker,
            vinPattern: inferred.vinPattern,
            vinPrefix: inferred.vinPrefix,
            copartSlug,
            iaaiPath,
          }));
    const active = input.active ?? (existing ? existing.active : true);
    const sortOrder =
      input.sortOrder ?? (existing ? existing.sortOrder : await this.getNextVinTargetSortOrder());
    const id = input.id ?? (existing ? existing.id : crypto.randomUUID());
    const key = input.key ?? (existing ? existing.key : inferred.key);

    const values = {
      id,
      key,
      label,
      carType,
      marker,
      vinPattern: inferred.vinPattern,
      vinPrefix: inferred.vinPrefix,
      yearFrom,
      yearTo,
      copartSlug,
      iaaiPath,
      rejectColorsJson: JSON.stringify(rejectColors),
      rejectLocationsJson: JSON.stringify(rejectLocations),
      enabledCopart,
      enabledIaai,
      active,
      sortOrder,
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
    };

    await this.db
      .insert(vinTargets)
      .values(values)
      .onConflictDoUpdate({
        target: vinTargets.id,
        set: {
          key: values.key,
          label: values.label,
          carType: values.carType,
          marker: values.marker,
          vinPattern: values.vinPattern,
          vinPrefix: values.vinPrefix,
          yearFrom: values.yearFrom,
          yearTo: values.yearTo,
          copartSlug: values.copartSlug,
          iaaiPath: values.iaaiPath,
          rejectColorsJson: values.rejectColorsJson,
          rejectLocationsJson: values.rejectLocationsJson,
          enabledCopart: values.enabledCopart,
          enabledIaai: values.enabledIaai,
          active: values.active,
          sortOrder: values.sortOrder,
          updatedAt: values.updatedAt,
        },
      });
    return id;
  }

  async removeVinTarget(id: string): Promise<void> {
    const deleted = await this.db
      .delete(vinTargets)
      .where(eq(vinTargets.id, id))
      .returning({ id: vinTargets.id });
    if (!deleted.length) {
      throw new Error("Target not found.");
    }
  }

  async getLotList(includeRemoved = false): Promise<LotListItem[]> {
    const primaryImageId = sql<string | null>`(
      SELECT ${lotImages.id} FROM ${lotImages}
      WHERE ${lotImages.lotId} = ${lots.id} AND ${lotImages.active} = 1
      ORDER BY ${lotImages.sortOrder}, ${lotImages.createdAt}
      LIMIT 1
    )`;
    const imageCount = sql<number>`(
      SELECT COUNT(*) FROM ${lotImages}
      WHERE ${lotImages.lotId} = ${lots.id} AND ${lotImages.active} = 1
    )`.mapWith(Number);

    const rows = await this.db
      .select({
        ...getTableColumns(lots),
        primaryImageId,
        imageCount,
      })
      .from(lots)
      .where(includeRemoved ? undefined : ne(lots.workflowState, "removed"))
      .orderBy(desc(lots.updatedAt));

    return rows
      .map((row) => ({
        ...toLotRow(row),
        primaryImageId: row.primaryImageId,
        imageCount: row.imageCount,
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

  async getPublicLotList(): Promise<LotListItem[]> {
    await this.markTimedOutLotsDone(new Date().toISOString());
    const activeTargets = await this.getVinTargets(true);
    const activeTargetKeys = new Set(activeTargets.map((target) => target.key));
    const activeCarTypes = new Set(activeTargets.map((target) => target.carType));
    return (await this.getLotList(false)).filter((lot) => {
      if (lot.workflowState === "removed") return false;
      if (lot.targetKey && activeTargetKeys.has(lot.targetKey)) return true;
      return activeCarTypes.has(lot.carType);
    });
  }

  async getLotDetail(sourceKey: SourceKey, lotNumber: string): Promise<LotDetail | null> {
    const [lotRow] = await this.db
      .select()
      .from(lots)
      .where(and(eq(lots.sourceKey, sourceKey), eq(lots.lotNumber, lotNumber)))
      .limit(1);
    if (!lotRow) return null;
    const lot = toLotRow(lotRow);
    const [images, snapshots, actions, soldPriceRow] = await Promise.all([
      this.db
        .select()
        .from(lotImages)
        .where(and(eq(lotImages.lotId, lot.id), eq(lotImages.active, true)))
        .orderBy(asc(lotImages.sortOrder), asc(lotImages.createdAt)),
      this.db
        .select()
        .from(lotSnapshots)
        .where(eq(lotSnapshots.lotId, lot.id))
        .orderBy(desc(lotSnapshots.observedAt)),
      this.db
        .select()
        .from(lotActions)
        .where(eq(lotActions.lotId, lot.id))
        .orderBy(desc(lotActions.createdAt)),
      this.db
        .select()
        .from(lotSoldPrices)
        .where(eq(lotSoldPrices.lotId, lot.id))
        .limit(1)
        .then((rows) => rows[0] ?? null),
    ]);
    return { lot, images, snapshots, actions, soldPrice: soldPriceRow };
  }

  async getImageRow(imageId: string) {
    const [row] = await this.db.select().from(lotImages).where(eq(lotImages.id, imageId)).limit(1);
    return row ?? null;
  }

  async getLotImageSyncState(sourceKey: SourceKey, lotNumber: string) {
    const [row] = await this.db
      .select(getTableColumns(lotImages))
      .from(lotImages)
      .innerJoin(lots, eq(lots.id, lotImages.lotId))
      .where(
        and(
          eq(lots.sourceKey, sourceKey),
          eq(lots.lotNumber, lotNumber),
          eq(lotImages.active, true),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async getImageObject(imageId: string) {
    const image = await this.getImageRow(imageId);
    if (!image) return null;
    const object = await this.images.get(image.storagePath);
    return object ? { image, object } : null;
  }

  async setWorkflowState(
    lotId: string,
    workflowState: WorkflowState,
    actor: string,
    note: string | null,
  ): Promise<void> {
    const now = new Date().toISOString();
    const [lotRow] = await this.db.select().from(lots).where(eq(lots.id, lotId)).limit(1);
    if (!lotRow) throw new Error(`Unknown lot ${lotId}`);
    const approvedAt =
      workflowState === "approved" ? now : workflowState === "removed" ? lotRow.approvedAt : null;
    const removedAt = workflowState === "removed" ? now : null;
    await this.db
      .update(lots)
      .set({ workflowState, workflowNote: note, approvedAt, removedAt, updatedAt: now })
      .where(eq(lots.id, lotId));
    await this.db.insert(lotActions).values({
      id: crypto.randomUUID(),
      lotId,
      action: workflowState,
      actor,
      note,
      metadataJson: null,
      createdAt: now,
    });
  }

  async hardDeleteLot(lotId: string): Promise<boolean> {
    const [exists] = await this.db
      .select({ id: lots.id })
      .from(lots)
      .where(eq(lots.id, lotId))
      .limit(1);
    if (!exists) return false;
    const imageRows = await this.db
      .select({ storagePath: lotImages.storagePath })
      .from(lotImages)
      .where(eq(lotImages.lotId, lotId));
    await this.db.delete(lotNotificationLog).where(eq(lotNotificationLog.lotId, lotId));
    await this.db.delete(lots).where(eq(lots.id, lotId));
    await Promise.allSettled(
      imageRows.map((row) =>
        row.storagePath ? this.images.delete(row.storagePath) : Promise.resolve(),
      ),
    );
    return true;
  }

  private async markTimedOutLotsDone(nowIso: string): Promise<number> {
    const cutoffIso = new Date(Date.parse(nowIso) - SOLD_TIMEOUT_MS).toISOString();
    const updated = await this.db
      .update(lots)
      .set({ status: "done", updatedAt: nowIso })
      .where(
        and(
          ne(lots.workflowState, "removed"),
          inArray(lots.status, ["upcoming", "unknown", "missing"]),
          like(lots.auctionDate, "%T%"),
          sql`datetime(${lots.auctionDate}) <= datetime(${cutoffIso})`,
        ),
      )
      .returning({ id: lots.id });
    return updated.length;
  }

  async getSoldPriceQueue(limit = 20): Promise<SoldPriceQueueItem[]> {
    const nowIso = new Date().toISOString();
    const nowMs = Date.parse(nowIso);
    const boundedLimit = Math.max(1, Math.min(100, Number(limit) || 20));
    const soldPriceRows = await this.db.select().from(lotSoldPrices);
    const soldPriceByLotId = new Map<string, SoldPriceRecord>(
      soldPriceRows.map((row) => [row.lotId, row]),
    );
    return (await this.getPublicLotList())
      .filter((lot) => {
        if (lot.workflowState === "removed") return false;
        if (!lot.vin && !lot.lotNumber) return false;
        if (lot.status !== "done" && !isExactPastAuction(lot, nowMs)) return false;
        const soldPrice = soldPriceByLotId.get(lot.id);
        if (!soldPrice) return true;
        if (soldPrice.lookupStatus === "found") return false;
        if (!soldPrice.nextAttemptAt) return true;
        return Date.parse(soldPrice.nextAttemptAt) <= nowMs;
      })
      .sort((left, right) => {
        const leftSoldPrice = soldPriceByLotId.get(left.id);
        const rightSoldPrice = soldPriceByLotId.get(right.id);
        const leftAttemptMs = leftSoldPrice?.lastAttemptedAt
          ? Date.parse(leftSoldPrice.lastAttemptedAt)
          : 0;
        const rightAttemptMs = rightSoldPrice?.lastAttemptedAt
          ? Date.parse(rightSoldPrice.lastAttemptedAt)
          : 0;
        const leftAuctionMs = left.auctionDate
          ? Date.parse(left.auctionDate)
          : Number.MAX_SAFE_INTEGER;
        const rightAuctionMs = right.auctionDate
          ? Date.parse(right.auctionDate)
          : Number.MAX_SAFE_INTEGER;
        return (
          leftAttemptMs - rightAttemptMs ||
          leftAuctionMs - rightAuctionMs ||
          left.lotNumber.localeCompare(right.lotNumber)
        );
      })
      .slice(0, boundedLimit)
      .map((lot) => ({
        lotId: lot.id,
        sourceKey: lot.sourceKey,
        sourceLabel: lot.sourceLabel,
        targetKey: lot.targetKey,
        lotNumber: lot.lotNumber,
        vin: lot.vin,
        modelYear: lot.modelYear,
        carType: lot.carType,
        marker: lot.marker,
        auctionDate: lot.auctionDate,
        status: lot.status,
        url: lot.url,
      }));
  }

  async recordSoldPriceResults(results: SoldPriceResultInput[]): Promise<SoldPriceResultSummary> {
    let accepted = 0;
    let skipped = 0;
    for (const result of results) {
      if (await this.recordSoldPriceResult(result)) {
        accepted += 1;
      } else {
        skipped += 1;
      }
    }
    return { accepted, skipped };
  }

  private async recordSoldPriceResult(input: SoldPriceResultInput): Promise<boolean> {
    const [lotExists] = await this.db
      .select({ id: lots.id })
      .from(lots)
      .where(eq(lots.id, input.lotId))
      .limit(1);
    if (!lotExists) return false;
    const [existing] = await this.db
      .select()
      .from(lotSoldPrices)
      .where(eq(lotSoldPrices.lotId, input.lotId))
      .limit(1);
    const now = new Date().toISOString();
    const nextAttemptCount = (existing?.attemptCount ?? 0) + 1;
    const requestedStatus = normalizeSoldPriceLookupStatus(input.lookupStatus);
    const finalBidUsd = input.finalBidUsd == null ? null : Math.round(Number(input.finalBidUsd));
    const lookupStatus =
      requestedStatus === "found" && (!finalBidUsd || finalBidUsd <= 0)
        ? "failed"
        : requestedStatus;
    const nextAttemptAt = getNextSoldPriceAttemptAt(lookupStatus, nextAttemptCount, now);
    const errorText = normalizedTextOrNull(input.errorText);

    if (existing?.lookupStatus === "found" && lookupStatus !== "found") {
      await this.db
        .update(lotSoldPrices)
        .set({
          attemptCount: nextAttemptCount,
          lastAttemptedAt: now,
          errorText: sql`COALESCE(${errorText}, ${lotSoldPrices.errorText})`,
          updatedAt: now,
        })
        .where(eq(lotSoldPrices.lotId, input.lotId));
      return true;
    }

    const externalSourceKey =
      input.externalSourceKey === "copart" || input.externalSourceKey === "iaai"
        ? input.externalSourceKey
        : null;
    const matchConfidence =
      input.matchConfidence == null
        ? null
        : Math.max(0, Math.min(1, Number(input.matchConfidence)));
    const rawJson = serializeJsonOrNull(input.raw);
    const id = existing?.id ?? crypto.randomUUID();
    const createdAt = existing?.createdAt ?? now;
    const foundAt = lookupStatus === "found" ? (existing?.foundAt ?? now) : null;
    const isFound = lookupStatus === "found";

    const values = {
      id,
      lotId: input.lotId,
      lookupStatus,
      attemptCount: nextAttemptCount,
      lastAttemptedAt: now,
      nextAttemptAt,
      foundAt,
      externalUrl: normalizedTextOrNull(input.externalUrl),
      matchedQuery: normalizedTextOrNull(input.matchedQuery),
      matchConfidence,
      finalBidUsd: isFound ? finalBidUsd : null,
      saleDate: isFound ? normalizedTextOrNull(input.saleDate) : null,
      saleDateRaw: isFound ? normalizedTextOrNull(input.saleDateRaw) : null,
      externalSourceKey: isFound ? externalSourceKey : null,
      externalSourceLabel: isFound ? normalizedTextOrNull(input.externalSourceLabel) : null,
      externalLotNumber: isFound ? normalizedTextOrNull(input.externalLotNumber) : null,
      externalVin: isFound ? normalizedTextOrNull(input.externalVin) : null,
      condition: isFound ? normalizedTextOrNull(input.condition) : null,
      damage: isFound ? normalizedTextOrNull(input.damage) : null,
      secondaryDamage: isFound ? normalizedTextOrNull(input.secondaryDamage) : null,
      mileage: isFound ? normalizedTextOrNull(input.mileage) : null,
      location: isFound ? normalizedTextOrNull(input.location) : null,
      color: isFound ? normalizedTextOrNull(input.color) : null,
      seller: isFound ? normalizedTextOrNull(input.seller) : null,
      documents: isFound ? normalizedTextOrNull(input.documents) : null,
      rawJson,
      errorText,
      createdAt,
      updatedAt: now,
    };

    await this.db
      .insert(lotSoldPrices)
      .values(values)
      .onConflictDoUpdate({
        target: lotSoldPrices.lotId,
        set: {
          lookupStatus: values.lookupStatus,
          attemptCount: values.attemptCount,
          lastAttemptedAt: values.lastAttemptedAt,
          nextAttemptAt: values.nextAttemptAt,
          foundAt: values.foundAt,
          externalUrl: values.externalUrl,
          matchedQuery: values.matchedQuery,
          matchConfidence: values.matchConfidence,
          finalBidUsd: values.finalBidUsd,
          saleDate: values.saleDate,
          saleDateRaw: values.saleDateRaw,
          externalSourceKey: values.externalSourceKey,
          externalSourceLabel: values.externalSourceLabel,
          externalLotNumber: values.externalLotNumber,
          externalVin: values.externalVin,
          condition: values.condition,
          damage: values.damage,
          secondaryDamage: values.secondaryDamage,
          mileage: values.mileage,
          location: values.location,
          color: values.color,
          seller: values.seller,
          documents: values.documents,
          rawJson: values.rawJson,
          errorText: values.errorText,
          updatedAt: values.updatedAt,
        },
      });

    if (isFound) {
      const externalVin = normalizedTextOrNull(input.externalVin);
      if (externalVin && /^[A-HJ-NPR-Z0-9]{17}$/i.test(externalVin)) {
        await this.db
          .update(lots)
          .set({ vin: externalVin.toUpperCase(), updatedAt: now })
          .where(eq(lots.id, input.lotId));
      }
    }
    return true;
  }

  async getSoldPriceExplorerItems(): Promise<SoldPriceExplorerItem[]> {
    const publicLots = await this.getPublicLotList();
    const publicLotsById = new Map(publicLots.map((lot) => [lot.id, lot]));
    const soldRows = await this.db
      .select()
      .from(lotSoldPrices)
      .where(and(eq(lotSoldPrices.lookupStatus, "found"), isNotNull(lotSoldPrices.finalBidUsd)));
    const items = soldRows
      .map((soldPrice) => {
        const lot = publicLotsById.get(soldPrice.lotId);
        return lot ? { ...lot, soldPrice } : null;
      })
      .filter((item): item is LotListItem & { soldPrice: SoldPriceRow } => item !== null)
      .sort((left, right) => {
        const rightSaleMs = Date.parse(
          right.soldPrice.saleDate || right.soldPrice.foundAt || right.updatedAt,
        );
        const leftSaleMs = Date.parse(
          left.soldPrice.saleDate || left.soldPrice.foundAt || left.updatedAt,
        );
        return (
          rightSaleMs - leftSaleMs || right.soldPrice.finalBidUsd! - left.soldPrice.finalBidUsd!
        );
      });
    return buildSoldPriceStats(items);
  }

  async applyTargetMetadataUpdates(
    payload: TargetMetadataUpdatePayload,
  ): Promise<TargetMetadataUpdateSummary> {
    const observedAt = payload.observedAt || new Date().toISOString();
    let applied = 0;
    for (const update of payload.updates ?? []) {
      if (await this.applyTargetMetadataUpdate(update, observedAt)) {
        applied += 1;
      }
    }
    return { applied };
  }

  async ingest(payload: IngestPayload): Promise<RunnerSummary> {
    const runId = payload.run.id ?? crypto.randomUUID();
    const submittedAt = new Date().toISOString();
    const completedAt = payload.run.completedAt || submittedAt;
    const presentKeysByScope = new Map<string, Set<string>>();
    let upserted = 0;
    let missingMarked = 0;
    await this.db.insert(syncRuns).values({
      id: runId,
      runnerId: payload.run.runnerId,
      runnerVersion: payload.run.runnerVersion,
      machineName: payload.run.machineName,
      submittedAt,
      startedAt: payload.run.startedAt,
      completedAt,
      status: "running",
      sourceKeysJson: JSON.stringify(payload.run.sourceKeys),
      coveredScopesJson: JSON.stringify(payload.run.scopes),
      recordsReceived: payload.records.length,
    });

    for (const update of payload.targetUpdates ?? []) {
      await this.applyTargetMetadataUpdate(update, completedAt);
    }
    for (const record of payload.records) {
      const scopeKey = `${record.sourceKey}:${record.targetKey}`;
      if (!presentKeysByScope.has(scopeKey)) {
        presentKeysByScope.set(scopeKey, new Set());
      }
      presentKeysByScope.get(scopeKey)?.add(record.lotNumber);
      await this.upsertLotRecord(runId, completedAt, record);
      upserted += 1;
    }
    for (const scope of payload.run.scopes.filter((item) => item.status === "complete")) {
      missingMarked += await this.reconcileMissingLots(
        runId,
        completedAt,
        scope,
        presentKeysByScope.get(`${scope.sourceKey}:${scope.targetKey}`) ?? new Set(),
      );
    }
    await this.db
      .update(syncRuns)
      .set({
        status: "complete",
        recordsUpserted: upserted,
        recordsMissingMarked: missingMarked,
        completedAt,
      })
      .where(eq(syncRuns.id, runId));
    return { runId, upserted, missingMarked };
  }

  async uploadLotImage(input: {
    runId: string;
    sourceKey: SourceKey;
    lotNumber: string;
    sourceUrl: string;
    sortOrder: number;
    mimeType?: string | null;
    width?: number | null;
    height?: number | null;
    dataBase64: string;
  }) {
    const [lotRow] = await this.db
      .select({ id: lots.id })
      .from(lots)
      .where(and(eq(lots.sourceKey, input.sourceKey), eq(lots.lotNumber, input.lotNumber)))
      .limit(1);
    if (!lotRow) throw new Error(`Unknown lot ${input.sourceKey}:${input.lotNumber}`);
    const bytes = Uint8Array.from(atob(input.dataBase64), (char) => char.charCodeAt(0));
    const sha256 = await sha256Hex(bytes);
    const mimeType = input.mimeType || "application/octet-stream";
    const extension = extFromMimeType(mimeType);
    const storagePath = `${input.sourceKey}/${input.lotNumber}/${sha256}.${extension}`;
    const now = new Date().toISOString();
    const [existing] = await this.db
      .select()
      .from(lotImages)
      .where(eq(lotImages.lotId, lotRow.id))
      .limit(1);

    if (existing && existing.sha256 === sha256) {
      await this.images.put(storagePath, bytes, { httpMetadata: { contentType: mimeType } });
      await this.db
        .update(lotImages)
        .set({
          sourceUrl: input.sourceUrl,
          storagePath,
          mimeType,
          sha256,
          byteSize: bytes.length,
          width: input.width ?? null,
          height: input.height ?? null,
          sortOrder: 0,
          lastSeenAt: now,
          lastSyncRunId: input.runId,
          active: true,
        })
        .where(eq(lotImages.id, existing.id));
      if (existing.storagePath !== storagePath) {
        await this.images.delete(existing.storagePath).catch(() => {});
      }
      const [next] = await this.db
        .select()
        .from(lotImages)
        .where(eq(lotImages.id, existing.id))
        .limit(1);
      return next!;
    }

    if (
      existing &&
      hasProtectedImageDimensions(existing.width, existing.height) &&
      !hasProtectedImageDimensions(input.width ?? null, input.height ?? null)
    ) {
      return existing;
    }

    if (existing) {
      await this.db.delete(lotImages).where(eq(lotImages.id, existing.id));
      await this.images.delete(existing.storagePath).catch(() => {});
    }

    await this.images.put(storagePath, bytes, { httpMetadata: { contentType: mimeType } });
    const id = crypto.randomUUID();
    await this.db.insert(lotImages).values({
      id,
      lotId: lotRow.id,
      sourceUrl: input.sourceUrl,
      storagePath,
      mimeType,
      sha256,
      byteSize: bytes.length,
      width: input.width ?? null,
      height: input.height ?? null,
      sortOrder: 0,
      createdAt: now,
      lastSeenAt: now,
      lastSyncRunId: input.runId,
      active: true,
    });
    const [next] = await this.db.select().from(lotImages).where(eq(lotImages.id, id)).limit(1);
    return next!;
  }

  private async applyTargetMetadataUpdate(
    update: VinTargetMetadataUpdate,
    observedAt: string,
  ): Promise<boolean> {
    if (!update.targetKey) return false;
    const [existingRow] = await this.db
      .select()
      .from(vinTargets)
      .where(eq(vinTargets.key, update.targetKey))
      .limit(1);
    if (!existingRow) return false;
    const existing = toVinTarget(existingRow);
    const nextLabel = update.label?.trim();
    const nextCarType = update.carType?.trim();
    const nextMarker = update.marker?.trim();
    const nextYearFrom = update.yearFrom == null ? null : Number(update.yearFrom);
    const nextYearTo = update.yearTo == null ? null : Number(update.yearTo);
    const shouldReplaceMetadata =
      isGenericVinTargetMetadata(existing) && !!nextLabel && !!nextCarType && !!nextMarker;
    const shouldReplaceYears =
      hasGenericVinTargetYearRange(existing) && nextYearFrom != null && nextYearTo != null;
    if (!shouldReplaceMetadata && !shouldReplaceYears) return false;
    const updated = await this.db
      .update(vinTargets)
      .set({
        label: shouldReplaceMetadata ? nextLabel! : existing.label,
        carType: shouldReplaceMetadata ? nextCarType! : existing.carType,
        marker: shouldReplaceMetadata ? nextMarker! : existing.marker,
        yearFrom: shouldReplaceYears ? nextYearFrom! : existing.yearFrom,
        yearTo: shouldReplaceYears ? nextYearTo! : existing.yearTo,
        enabledIaai: shouldReplaceMetadata ? true : existing.enabledIaai,
        updatedAt: observedAt,
      })
      .where(eq(vinTargets.id, existing.id))
      .returning({ id: vinTargets.id });
    return updated.length > 0;
  }

  private async getResolvedTargetMetadata(
    targetKey: string | null | undefined,
  ): Promise<Pick<VinTarget, "carType" | "marker"> | null> {
    if (!targetKey) return null;
    const [row] = await this.db
      .select()
      .from(vinTargets)
      .where(eq(vinTargets.key, targetKey))
      .limit(1);
    if (!row) return null;
    const target = toVinTarget(row);
    return isGenericVinTargetMetadata(target)
      ? null
      : { carType: target.carType, marker: target.marker };
  }

  private async upsertLotRecord(
    runId: string,
    observedAt: string,
    record: ScrapedLotRecord,
  ): Promise<void> {
    const [existing] = await this.db
      .select()
      .from(lots)
      .where(and(eq(lots.sourceKey, record.sourceKey), eq(lots.lotNumber, record.lotNumber)))
      .limit(1);
    const resolvedTarget = await this.getResolvedTargetMetadata(record.targetKey);
    const nextStatus = normalizeLotStatus(record.status);
    if (existing) {
      const current = toLotRow(existing);
      const mergedStatus = shouldPreserveKnownLotStatus(nextStatus, current.status)
        ? current.status
        : nextStatus;
      const mergedSourceLabel =
        preferredText(record.sourceLabel, current.sourceLabel) ||
        normalizeSourceLabel(record.sourceKey);
      const mergedTargetKey = preferredText(record.targetKey, current.targetKey);
      const mergedSourceDetailId = preferredText(record.sourceDetailId, current.sourceDetailId);
      const mergedCarType =
        preferredText(resolvedTarget?.carType || record.carType, current.carType) ||
        current.carType;
      const mergedMarker =
        preferredText(resolvedTarget?.marker || record.marker, current.marker) || current.marker;
      const mergedVinPattern = preferredText(record.vinPattern, current.vinPattern);
      const mergedVin = preferredText(record.vin, current.vin);
      const mergedModelYear = preferredNumber(record.modelYear, current.modelYear);
      const mergedYearPage = preferredNumber(record.yearPage, current.yearPage);
      const mergedAuctionDate = preferredText(record.auctionDate, current.auctionDate);
      const mergedAuctionDateRaw = preferredText(record.auctionDateRaw, current.auctionDateRaw);
      const mergedLocation = preferredText(record.location, current.location);
      const mergedUrl = preferredText(record.url, current.url) || current.url;
      const mergedEvidence = preferredText(record.evidence, current.evidence);
      const mergedColor = preferredText(record.color, current.color);
      const mergedSourceRawJson = serializeJsonOrNull(record.sourceRaw) ?? current.sourceRawJson;
      const clearsCanceled = ["upcoming", "done", "unknown"].includes(mergedStatus);
      await this.db
        .update(lots)
        .set({
          sourceLabel: mergedSourceLabel,
          targetKey: mergedTargetKey,
          sourceDetailId: mergedSourceDetailId,
          carType: mergedCarType,
          marker: mergedMarker,
          vinPattern: mergedVinPattern,
          vin: mergedVin,
          modelYear: mergedModelYear,
          yearPage: mergedYearPage,
          status: mergedStatus,
          auctionDate: mergedAuctionDate,
          auctionDateRaw: mergedAuctionDateRaw,
          location: mergedLocation,
          url: mergedUrl,
          evidence: mergedEvidence,
          color: mergedColor,
          sourceRawJson: mergedSourceRawJson,
          lastSeenAt: observedAt,
          lastIngestedAt: observedAt,
          lastSyncRunId: runId,
          missingSince: null,
          missingCount: 0,
          canceledAt: clearsCanceled ? null : current.canceledAt,
          updatedAt: observedAt,
        })
        .where(eq(lots.id, current.id));
      await this.insertSnapshot(current.id, runId, observedAt, true, record);
      return;
    }

    const resolvedCarType =
      preferredText(resolvedTarget?.carType || record.carType, null) ||
      normalizeWhitespace(record.carType);
    const resolvedMarker =
      preferredText(resolvedTarget?.marker || record.marker, null) ||
      normalizeWhitespace(record.marker);
    const id = crypto.randomUUID();
    await this.db.insert(lots).values({
      id,
      sourceKey: record.sourceKey,
      sourceLabel:
        preferredText(record.sourceLabel, null) || normalizeSourceLabel(record.sourceKey),
      targetKey: preferredText(record.targetKey, null),
      lotNumber: record.lotNumber,
      sourceDetailId: preferredText(record.sourceDetailId, null),
      carType: resolvedCarType,
      marker: resolvedMarker,
      vinPattern: preferredText(record.vinPattern, null),
      vin: preferredText(record.vin, null),
      modelYear: preferredNumber(record.modelYear, null),
      yearPage: preferredNumber(record.yearPage, null),
      status: nextStatus,
      workflowState: "new",
      workflowNote: null,
      auctionDate: preferredText(record.auctionDate, null),
      auctionDateRaw: preferredText(record.auctionDateRaw, null),
      location: preferredText(record.location, null),
      url: preferredText(record.url, null) || "",
      evidence: preferredText(record.evidence, null),
      color: preferredText(record.color, null),
      sourceRawJson: serializeJsonOrNull(record.sourceRaw),
      firstSeenAt: observedAt,
      lastSeenAt: observedAt,
      lastIngestedAt: observedAt,
      lastSyncRunId: runId,
      missingSince: null,
      missingCount: 0,
      canceledAt: null,
      approvedAt: null,
      removedAt: null,
      updatedAt: observedAt,
    });
    await this.insertSnapshot(id, runId, observedAt, true, record);
  }

  private async insertSnapshot(
    lotId: string,
    runId: string,
    observedAt: string,
    isPresent: boolean,
    record: ScrapedLotRecord | null,
  ): Promise<void> {
    const id = `${lotId}:${runId}:${isPresent ? "present" : "missing"}`;
    const snapshotJson = JSON.stringify(record ?? null);
    await this.db
      .insert(lotSnapshots)
      .values({ id, lotId, syncRunId: runId, observedAt, isPresent, snapshotJson })
      .onConflictDoUpdate({
        target: lotSnapshots.id,
        set: { syncRunId: runId, observedAt, isPresent, snapshotJson },
      });
  }

  private async reconcileMissingLots(
    runId: string,
    observedAt: string,
    scope: RunnerScope,
    presentLotNumbers: Set<string>,
  ): Promise<number> {
    const existingRows = await this.db
      .select()
      .from(lots)
      .where(and(eq(lots.sourceKey, scope.sourceKey), eq(lots.targetKey, scope.targetKey)));
    let missingMarked = 0;
    const scopeReportedZeroLots = presentLotNumbers.size === 0;
    for (const row of existingRows) {
      const lot = toLotRow(row);
      if (presentLotNumbers.has(lot.lotNumber)) continue;
      const nextMissingCount = lot.missingCount + 1;
      const shouldGraceSingleEmptyScopeRun =
        scopeReportedZeroLots && lot.status !== "done" && nextMissingCount === 1;
      const nextStatus =
        lot.status === "done"
          ? "done"
          : shouldGraceSingleEmptyScopeRun
            ? lot.status
            : nextMissingCount >= (scopeReportedZeroLots ? 3 : 2)
              ? "canceled"
              : "missing";
      await this.db
        .update(lots)
        .set({
          status: nextStatus,
          missingSince: lot.missingSince ?? observedAt,
          missingCount: nextMissingCount,
          canceledAt: nextStatus === "canceled" ? (lot.canceledAt ?? observedAt) : lot.canceledAt,
          lastIngestedAt: observedAt,
          lastSyncRunId: runId,
          updatedAt: observedAt,
        })
        .where(eq(lots.id, lot.id));
      await this.insertSnapshot(lot.id, runId, observedAt, false, null);
      missingMarked += 1;
    }
    return missingMarked;
  }

  async applyTargetBlacklistToExistingLots(): Promise<{ updated: number }> {
    const targets = await this.getVinTargets(true);
    const targetByKey = new Map(targets.map((target) => [target.key, target]));
    const list = await this.getLotList(false);
    let updated = 0;
    for (const lot of list) {
      if (lot.workflowState === "removed" || !lot.targetKey) continue;
      const target = targetByKey.get(lot.targetKey);
      if (!target) continue;
      const match = getTargetBlacklistMatch(target, lot);
      if (!match.matched) continue;
      await this.setWorkflowState(
        lot.id,
        "removed",
        "system",
        formatBlacklistNote(lot, match.reasons),
      );
      updated += 1;
    }
    return { updated };
  }

  async savePushSubscription(endpoint: string, p256dh: string, auth: string): Promise<void> {
    await this.db
      .insert(pushSubscriptions)
      .values({
        id: crypto.randomUUID(),
        endpoint,
        p256dh,
        auth,
        createdAt: new Date().toISOString(),
      })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: { p256dh, auth },
      });
  }

  async removePushSubscription(endpoint: string): Promise<void> {
    await this.db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
  }

  async getPushSubscriptions() {
    return await this.db
      .select({
        id: pushSubscriptions.id,
        endpoint: pushSubscriptions.endpoint,
        p256dh: pushSubscriptions.p256dh,
        auth: pushSubscriptions.auth,
      })
      .from(pushSubscriptions);
  }

  private getLotsToNotifyWithinWindow(eventType: string, sqliteOffset: string) {
    const notified = this.db
      .select({ lotId: lotNotificationLog.lotId })
      .from(lotNotificationLog)
      .where(eq(lotNotificationLog.eventType, eventType));
    return this.db
      .select({
        id: lots.id,
        lotNumber: lots.lotNumber,
        sourceKey: lots.sourceKey,
        marker: lots.marker,
      })
      .from(lots)
      .where(
        and(
          eq(lots.status, "upcoming"),
          ne(lots.workflowState, "removed"),
          like(lots.auctionDate, "%T%"),
          sql`datetime(${lots.auctionDate}) > datetime('now')`,
          sql`datetime(${lots.auctionDate}) <= datetime('now', ${sqliteOffset})`,
          notInArray(lots.id, notified),
        ),
      );
  }

  async getLotsToNotify12h() {
    return await this.getLotsToNotifyWithinWindow("threshold_12h", "+12 hours");
  }

  async getLotsToNotify30m() {
    return await this.getLotsToNotifyWithinWindow("threshold_30m", "+30 minutes");
  }

  async recordLotNotification(lotId: string, eventType: string): Promise<void> {
    await this.db
      .insert(lotNotificationLog)
      .values({ lotId, eventType, notifiedAt: new Date().toISOString() })
      .onConflictDoNothing();
  }
}
