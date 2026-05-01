import "@tanstack/react-start/server-only";
import { DEFAULT_TARGETS } from "@/lib/default-targets";
import type {
  IngestPayload,
  LotActionRow,
  LotDetail,
  LotImageRow,
  LotListItem,
  LotRow,
  LotSnapshotRow,
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

/* eslint-disable @typescript-eslint/no-base-to-string */

type DbValue = string | number | null | boolean;

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

function boolFlag(value: boolean): number {
  return value ? 1 : 0;
}

function rowBool(value: unknown): boolean {
  return Number(value ?? 0) === 1;
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

function normalizeWorkflowState(status: string | null | undefined): WorkflowState {
  switch ((status ?? "").toLowerCase()) {
    case "approved":
      return "approved";
    case "removed":
      return "removed";
    default:
      return "new";
  }
}

function mapVinTarget(row: Record<string, unknown>): VinTarget {
  const vinPattern = normalizeVinPattern(String(row.vin_pattern));
  const generic = buildGenericTargetMetadata(vinPattern);
  const legacyGenericFallback = isGenericVinTargetMetadata({
    label: String(row.label ?? ""),
    carType: String(row.car_type ?? ""),
    marker: String(row.marker ?? ""),
    vinPattern,
    vinPrefix: deriveVinPrefix(vinPattern),
    copartSlug: String(row.copart_slug ?? ""),
    iaaiPath: String(row.iaai_path ?? ""),
  });
  return {
    id: String(row.id),
    key: String(row.key),
    label: legacyGenericFallback ? generic.label : String(row.label),
    carType: legacyGenericFallback ? generic.carType : String(row.car_type),
    marker: legacyGenericFallback ? generic.marker : String(row.marker),
    vinPattern,
    vinPrefix: deriveVinPrefix(vinPattern),
    yearFrom: Number(row.year_from),
    yearTo: Number(row.year_to),
    copartSlug: String(row.copart_slug ?? ""),
    iaaiPath: String(row.iaai_path ?? ""),
    rejectColors: parseJsonStringList(row.reject_colors_json),
    rejectLocations: parseJsonStringList(row.reject_locations_json),
    enabledCopart: rowBool(row.enabled_copart),
    enabledIaai: rowBool(row.enabled_iaai),
    active: rowBool(row.active),
    sortOrder: Number(row.sort_order ?? 0),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapLotRow(row: Record<string, unknown>): LotRow {
  const vinPattern = row.vin_pattern ? normalizeVinPattern(String(row.vin_pattern)) : null;
  return {
    id: String(row.id),
    sourceKey: String(row.source_key) as SourceKey,
    sourceLabel: String(row.source_label),
    targetKey: row.target_key ? String(row.target_key) : null,
    lotNumber: String(row.lot_number),
    sourceDetailId: row.source_detail_id ? String(row.source_detail_id) : null,
    carType: String(row.car_type),
    marker: String(row.marker),
    vinPattern,
    vin: row.vin ? String(row.vin) : null,
    modelYear: row.model_year == null ? null : Number(row.model_year),
    yearPage: row.year_page == null ? null : Number(row.year_page),
    status: normalizeLotStatus(String(row.status ?? "")),
    workflowState: normalizeWorkflowState(String(row.workflow_state ?? "")),
    workflowNote: row.workflow_note ? String(row.workflow_note) : null,
    auctionDate: row.auction_date ? String(row.auction_date) : null,
    auctionDateRaw: row.auction_date_raw ? String(row.auction_date_raw) : null,
    location: row.location ? String(row.location) : null,
    url: String(row.url),
    evidence: row.evidence ? String(row.evidence) : null,
    color: row.color ? String(row.color) : null,
    sourceRawJson: row.source_raw_json ? String(row.source_raw_json) : null,
    firstSeenAt: String(row.first_seen_at),
    lastSeenAt: String(row.last_seen_at),
    lastIngestedAt: String(row.last_ingested_at),
    lastSyncRunId: row.last_sync_run_id ? String(row.last_sync_run_id) : null,
    missingSince: row.missing_since ? String(row.missing_since) : null,
    missingCount: Number(row.missing_count ?? 0),
    canceledAt: row.canceled_at ? String(row.canceled_at) : null,
    approvedAt: row.approved_at ? String(row.approved_at) : null,
    removedAt: row.removed_at ? String(row.removed_at) : null,
    updatedAt: String(row.updated_at),
  };
}

function mapLotImage(row: Record<string, unknown>): LotImageRow {
  return {
    id: String(row.id),
    lotId: String(row.lot_id),
    sourceUrl: String(row.source_url),
    storagePath: String(row.storage_path),
    mimeType: row.mime_type ? String(row.mime_type) : null,
    sha256: String(row.sha256),
    byteSize: Number(row.byte_size),
    width: row.width == null ? null : Number(row.width),
    height: row.height == null ? null : Number(row.height),
    sortOrder: Number(row.sort_order ?? 0),
    createdAt: String(row.created_at),
    lastSeenAt: String(row.last_seen_at),
    lastSyncRunId: row.last_sync_run_id ? String(row.last_sync_run_id) : null,
    active: rowBool(row.active),
  };
}

function mapLotSnapshot(row: Record<string, unknown>): LotSnapshotRow {
  return {
    id: String(row.id),
    lotId: String(row.lot_id),
    syncRunId: row.sync_run_id ? String(row.sync_run_id) : null,
    observedAt: String(row.observed_at),
    isPresent: rowBool(row.is_present),
    snapshotJson: String(row.snapshot_json),
  };
}

function mapLotAction(row: Record<string, unknown>): LotActionRow {
  return {
    id: String(row.id),
    lotId: String(row.lot_id),
    action: String(row.action),
    actor: String(row.actor),
    note: row.note ? String(row.note) : null,
    metadataJson: row.metadata_json ? String(row.metadata_json) : null,
    createdAt: String(row.created_at),
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

function nullableNumber(value: unknown): number | null {
  if (value == null || value === "") {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function mapSoldPrice(row: Record<string, unknown>): SoldPriceRow {
  return {
    id: String(row.id),
    lotId: String(row.lot_id),
    lookupStatus: normalizeSoldPriceLookupStatus(String(row.lookup_status ?? "")),
    attemptCount: Number(row.attempt_count ?? 0),
    lastAttemptedAt: row.last_attempted_at ? String(row.last_attempted_at) : null,
    nextAttemptAt: row.next_attempt_at ? String(row.next_attempt_at) : null,
    foundAt: row.found_at ? String(row.found_at) : null,
    externalUrl: row.external_url ? String(row.external_url) : null,
    matchedQuery: row.matched_query ? String(row.matched_query) : null,
    matchConfidence: nullableNumber(row.match_confidence),
    finalBidUsd: nullableNumber(row.final_bid_usd),
    saleDate: row.sale_date ? String(row.sale_date) : null,
    saleDateRaw: row.sale_date_raw ? String(row.sale_date_raw) : null,
    externalSourceKey: row.external_source_key
      ? (String(row.external_source_key) as SourceKey)
      : null,
    externalSourceLabel: row.external_source_label ? String(row.external_source_label) : null,
    externalLotNumber: row.external_lot_number ? String(row.external_lot_number) : null,
    externalVin: row.external_vin ? String(row.external_vin) : null,
    condition: row.condition ? String(row.condition) : null,
    damage: row.damage ? String(row.damage) : null,
    secondaryDamage: row.secondary_damage ? String(row.secondary_damage) : null,
    mileage: row.mileage ? String(row.mileage) : null,
    location: row.location ? String(row.location) : null,
    color: row.color ? String(row.color) : null,
    seller: row.seller ? String(row.seller) : null,
    documents: row.documents ? String(row.documents) : null,
    rawJson: row.raw_json ? String(row.raw_json) : null,
    errorText: row.error_text ? String(row.error_text) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function lotListSortValue(row: LotRow): number {
  if (row.status === "done") return 9_999_999_999_999;
  if (!row.auctionDate) return 9_999_999_999_998;
  const milliseconds = Date.parse(row.auctionDate);
  return Number.isNaN(milliseconds) ? 9_999_999_999_997 : milliseconds;
}

function isExactPastAuction(lot: LotRow, nowMs: number): boolean {
  if (!lot.auctionDate || !lot.auctionDate.includes("T")) {
    return false;
  }
  const auctionMs = Date.parse(lot.auctionDate);
  return Number.isFinite(auctionMs) && auctionMs <= nowMs - 2 * 60 * 60 * 1000;
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
  constructor(
    private readonly d1: D1Database,
    private readonly images: R2Bucket,
  ) {}

  private bindParams(params: DbValue[]): DbValue[] {
    return params.map((value) => (value === undefined ? null : value));
  }

  private async all<T extends Record<string, unknown>>(
    statement: string,
    ...params: DbValue[]
  ): Promise<T[]> {
    const result = await this.d1
      .prepare(statement)
      .bind(...this.bindParams(params))
      .all<T>();
    return (result.results ?? []) as T[];
  }

  private async get<T extends Record<string, unknown>>(
    statement: string,
    ...params: DbValue[]
  ): Promise<T | null> {
    const result = await this.d1
      .prepare(statement)
      .bind(...this.bindParams(params))
      .first<T>();
    return result ?? null;
  }

  private async run(statement: string, ...params: DbValue[]): Promise<number> {
    const result = await this.d1
      .prepare(statement)
      .bind(...this.bindParams(params))
      .run();
    return Number(result.meta?.changes ?? 0);
  }

  async ensureSeeded(): Promise<void> {
    const row = await this.get<{ count: number }>("SELECT COUNT(*) AS count FROM vin_targets");
    if (Number(row?.count ?? 0) > 0) {
      return;
    }
    const now = new Date().toISOString();
    for (const target of DEFAULT_TARGETS) {
      await this.run(
        `INSERT INTO vin_targets (
          id, key, label, car_type, marker, vin_pattern, vin_prefix,
          year_from, year_to, copart_slug, iaai_path, reject_colors_json, reject_locations_json,
          enabled_copart, enabled_iaai, active, sort_order, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', '[]', ?, ?, ?, ?, ?, ?)`,
        crypto.randomUUID(),
        target.key,
        target.label,
        target.carType,
        target.marker,
        target.vinPattern,
        target.vinPrefix,
        target.yearFrom,
        target.yearTo,
        target.copartSlug,
        target.iaaiPath,
        boolFlag(target.enabledCopart),
        boolFlag(target.enabledIaai),
        boolFlag(target.active),
        target.sortOrder,
        now,
        now,
      );
    }
  }

  async getVinTargets(activeOnly = false): Promise<VinTarget[]> {
    const sql = activeOnly
      ? "SELECT * FROM vin_targets WHERE active = 1 ORDER BY sort_order, key"
      : "SELECT * FROM vin_targets ORDER BY sort_order, key";
    return (await this.all(sql)).map(mapVinTarget);
  }

  async getScrapeConfig(): Promise<{ configVersion: string; targets: VinTarget[] }> {
    const row = await this.get<{ updated_at?: string | null }>(
      "SELECT MAX(updated_at) AS updated_at FROM vin_targets WHERE active = 1",
    );
    return {
      configVersion: String(row?.updated_at ?? new Date().toISOString()),
      targets: await this.getVinTargets(true),
    };
  }

  async getRecentSyncRuns(limit = 20): Promise<Array<Record<string, unknown>>> {
    const rows = await this.all(
      `SELECT id, runner_id, runner_version, machine_name, submitted_at, started_at, completed_at,
              status, source_keys_json, covered_scopes_json, records_received, records_upserted,
              records_missing_marked, error_text
       FROM sync_runs
       ORDER BY COALESCE(completed_at, submitted_at) DESC
       LIMIT ?`,
      Math.max(1, Math.min(100, Number(limit) || 20)),
    );
    return rows.map((row) => {
      let sourceKeys: unknown = [];
      let scopes: unknown = [];
      try {
        sourceKeys = JSON.parse(String(row.source_keys_json ?? "[]"));
      } catch {
        sourceKeys = [];
      }
      try {
        scopes = JSON.parse(String(row.covered_scopes_json ?? "[]"));
      } catch {
        scopes = [];
      }
      return {
        id: row.id,
        runnerId: row.runner_id,
        runnerVersion: row.runner_version,
        machineName: row.machine_name,
        submittedAt: row.submitted_at,
        startedAt: row.started_at,
        completedAt: row.completed_at,
        status: row.status,
        sourceKeys,
        scopes,
        recordsReceived: Number(row.records_received ?? 0),
        recordsUpserted: Number(row.records_upserted ?? 0),
        recordsMissingMarked: Number(row.records_missing_marked ?? 0),
        errorText: row.error_text,
      };
    });
  }

  async getLatestCollectorIngestAt(): Promise<string | null> {
    const runRow = await this.get<{ ingested_at?: string | null }>(`
      SELECT MAX(COALESCE(completed_at, started_at, submitted_at)) AS ingested_at
      FROM sync_runs
      WHERE status = 'complete'
    `);
    if (runRow?.ingested_at) {
      return String(runRow.ingested_at);
    }
    const lotRow = await this.get<{ ingested_at?: string | null }>(
      "SELECT MAX(last_ingested_at) AS ingested_at FROM lots",
    );
    return lotRow?.ingested_at ? String(lotRow.ingested_at) : null;
  }

  private async getNextVinTargetSortOrder(): Promise<number> {
    const row = await this.get<{ sort_order?: number | null }>(
      "SELECT COALESCE(MAX(sort_order), 0) AS sort_order FROM vin_targets",
    );
    return Number(row?.sort_order ?? 0) + 10;
  }

  async upsertVinTarget(input: Partial<VinTarget> & { vinPattern: string }): Promise<string> {
    const validationError = getVinTargetValidationError(input.vinPattern);
    if (validationError) throw new Error(validationError);
    const inferred = inferVinTargetDefinition(input.vinPattern);
    if (!inferred.vinPattern) throw new Error("VIN pattern is required.");
    const existingRow = await this.get(
      "SELECT * FROM vin_targets WHERE id = ? OR key = ? LIMIT 1",
      input.id ?? "",
      input.key ?? inferred.key,
    );
    const existing = existingRow ? mapVinTarget(existingRow) : null;
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
    const next = {
      id: input.id ?? (existing ? existing.id : crypto.randomUUID()),
      key: input.key ?? (existing ? existing.key : inferred.key),
      label,
      carType,
      marker,
      vinPattern: inferred.vinPattern,
      vinPrefix: inferred.vinPrefix,
      yearFrom,
      yearTo,
      copartSlug,
      iaaiPath,
      rejectColors: normalizeStringList(input.rejectColors ?? existing?.rejectColors ?? []),
      rejectLocations: normalizeStringList(
        input.rejectLocations ?? existing?.rejectLocations ?? [],
      ),
      enabledCopart: input.enabledCopart ?? (existing ? existing.enabledCopart : true),
      enabledIaai:
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
            })),
      active: input.active ?? (existing ? existing.active : true),
      sortOrder:
        input.sortOrder ?? (existing ? existing.sortOrder : await this.getNextVinTargetSortOrder()),
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
    };

    await this.run(
      `INSERT INTO vin_targets (
        id, key, label, car_type, marker, vin_pattern, vin_prefix,
        year_from, year_to, copart_slug, iaai_path, reject_colors_json, reject_locations_json,
        enabled_copart, enabled_iaai, active, sort_order, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        key = excluded.key,
        label = excluded.label,
        car_type = excluded.car_type,
        marker = excluded.marker,
        vin_pattern = excluded.vin_pattern,
        vin_prefix = excluded.vin_prefix,
        year_from = excluded.year_from,
        year_to = excluded.year_to,
        copart_slug = excluded.copart_slug,
        iaai_path = excluded.iaai_path,
        reject_colors_json = excluded.reject_colors_json,
        reject_locations_json = excluded.reject_locations_json,
        enabled_copart = excluded.enabled_copart,
        enabled_iaai = excluded.enabled_iaai,
        active = excluded.active,
        sort_order = excluded.sort_order,
        updated_at = excluded.updated_at`,
      next.id,
      next.key,
      next.label,
      next.carType,
      next.marker,
      next.vinPattern,
      next.vinPrefix,
      next.yearFrom,
      next.yearTo,
      next.copartSlug,
      next.iaaiPath,
      JSON.stringify(next.rejectColors),
      JSON.stringify(next.rejectLocations),
      boolFlag(next.enabledCopart),
      boolFlag(next.enabledIaai),
      boolFlag(next.active),
      next.sortOrder,
      next.createdAt,
      next.updatedAt,
    );
    return next.id;
  }

  async removeVinTarget(id: string): Promise<void> {
    const changes = await this.run("DELETE FROM vin_targets WHERE id = ?", id);
    if (changes === 0) {
      throw new Error("Target not found.");
    }
  }

  async getLotList(includeRemoved = false): Promise<LotListItem[]> {
    const rows = await this.all(
      `
      SELECT
        l.*,
        (
          SELECT li.id
          FROM lot_images li
          WHERE li.lot_id = l.id AND li.active = 1
          ORDER BY li.sort_order, li.created_at
          LIMIT 1
        ) AS primary_image_id,
        (
          SELECT COUNT(*)
          FROM lot_images li
          WHERE li.lot_id = l.id AND li.active = 1
        ) AS image_count
      FROM lots l
      WHERE (? = 1 OR l.workflow_state != 'removed')
      ORDER BY l.updated_at DESC
    `,
      boolFlag(includeRemoved),
    );

    return rows
      .map((row) => ({
        ...mapLotRow(row),
        primaryImageId: row.primary_image_id ? String(row.primary_image_id) : null,
        imageCount: Number(row.image_count ?? 0),
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
    const lotRow = await this.get(
      "SELECT * FROM lots WHERE source_key = ? AND lot_number = ? LIMIT 1",
      sourceKey,
      lotNumber,
    );
    if (!lotRow) return null;
    const lot = mapLotRow(lotRow);
    const images = (
      await this.all(
        "SELECT * FROM lot_images WHERE lot_id = ? AND active = 1 ORDER BY sort_order, created_at",
        lot.id,
      )
    ).map(mapLotImage);
    const snapshots = (
      await this.all(
        "SELECT * FROM lot_snapshots WHERE lot_id = ? ORDER BY observed_at DESC",
        lot.id,
      )
    ).map(mapLotSnapshot);
    const actions = (
      await this.all("SELECT * FROM lot_actions WHERE lot_id = ? ORDER BY created_at DESC", lot.id)
    ).map(mapLotAction);
    const soldPriceRow = await this.get(
      "SELECT * FROM lot_sold_prices WHERE lot_id = ? LIMIT 1",
      lot.id,
    );
    return {
      lot,
      images,
      snapshots,
      actions,
      soldPrice: soldPriceRow ? mapSoldPrice(soldPriceRow) : null,
    };
  }

  async getImageRow(imageId: string): Promise<LotImageRow | null> {
    const row = await this.get("SELECT * FROM lot_images WHERE id = ? LIMIT 1", imageId);
    return row ? mapLotImage(row) : null;
  }

  async getLotImageSyncState(sourceKey: SourceKey, lotNumber: string): Promise<LotImageRow | null> {
    const row = await this.get(
      `
      SELECT li.*
      FROM lot_images li
      INNER JOIN lots l ON l.id = li.lot_id
      WHERE l.source_key = ? AND l.lot_number = ? AND li.active = 1
      LIMIT 1
    `,
      sourceKey,
      lotNumber,
    );
    return row ? mapLotImage(row) : null;
  }

  async getImageObject(
    imageId: string,
  ): Promise<{ image: LotImageRow; object: R2ObjectBody } | null> {
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
    const lotRow = await this.get("SELECT * FROM lots WHERE id = ? LIMIT 1", lotId);
    if (!lotRow) throw new Error(`Unknown lot ${lotId}`);
    const approvedAt =
      workflowState === "approved"
        ? now
        : workflowState === "removed"
          ? lotRow.approved_at
            ? String(lotRow.approved_at)
            : null
          : null;
    const removedAt = workflowState === "removed" ? now : null;
    await this.run(
      `UPDATE lots
       SET workflow_state = ?, workflow_note = ?, approved_at = ?, removed_at = ?, updated_at = ?
       WHERE id = ?`,
      workflowState,
      note,
      approvedAt,
      removedAt,
      now,
      lotId,
    );
    await this.run(
      `INSERT INTO lot_actions (id, lot_id, action, actor, note, metadata_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      crypto.randomUUID(),
      lotId,
      workflowState,
      actor,
      note,
      null,
      now,
    );
  }

  async hardDeleteLot(lotId: string): Promise<boolean> {
    const lotRow = await this.get("SELECT id FROM lots WHERE id = ? LIMIT 1", lotId);
    if (!lotRow) return false;
    const imageRows = await this.all<{ storage_path: string | null }>(
      "SELECT storage_path FROM lot_images WHERE lot_id = ?",
      lotId,
    );
    await this.run("DELETE FROM lot_notification_log WHERE lot_id = ?", lotId);
    await this.run("DELETE FROM lots WHERE id = ?", lotId);
    await Promise.allSettled(
      imageRows.map((row) =>
        row.storage_path ? this.images.delete(row.storage_path) : Promise.resolve(),
      ),
    );
    return true;
  }

  async getSoldPriceQueue(limit = 20): Promise<SoldPriceQueueItem[]> {
    const nowIso = new Date().toISOString();
    const nowMs = Date.parse(nowIso);
    const boundedLimit = Math.max(1, Math.min(100, Number(limit) || 20));
    const soldPriceRows = (await this.all("SELECT * FROM lot_sold_prices")).map(mapSoldPrice);
    const soldPriceByLotId = new Map(soldPriceRows.map((row) => [row.lotId, row]));
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
    const lotRow = await this.get("SELECT id FROM lots WHERE id = ? LIMIT 1", input.lotId);
    if (!lotRow) return false;
    const existingRow = await this.get(
      "SELECT * FROM lot_sold_prices WHERE lot_id = ? LIMIT 1",
      input.lotId,
    );
    const existing = existingRow ? mapSoldPrice(existingRow) : null;
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
      await this.run(
        `UPDATE lot_sold_prices
         SET attempt_count = ?, last_attempted_at = ?, error_text = COALESCE(?, error_text), updated_at = ?
         WHERE lot_id = ?`,
        nextAttemptCount,
        now,
        errorText,
        now,
        input.lotId,
      );
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
    await this.run(
      `INSERT INTO lot_sold_prices (
        id, lot_id, lookup_status, attempt_count, last_attempted_at, next_attempt_at, found_at,
        external_url, matched_query, match_confidence, final_bid_usd, sale_date, sale_date_raw,
        external_source_key, external_source_label, external_lot_number, external_vin,
        condition, damage, secondary_damage, mileage, location, color, seller, documents,
        raw_json, error_text, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(lot_id) DO UPDATE SET
        lookup_status = excluded.lookup_status,
        attempt_count = excluded.attempt_count,
        last_attempted_at = excluded.last_attempted_at,
        next_attempt_at = excluded.next_attempt_at,
        found_at = excluded.found_at,
        external_url = excluded.external_url,
        matched_query = excluded.matched_query,
        match_confidence = excluded.match_confidence,
        final_bid_usd = excluded.final_bid_usd,
        sale_date = excluded.sale_date,
        sale_date_raw = excluded.sale_date_raw,
        external_source_key = excluded.external_source_key,
        external_source_label = excluded.external_source_label,
        external_lot_number = excluded.external_lot_number,
        external_vin = excluded.external_vin,
        condition = excluded.condition,
        damage = excluded.damage,
        secondary_damage = excluded.secondary_damage,
        mileage = excluded.mileage,
        location = excluded.location,
        color = excluded.color,
        seller = excluded.seller,
        documents = excluded.documents,
        raw_json = excluded.raw_json,
        error_text = excluded.error_text,
        updated_at = excluded.updated_at`,
      id,
      input.lotId,
      lookupStatus,
      nextAttemptCount,
      now,
      nextAttemptAt,
      foundAt,
      normalizedTextOrNull(input.externalUrl),
      normalizedTextOrNull(input.matchedQuery),
      matchConfidence,
      lookupStatus === "found" ? finalBidUsd : null,
      lookupStatus === "found" ? normalizedTextOrNull(input.saleDate) : null,
      lookupStatus === "found" ? normalizedTextOrNull(input.saleDateRaw) : null,
      lookupStatus === "found" ? externalSourceKey : null,
      lookupStatus === "found" ? normalizedTextOrNull(input.externalSourceLabel) : null,
      lookupStatus === "found" ? normalizedTextOrNull(input.externalLotNumber) : null,
      lookupStatus === "found" ? normalizedTextOrNull(input.externalVin) : null,
      lookupStatus === "found" ? normalizedTextOrNull(input.condition) : null,
      lookupStatus === "found" ? normalizedTextOrNull(input.damage) : null,
      lookupStatus === "found" ? normalizedTextOrNull(input.secondaryDamage) : null,
      lookupStatus === "found" ? normalizedTextOrNull(input.mileage) : null,
      lookupStatus === "found" ? normalizedTextOrNull(input.location) : null,
      lookupStatus === "found" ? normalizedTextOrNull(input.color) : null,
      lookupStatus === "found" ? normalizedTextOrNull(input.seller) : null,
      lookupStatus === "found" ? normalizedTextOrNull(input.documents) : null,
      rawJson,
      errorText,
      createdAt,
      now,
    );

    if (lookupStatus === "found") {
      const externalVin = normalizedTextOrNull(input.externalVin);
      if (externalVin && /^[A-HJ-NPR-Z0-9]{17}$/i.test(externalVin)) {
        await this.run(
          "UPDATE lots SET vin = ?, updated_at = ? WHERE id = ?",
          externalVin.toUpperCase(),
          now,
          input.lotId,
        );
      }
    }
    return true;
  }

  async getSoldPriceExplorerItems(): Promise<SoldPriceExplorerItem[]> {
    const publicLots = await this.getPublicLotList();
    const publicLotsById = new Map(publicLots.map((lot) => [lot.id, lot]));
    const soldRows = (
      await this.all(`
      SELECT *
      FROM lot_sold_prices
      WHERE lookup_status = 'found' AND final_bid_usd IS NOT NULL
    `)
    ).map(mapSoldPrice);
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
    await this.run(
      `INSERT INTO sync_runs (
        id, runner_id, runner_version, machine_name, submitted_at, started_at, completed_at,
        status, source_keys_json, covered_scopes_json, records_received
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      runId,
      payload.run.runnerId,
      payload.run.runnerVersion,
      payload.run.machineName,
      submittedAt,
      payload.run.startedAt,
      completedAt,
      "running",
      JSON.stringify(payload.run.sourceKeys),
      JSON.stringify(payload.run.scopes),
      payload.records.length,
    );

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
    await this.run(
      `UPDATE sync_runs
       SET status = ?, records_upserted = ?, records_missing_marked = ?, completed_at = ?
       WHERE id = ?`,
      "complete",
      upserted,
      missingMarked,
      completedAt,
      runId,
    );
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
  }): Promise<LotImageRow> {
    const lotRow = await this.get(
      "SELECT * FROM lots WHERE source_key = ? AND lot_number = ? LIMIT 1",
      input.sourceKey,
      input.lotNumber,
    );
    if (!lotRow) throw new Error(`Unknown lot ${input.sourceKey}:${input.lotNumber}`);
    const lot = mapLotRow(lotRow);
    const bytes = Uint8Array.from(atob(input.dataBase64), (char) => char.charCodeAt(0));
    const sha256 = await sha256Hex(bytes);
    const mimeType = input.mimeType || "application/octet-stream";
    const extension = extFromMimeType(mimeType);
    const storagePath = `${input.sourceKey}/${input.lotNumber}/${sha256}.${extension}`;
    const now = new Date().toISOString();
    const existingRow = await this.get("SELECT * FROM lot_images WHERE lot_id = ? LIMIT 1", lot.id);
    const existingImage = existingRow ? mapLotImage(existingRow) : null;

    if (existingImage && existingImage.sha256 === sha256) {
      await this.images.put(storagePath, bytes, { httpMetadata: { contentType: mimeType } });
      await this.run(
        `UPDATE lot_images
         SET source_url = ?, storage_path = ?, mime_type = ?, sha256 = ?, byte_size = ?, width = ?, height = ?,
             sort_order = 0, last_seen_at = ?, last_sync_run_id = ?, active = 1
         WHERE id = ?`,
        input.sourceUrl,
        storagePath,
        mimeType,
        sha256,
        bytes.length,
        input.width ?? null,
        input.height ?? null,
        now,
        input.runId,
        existingImage.id,
      );
      if (existingImage.storagePath !== storagePath) {
        await this.images.delete(existingImage.storagePath).catch(() => {});
      }
      const next = await this.get("SELECT * FROM lot_images WHERE id = ?", existingImage.id);
      return mapLotImage(next!);
    }

    if (
      existingImage &&
      hasProtectedImageDimensions(existingImage.width, existingImage.height) &&
      !hasProtectedImageDimensions(input.width ?? null, input.height ?? null)
    ) {
      return existingImage;
    }

    if (existingImage) {
      await this.run("DELETE FROM lot_images WHERE id = ?", existingImage.id);
      await this.images.delete(existingImage.storagePath).catch(() => {});
    }

    await this.images.put(storagePath, bytes, { httpMetadata: { contentType: mimeType } });
    const id = crypto.randomUUID();
    await this.run(
      `INSERT INTO lot_images (
        id, lot_id, source_url, storage_path, mime_type, sha256, byte_size,
        width, height, sort_order, created_at, last_seen_at, last_sync_run_id, active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      id,
      lot.id,
      input.sourceUrl,
      storagePath,
      mimeType,
      sha256,
      bytes.length,
      input.width ?? null,
      input.height ?? null,
      0,
      now,
      now,
      input.runId,
    );
    const next = await this.get("SELECT * FROM lot_images WHERE id = ?", id);
    return mapLotImage(next!);
  }

  private async applyTargetMetadataUpdate(
    update: VinTargetMetadataUpdate,
    observedAt: string,
  ): Promise<boolean> {
    if (!update.targetKey) return false;
    const existingRow = await this.get(
      "SELECT * FROM vin_targets WHERE key = ? LIMIT 1",
      update.targetKey,
    );
    if (!existingRow) return false;
    const existing = mapVinTarget(existingRow);
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
    const changes = await this.run(
      `UPDATE vin_targets
       SET label = ?, car_type = ?, marker = ?, year_from = ?, year_to = ?, enabled_iaai = ?, updated_at = ?
       WHERE id = ?`,
      shouldReplaceMetadata ? nextLabel : existing.label,
      shouldReplaceMetadata ? nextCarType : existing.carType,
      shouldReplaceMetadata ? nextMarker : existing.marker,
      shouldReplaceYears ? nextYearFrom : existing.yearFrom,
      shouldReplaceYears ? nextYearTo : existing.yearTo,
      shouldReplaceMetadata ? 1 : boolFlag(existing.enabledIaai),
      observedAt,
      existing.id,
    );
    return changes > 0;
  }

  private async getResolvedTargetMetadata(
    targetKey: string | null | undefined,
  ): Promise<Pick<VinTarget, "carType" | "marker"> | null> {
    if (!targetKey) return null;
    const row = await this.get("SELECT * FROM vin_targets WHERE key = ? LIMIT 1", targetKey);
    if (!row) return null;
    const target = mapVinTarget(row);
    return isGenericVinTargetMetadata(target)
      ? null
      : { carType: target.carType, marker: target.marker };
  }

  private async upsertLotRecord(
    runId: string,
    observedAt: string,
    record: ScrapedLotRecord,
  ): Promise<void> {
    const existing = await this.get(
      "SELECT * FROM lots WHERE source_key = ? AND lot_number = ? LIMIT 1",
      record.sourceKey,
      record.lotNumber,
    );
    const resolvedTarget = await this.getResolvedTargetMetadata(record.targetKey);
    const nextStatus = normalizeLotStatus(record.status);
    if (existing) {
      const current = mapLotRow(existing);
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
      await this.run(
        `UPDATE lots
         SET source_label = ?, target_key = ?, source_detail_id = ?, car_type = ?, marker = ?,
             vin_pattern = ?, vin = ?, model_year = ?, year_page = ?, status = ?,
             auction_date = ?, auction_date_raw = ?, location = ?, url = ?, evidence = ?, color = ?,
             source_raw_json = ?, last_seen_at = ?, last_ingested_at = ?, last_sync_run_id = ?,
             missing_since = NULL, missing_count = 0,
             canceled_at = CASE WHEN ? IN ('upcoming', 'done', 'unknown') THEN NULL ELSE canceled_at END,
             updated_at = ?
         WHERE id = ?`,
        mergedSourceLabel,
        mergedTargetKey,
        mergedSourceDetailId,
        mergedCarType,
        mergedMarker,
        mergedVinPattern,
        mergedVin,
        mergedModelYear,
        mergedYearPage,
        mergedStatus,
        mergedAuctionDate,
        mergedAuctionDateRaw,
        mergedLocation,
        mergedUrl,
        mergedEvidence,
        mergedColor,
        mergedSourceRawJson,
        observedAt,
        observedAt,
        runId,
        mergedStatus,
        observedAt,
        current.id,
      );
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
    await this.run(
      `INSERT INTO lots (
        id, source_key, source_label, target_key, lot_number, source_detail_id,
        car_type, marker, vin_pattern, vin, model_year, year_page, status,
        workflow_state, workflow_note, auction_date, auction_date_raw, location,
        url, evidence, color, source_raw_json, first_seen_at, last_seen_at, last_ingested_at, last_sync_run_id,
        missing_since, missing_count, canceled_at, approved_at, removed_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, NULL, NULL, NULL, ?)`,
      id,
      record.sourceKey,
      preferredText(record.sourceLabel, null) || normalizeSourceLabel(record.sourceKey),
      preferredText(record.targetKey, null),
      record.lotNumber,
      preferredText(record.sourceDetailId, null),
      resolvedCarType,
      resolvedMarker,
      preferredText(record.vinPattern, null),
      preferredText(record.vin, null),
      preferredNumber(record.modelYear, null),
      preferredNumber(record.yearPage, null),
      nextStatus,
      preferredText(record.auctionDate, null),
      preferredText(record.auctionDateRaw, null),
      preferredText(record.location, null),
      preferredText(record.url, null) || "",
      preferredText(record.evidence, null),
      preferredText(record.color, null),
      serializeJsonOrNull(record.sourceRaw),
      observedAt,
      observedAt,
      observedAt,
      runId,
      observedAt,
    );
    await this.insertSnapshot(id, runId, observedAt, true, record);
  }

  private async insertSnapshot(
    lotId: string,
    runId: string,
    observedAt: string,
    isPresent: boolean,
    record: ScrapedLotRecord | null,
  ): Promise<void> {
    await this.run(
      `INSERT OR REPLACE INTO lot_snapshots (id, lot_id, sync_run_id, observed_at, is_present, snapshot_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
      `${lotId}:${runId}:${isPresent ? "present" : "missing"}`,
      lotId,
      runId,
      observedAt,
      boolFlag(isPresent),
      JSON.stringify(record ?? null),
    );
  }

  private async reconcileMissingLots(
    runId: string,
    observedAt: string,
    scope: RunnerScope,
    presentLotNumbers: Set<string>,
  ): Promise<number> {
    const existingRows = await this.all(
      "SELECT * FROM lots WHERE source_key = ? AND target_key = ?",
      scope.sourceKey,
      scope.targetKey,
    );
    let missingMarked = 0;
    const scopeReportedZeroLots = presentLotNumbers.size === 0;
    for (const row of existingRows) {
      const lot = mapLotRow(row);
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
      await this.run(
        `UPDATE lots
         SET status = ?, missing_since = COALESCE(missing_since, ?), missing_count = ?,
             canceled_at = CASE WHEN ? = 'canceled' THEN COALESCE(canceled_at, ?) ELSE canceled_at END,
             last_ingested_at = ?, last_sync_run_id = ?, updated_at = ?
         WHERE id = ?`,
        nextStatus,
        observedAt,
        nextMissingCount,
        nextStatus,
        observedAt,
        observedAt,
        runId,
        observedAt,
        lot.id,
      );
      await this.insertSnapshot(lot.id, runId, observedAt, false, null);
      missingMarked += 1;
    }
    return missingMarked;
  }

  async applyTargetBlacklistToExistingLots(): Promise<{ updated: number }> {
    const targets = await this.getVinTargets(true);
    const targetByKey = new Map(targets.map((target) => [target.key, target]));
    const lots = await this.getLotList(false);
    let updated = 0;
    for (const lot of lots) {
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
    await this.run(
      `INSERT INTO push_subscriptions (id, endpoint, p256dh, auth, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth`,
      crypto.randomUUID(),
      endpoint,
      p256dh,
      auth,
      new Date().toISOString(),
    );
  }

  async removePushSubscription(endpoint: string): Promise<void> {
    await this.run("DELETE FROM push_subscriptions WHERE endpoint = ?", endpoint);
  }

  async getPushSubscriptions(): Promise<
    Array<{ id: string; endpoint: string; p256dh: string; auth: string }>
  > {
    return await this.all("SELECT id, endpoint, p256dh, auth FROM push_subscriptions");
  }

  async getLotsToNotify12h(): Promise<
    Array<{ id: string; lot_number: string; source_key: string; marker: string }>
  > {
    return await this.all(`
      SELECT id, lot_number, source_key, marker
      FROM lots
      WHERE status = 'upcoming'
        AND workflow_state != 'removed'
        AND auction_date LIKE '%T%'
        AND datetime(auction_date) > datetime('now')
        AND datetime(auction_date) <= datetime('now', '+12 hours')
        AND id NOT IN (SELECT lot_id FROM lot_notification_log WHERE event_type = 'threshold_12h')
    `);
  }

  async getLotsToNotify30m(): Promise<
    Array<{ id: string; lot_number: string; source_key: string; marker: string }>
  > {
    return await this.all(`
      SELECT id, lot_number, source_key, marker
      FROM lots
      WHERE status = 'upcoming'
        AND workflow_state != 'removed'
        AND auction_date LIKE '%T%'
        AND datetime(auction_date) > datetime('now')
        AND datetime(auction_date) <= datetime('now', '+30 minutes')
        AND id NOT IN (SELECT lot_id FROM lot_notification_log WHERE event_type = 'threshold_30m')
    `);
  }

  async recordLotNotification(lotId: string, eventType: string): Promise<void> {
    await this.run(
      `INSERT OR IGNORE INTO lot_notification_log (lot_id, event_type, notified_at)
       VALUES (?, ?, ?)`,
      lotId,
      eventType,
      new Date().toISOString(),
    );
  }
}
