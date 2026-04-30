import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Database } from "bun:sqlite";

import { DEFAULT_TARGETS } from "../lib/default-targets";
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
} from "../lib/types";
import { extFromMimeType, normalizeWhitespace, sha256Hex } from "../lib/utils";
import {
  deriveVinPrefix,
  getVinTargetValidationError,
  hasGenericVinTargetYearRange,
  inferVinTargetDefinition,
  isGenericVinTargetMetadata,
  normalizeVinPattern,
} from "../lib/vin-patterns";
import { createSqliteDatabase } from "./sqlite";

export interface StoreOptions {
  databasePath: string;
  mediaDir: string;
}

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

function normalizeSourceLabel(sourceKey: SourceKey): string {
  return sourceKey === "iaai" ? "IAAI" : "Copart";
}

function buildGenericTargetMetadata(vinPattern: string): Pick<VinTarget, "label" | "carType" | "marker"> {
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

function preferredText(next: string | null | undefined, fallback: string | null | undefined): string | null {
  return normalizedTextOrNull(next) ?? normalizedTextOrNull(fallback);
}

function preferredNumber(next: number | null | undefined, fallback: number | null | undefined): number | null {
  return next == null ? fallback ?? null : Number(next);
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

function shouldPreserveKnownLotStatus(nextStatus: LotRow["status"], currentStatus: LotRow["status"]): boolean {
  return nextStatus === "unknown" && (currentStatus === "upcoming" || currentStatus === "done");
}

function hasProtectedImageDimensions(width: number | null | undefined, height: number | null | undefined): boolean {
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

function normalizeSoldPriceLookupStatus(status: string | null | undefined): SoldPriceRow["lookupStatus"] {
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
    bidfaxUrl: row.bidfax_url ? String(row.bidfax_url) : null,
    matchedQuery: row.matched_query ? String(row.matched_query) : null,
    matchConfidence: nullableNumber(row.match_confidence),
    finalBidUsd: nullableNumber(row.final_bid_usd),
    saleDate: row.sale_date ? String(row.sale_date) : null,
    saleDateRaw: row.sale_date_raw ? String(row.sale_date_raw) : null,
    externalSourceKey: row.external_source_key ? String(row.external_source_key) as SourceKey : null,
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
  if (row.status === "done") {
    return 9_999_999_999_999;
  }
  if (!row.auctionDate) {
    return 9_999_999_999_998;
  }
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

function getNextSoldPriceAttemptAt(status: SoldPriceRow["lookupStatus"], attemptCount: number, nowIso: string): string | null {
  if (status === "found") {
    return null;
  }
  const exponent = Math.max(0, Math.min(8, attemptCount - 1));
  const hours = status === "not_found"
    ? Math.min(72, 6 * (2 ** exponent))
    : Math.min(24, 2 ** exponent);
  return new Date(Date.parse(nowIso) + hours * 60 * 60 * 1000).toISOString();
}

function median(values: number[]): number | null {
  if (!values.length) {
    return null;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle];
  }
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function quartiles(values: number[]): Pick<SoldPriceStats, "medianUsd" | "q1Usd" | "q3Usd" | "iqrUsd"> {
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
  return {
    medianUsd,
    q1Usd,
    q3Usd,
    iqrUsd: q1Usd == null || q3Usd == null ? null : q3Usd - q1Usd,
  };
}

function buildSoldPriceStats(items: Array<LotListItem & { soldPrice: SoldPriceRow }>): SoldPriceExplorerItem[] {
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
    if (values.length >= 5 && price != null && stats.q1Usd != null && stats.q3Usd != null && stats.iqrUsd != null) {
      const lowFence = stats.q1Usd - 1.5 * stats.iqrUsd;
      const highFence = stats.q3Usd + 1.5 * stats.iqrUsd;
      outlier = price < lowFence ? "low" : price > highFence ? "high" : null;
    }
    return {
      ...item,
      stats: {
        groupKey,
        groupLabel: [item.sourceLabel, item.carType, item.modelYear ? String(item.modelYear) : null].filter(Boolean).join(" · "),
        groupCount: values.length,
        ...stats,
        deltaUsd,
        deltaPercent,
        outlier,
      },
    };
  });
}

export class AuctionStore {
  readonly db: Database;
  readonly mediaDir: string;

  constructor(options: StoreOptions) {
    mkdirSync(path.dirname(options.databasePath), { recursive: true });
    mkdirSync(options.mediaDir, { recursive: true });
    this.mediaDir = options.mediaDir;
    this.db = createSqliteDatabase(options.databasePath, { strict: true });
    this.initSchema();
    this.normalizeLotImages();
    this.ensureSingleLotImageConstraint();
    this.seedDefaultTargets();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS vin_targets (
        id TEXT PRIMARY KEY,
        key TEXT NOT NULL UNIQUE,
        label TEXT NOT NULL,
        car_type TEXT NOT NULL,
        marker TEXT NOT NULL,
        vin_pattern TEXT NOT NULL,
        vin_prefix TEXT NOT NULL,
        year_from INTEGER NOT NULL,
        year_to INTEGER NOT NULL,
        copart_slug TEXT NOT NULL,
        iaai_path TEXT NOT NULL,
        enabled_copart INTEGER NOT NULL DEFAULT 1,
        enabled_iaai INTEGER NOT NULL DEFAULT 1,
        active INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sync_runs (
        id TEXT PRIMARY KEY,
        runner_id TEXT,
        runner_version TEXT,
        machine_name TEXT,
        submitted_at TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT,
        status TEXT NOT NULL,
        source_keys_json TEXT NOT NULL,
        covered_scopes_json TEXT NOT NULL,
        records_received INTEGER NOT NULL DEFAULT 0,
        records_upserted INTEGER NOT NULL DEFAULT 0,
        records_missing_marked INTEGER NOT NULL DEFAULT 0,
        error_text TEXT
      );

      CREATE TABLE IF NOT EXISTS lots (
        id TEXT PRIMARY KEY,
        source_key TEXT NOT NULL,
        source_label TEXT NOT NULL,
        target_key TEXT,
        lot_number TEXT NOT NULL,
        source_detail_id TEXT,
        car_type TEXT NOT NULL,
        marker TEXT NOT NULL,
        vin_pattern TEXT,
        vin TEXT,
        model_year INTEGER,
        year_page INTEGER,
        status TEXT NOT NULL,
        workflow_state TEXT NOT NULL DEFAULT 'new',
        workflow_note TEXT,
        auction_date TEXT,
        auction_date_raw TEXT,
        location TEXT,
        url TEXT NOT NULL,
        evidence TEXT,
        color TEXT,
        source_raw_json TEXT,
        first_seen_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        last_ingested_at TEXT NOT NULL,
        last_sync_run_id TEXT,
        missing_since TEXT,
        missing_count INTEGER NOT NULL DEFAULT 0,
        canceled_at TEXT,
        approved_at TEXT,
        removed_at TEXT,
        updated_at TEXT NOT NULL,
        UNIQUE(source_key, lot_number)
      );

      CREATE TABLE IF NOT EXISTS lot_snapshots (
        id TEXT PRIMARY KEY,
        lot_id TEXT NOT NULL REFERENCES lots(id) ON DELETE CASCADE,
        sync_run_id TEXT REFERENCES sync_runs(id) ON DELETE SET NULL,
        observed_at TEXT NOT NULL,
        is_present INTEGER NOT NULL DEFAULT 1,
        snapshot_json TEXT NOT NULL,
        UNIQUE(lot_id, sync_run_id, is_present)
      );

      CREATE TABLE IF NOT EXISTS lot_actions (
        id TEXT PRIMARY KEY,
        lot_id TEXT NOT NULL REFERENCES lots(id) ON DELETE CASCADE,
        action TEXT NOT NULL,
        actor TEXT NOT NULL,
        note TEXT,
        metadata_json TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS lot_images (
        id TEXT PRIMARY KEY,
        lot_id TEXT NOT NULL REFERENCES lots(id) ON DELETE CASCADE,
        source_url TEXT NOT NULL,
        storage_path TEXT NOT NULL,
        mime_type TEXT,
        sha256 TEXT NOT NULL,
        byte_size INTEGER NOT NULL,
        width INTEGER,
        height INTEGER,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        last_sync_run_id TEXT,
        active INTEGER NOT NULL DEFAULT 1,
        UNIQUE(lot_id, sha256)
      );

      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id TEXT PRIMARY KEY,
        endpoint TEXT NOT NULL UNIQUE,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS lot_notification_log (
        lot_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        notified_at TEXT NOT NULL,
        PRIMARY KEY (lot_id, event_type)
      );

      CREATE TABLE IF NOT EXISTS lot_sold_prices (
        id TEXT PRIMARY KEY,
        lot_id TEXT NOT NULL UNIQUE REFERENCES lots(id) ON DELETE CASCADE,
        lookup_status TEXT NOT NULL,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        last_attempted_at TEXT,
        next_attempt_at TEXT,
        found_at TEXT,
        bidfax_url TEXT,
        matched_query TEXT,
        match_confidence REAL,
        final_bid_usd INTEGER,
        sale_date TEXT,
        sale_date_raw TEXT,
        external_source_key TEXT,
        external_source_label TEXT,
        external_lot_number TEXT,
        external_vin TEXT,
        condition TEXT,
        damage TEXT,
        secondary_damage TEXT,
        mileage TEXT,
        location TEXT,
        color TEXT,
        seller TEXT,
        documents TEXT,
        raw_json TEXT,
        error_text TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_lots_source_target ON lots(source_key, target_key);
      CREATE INDEX IF NOT EXISTS idx_lots_workflow ON lots(workflow_state);
      CREATE INDEX IF NOT EXISTS idx_lot_images_lot_id ON lot_images(lot_id);
      CREATE INDEX IF NOT EXISTS idx_snapshots_lot_id ON lot_snapshots(lot_id);
      CREATE INDEX IF NOT EXISTS idx_actions_lot_id ON lot_actions(lot_id);
      CREATE INDEX IF NOT EXISTS idx_sold_prices_status_due ON lot_sold_prices(lookup_status, next_attempt_at);
      CREATE INDEX IF NOT EXISTS idx_sold_prices_final_bid ON lot_sold_prices(final_bid_usd);
    `);

    const lotColumns = new Set(
      (this.db.query("PRAGMA table_info(lots)").all() as Array<Record<string, unknown>>).map((row) => String(row.name)),
    );
    if (!lotColumns.has("color")) {
      this.db.exec("ALTER TABLE lots ADD COLUMN color TEXT");
    }
    if (!lotColumns.has("source_raw_json")) {
      this.db.exec("ALTER TABLE lots ADD COLUMN source_raw_json TEXT");
    }
  }

  private seedDefaultTargets(): void {
    const countRow = this.db.query("SELECT COUNT(*) AS count FROM vin_targets").get() as { count: number };
    if (Number(countRow?.count ?? 0) > 0) {
      return;
    }

    const insert = this.db.query(`
      INSERT INTO vin_targets (
        id, key, label, car_type, marker, vin_pattern, vin_prefix,
        year_from, year_to, copart_slug, iaai_path,
        enabled_copart, enabled_iaai, active, sort_order,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const now = new Date().toISOString();
    for (const target of DEFAULT_TARGETS) {
      insert.run(
        randomUUID(),
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

  private removeStoredImageFile(storagePath: string | null | undefined): void {
    if (!storagePath) {
      return;
    }
    try {
      rmSync(path.join(this.mediaDir, storagePath), { force: true });
    } catch {
      // ignore storage cleanup failures
    }
  }

  private normalizeLotImages(): void {
    const rows = this.db.query(`
      SELECT *
      FROM lot_images
      ORDER BY lot_id, active DESC, sort_order ASC, last_seen_at DESC, created_at DESC, id DESC
    `).all() as Record<string, unknown>[];

    const seenLotIds = new Set<string>();
    for (const row of rows) {
      const image = mapLotImage(row);
      if (!seenLotIds.has(image.lotId)) {
        seenLotIds.add(image.lotId);
        this.db.query(`
          UPDATE lot_images
          SET active = 1, sort_order = 0
          WHERE id = ?
        `).run(image.id);
        continue;
      }

      this.db.query("DELETE FROM lot_images WHERE id = ?").run(image.id);
      this.removeStoredImageFile(image.storagePath);
    }
  }

  private ensureSingleLotImageConstraint(): void {
    this.db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_lot_images_single_lot ON lot_images(lot_id);
    `);
  }

  getVinTargets(activeOnly = false): VinTarget[] {
    const sql = activeOnly
      ? "SELECT * FROM vin_targets WHERE active = 1 ORDER BY sort_order, key"
      : "SELECT * FROM vin_targets ORDER BY sort_order, key";
    return (this.db.query(sql).all() as Record<string, unknown>[]).map(mapVinTarget);
  }

  getScrapeConfig(): { configVersion: string; targets: VinTarget[] } {
    const row = this.db.query("SELECT MAX(updated_at) AS updated_at FROM vin_targets WHERE active = 1").get() as {
      updated_at?: string | null;
    };
    return {
      configVersion: String(row?.updated_at ?? new Date().toISOString()),
      targets: this.getVinTargets(true),
    };
  }

  getRecentSyncRuns(limit = 20): Array<Record<string, unknown>> {
    const rows = this.db
      .query(
        `SELECT id, runner_id, runner_version, machine_name, submitted_at, started_at, completed_at,
                status, source_keys_json, covered_scopes_json, records_received, records_upserted,
                records_missing_marked, error_text
         FROM sync_runs
         ORDER BY COALESCE(completed_at, submitted_at) DESC
         LIMIT ?`,
      )
      .all(Math.max(1, Math.min(100, Number(limit) || 20))) as Record<string, unknown>[];
    return rows.map((row) => {
      let sourceKeys: unknown = [];
      let scopes: unknown = [];
      try { sourceKeys = JSON.parse(String(row.source_keys_json ?? "[]")); } catch { sourceKeys = []; }
      try { scopes = JSON.parse(String(row.covered_scopes_json ?? "[]")); } catch { scopes = []; }
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

  getLatestCollectorIngestAt(): string | null {
    const runRow = this.db.query(`
      SELECT MAX(COALESCE(completed_at, started_at, submitted_at)) AS ingested_at
      FROM sync_runs
      WHERE status = 'complete'
    `).get() as { ingested_at?: string | null } | null;
    if (runRow?.ingested_at) {
      return String(runRow.ingested_at);
    }

    const lotRow = this.db.query("SELECT MAX(last_ingested_at) AS ingested_at FROM lots").get() as {
      ingested_at?: string | null;
    } | null;
    return lotRow?.ingested_at ? String(lotRow.ingested_at) : null;
  }

  private getNextVinTargetSortOrder(): number {
    const row = this.db.query("SELECT COALESCE(MAX(sort_order), 0) AS sort_order FROM vin_targets").get() as {
      sort_order?: number | null;
    };
    return Number(row?.sort_order ?? 0) + 10;
  }

  upsertVinTarget(input: Partial<VinTarget> & { vinPattern: string }): string {
    const validationError = getVinTargetValidationError(input.vinPattern);
    if (validationError) {
      throw new Error(validationError);
    }
    const inferred = inferVinTargetDefinition(input.vinPattern);
    if (!inferred.vinPattern) {
      throw new Error("VIN pattern is required.");
    }
    const existingRow = this.db
      .query("SELECT * FROM vin_targets WHERE id = ? OR key = ? LIMIT 1")
      .get(input.id ?? "", input.key ?? inferred.key) as Record<string, unknown> | null;
    const existing = existingRow ? mapVinTarget(existingRow) : null;
    const generic = buildGenericTargetMetadata(inferred.vinPattern);
    const keepExistingMetadata = existing ? !isGenericVinTargetMetadata(existing) : false;
    const inferredMarker = inferred.modelLabel
      ? `${inferred.modelLabel} · ${inferred.vinPattern}`
      : `VIN · ${inferred.vinPattern}`;
    const isDeterministicTesla = inferred.deterministicTesla;
    const now = new Date().toISOString();
    const label = input.label ?? (isDeterministicTesla ? inferred.label : (keepExistingMetadata ? existing?.label ?? generic.label : generic.label));
    const carType = input.carType ?? (isDeterministicTesla ? inferred.carType : (keepExistingMetadata ? existing?.carType ?? generic.carType : generic.carType));
    const marker = input.marker ?? (isDeterministicTesla ? inferredMarker : (keepExistingMetadata ? existing?.marker ?? generic.marker : generic.marker));
    const yearFrom = input.yearFrom ?? (isDeterministicTesla ? inferred.yearFrom : (existing?.yearFrom ?? inferred.inferredYear ?? inferred.yearFrom));
    const yearTo = input.yearTo ?? (isDeterministicTesla ? inferred.yearTo : (existing?.yearTo ?? inferred.inferredYear ?? inferred.yearTo));
    const copartSlug = input.copartSlug ?? (isDeterministicTesla ? inferred.copartSlug : (inferred.copartSlug || existing?.copartSlug || ""));
    const iaaiPath = input.iaaiPath ?? (isDeterministicTesla ? inferred.iaaiPath : (inferred.iaaiPath || existing?.iaaiPath || ""));
    const next = {
      id: input.id ?? (existing ? existing.id : randomUUID()),
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
      enabledCopart: input.enabledCopart ?? (existing ? existing.enabledCopart : true),
      enabledIaai: input.enabledIaai ?? (existing ? existing.enabledIaai : !isGenericVinTargetMetadata({
        label,
        carType,
        marker,
        vinPattern: inferred.vinPattern,
        vinPrefix: inferred.vinPrefix,
        copartSlug,
        iaaiPath,
      })),
      active: input.active ?? (existing ? existing.active : true),
      sortOrder: input.sortOrder ?? (existing ? existing.sortOrder : this.getNextVinTargetSortOrder()),
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
    };

    this.db.query(`
      INSERT INTO vin_targets (
        id, key, label, car_type, marker, vin_pattern, vin_prefix,
        year_from, year_to, copart_slug, iaai_path,
        enabled_copart, enabled_iaai, active, sort_order, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        enabled_copart = excluded.enabled_copart,
        enabled_iaai = excluded.enabled_iaai,
        active = excluded.active,
        sort_order = excluded.sort_order,
        updated_at = excluded.updated_at
    `).run(
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
      boolFlag(next.enabledCopart),
      boolFlag(next.enabledIaai),
      boolFlag(next.active),
      next.sortOrder,
      next.createdAt,
      next.updatedAt,
    );
    return next.id;
  }

  removeVinTarget(id: string): void {
    const result = this.db.query("DELETE FROM vin_targets WHERE id = ?").run(id);
    if (Number(result.changes ?? 0) === 0) {
      throw new Error("Target not found.");
    }
  }

  getLotList(includeRemoved = false): LotListItem[] {
    const rows = this.db.query(`
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
    `).all(boolFlag(includeRemoved)) as Record<string, unknown>[];

    return rows
      .map((row) => ({
        ...mapLotRow(row),
        primaryImageId: row.primary_image_id ? String(row.primary_image_id) : null,
        imageCount: Number(row.image_count ?? 0),
      }))
      .sort((left, right) => {
        return (
          lotListSortValue(left) - lotListSortValue(right) ||
          left.carType.localeCompare(right.carType) ||
          left.marker.localeCompare(right.marker) ||
          left.sourceLabel.localeCompare(right.sourceLabel) ||
          left.lotNumber.localeCompare(right.lotNumber)
        );
      });
  }

  getPublicLotList(): LotListItem[] {
    const activeTargets = this.getVinTargets(true);
    const activeTargetKeys = new Set(activeTargets.map((target) => target.key));
    const activeCarTypes = new Set(activeTargets.map((target) => target.carType));

    return this.getLotList(false).filter((lot) => {
      if (lot.workflowState === "removed") {
        return false;
      }
      if (lot.targetKey && activeTargetKeys.has(lot.targetKey)) {
        return true;
      }
      return activeCarTypes.has(lot.carType);
    });
  }

  getLotDetail(sourceKey: SourceKey, lotNumber: string): LotDetail | null {
    const lotRow = this.db
      .query("SELECT * FROM lots WHERE source_key = ? AND lot_number = ? LIMIT 1")
      .get(sourceKey, lotNumber) as Record<string, unknown> | null;
    if (!lotRow) {
      return null;
    }
    const lot = mapLotRow(lotRow);
    const images = (this.db
      .query("SELECT * FROM lot_images WHERE lot_id = ? AND active = 1 ORDER BY sort_order, created_at")
      .all(lot.id) as Record<string, unknown>[])
      .map(mapLotImage);
    const snapshots = (this.db
      .query("SELECT * FROM lot_snapshots WHERE lot_id = ? ORDER BY observed_at DESC")
      .all(lot.id) as Record<string, unknown>[])
      .map(mapLotSnapshot);
    const actions = (this.db
      .query("SELECT * FROM lot_actions WHERE lot_id = ? ORDER BY created_at DESC")
      .all(lot.id) as Record<string, unknown>[])
      .map(mapLotAction);
    const soldPriceRow = this.db
      .query("SELECT * FROM lot_sold_prices WHERE lot_id = ? LIMIT 1")
      .get(lot.id) as Record<string, unknown> | null;
    return { lot, images, snapshots, actions, soldPrice: soldPriceRow ? mapSoldPrice(soldPriceRow) : null };
  }

  getImageRow(imageId: string): LotImageRow | null {
    const row = this.db.query("SELECT * FROM lot_images WHERE id = ? LIMIT 1").get(imageId) as Record<string, unknown> | null;
    return row ? mapLotImage(row) : null;
  }

  getLotImageSyncState(sourceKey: SourceKey, lotNumber: string): LotImageRow | null {
    const row = this.db.query(`
      SELECT li.*
      FROM lot_images li
      INNER JOIN lots l ON l.id = li.lot_id
      WHERE l.source_key = ? AND l.lot_number = ? AND li.active = 1
      LIMIT 1
    `).get(sourceKey, lotNumber) as Record<string, unknown> | null;
    return row ? mapLotImage(row) : null;
  }

  setWorkflowState(lotId: string, workflowState: WorkflowState, actor: string, note: string | null): void {
    const now = new Date().toISOString();
    const lotRow = this.db.query("SELECT * FROM lots WHERE id = ? LIMIT 1").get(lotId) as Record<string, unknown> | null;
    if (!lotRow) {
      throw new Error(`Unknown lot ${lotId}`);
    }

    const approvedAt =
      workflowState === "approved"
        ? now
        : workflowState === "removed"
          ? (lotRow.approved_at ? String(lotRow.approved_at) : null)
          : null;
    const removedAt = workflowState === "removed" ? now : null;
    this.db.query(`
      UPDATE lots
      SET workflow_state = ?, workflow_note = ?, approved_at = ?, removed_at = ?, updated_at = ?
      WHERE id = ?
    `).run(workflowState, note, approvedAt, removedAt, now, lotId);

    this.db.query(`
      INSERT INTO lot_actions (id, lot_id, action, actor, note, metadata_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(randomUUID(), lotId, workflowState, actor, note, null, now);
  }

  // Permanently removes a lot and all of its dependent rows + image files.
  // lot_snapshots, lot_actions, lot_images cascade via FK; lot_notification_log
  // has no FK, so clean it up manually.
  hardDeleteLot(lotId: string): boolean {
    const lotRow = this.db.query("SELECT id FROM lots WHERE id = ? LIMIT 1").get(lotId) as Record<string, unknown> | null;
    if (!lotRow) {
      return false;
    }
    const imageRows = this.db
      .query("SELECT storage_path FROM lot_images WHERE lot_id = ?")
      .all(lotId) as Array<{ storage_path: string | null }>;
    this.db.transaction(() => {
      this.db.query("DELETE FROM lot_notification_log WHERE lot_id = ?").run(lotId);
      this.db.query("DELETE FROM lots WHERE id = ?").run(lotId);
    })();
    for (const row of imageRows) {
      this.removeStoredImageFile(row.storage_path);
    }
    return true;
  }

  getSoldPriceQueue(limit = 20): SoldPriceQueueItem[] {
    const nowIso = new Date().toISOString();
    const nowMs = Date.parse(nowIso);
    const boundedLimit = Math.max(1, Math.min(100, Number(limit) || 20));
    const soldPriceRows = (this.db.query("SELECT * FROM lot_sold_prices").all() as Record<string, unknown>[])
      .map(mapSoldPrice);
    const soldPriceByLotId = new Map(soldPriceRows.map((row) => [row.lotId, row]));

    return this.getPublicLotList()
      .filter((lot) => {
        if (lot.workflowState === "removed") {
          return false;
        }
        if (!lot.vin && !lot.lotNumber) {
          return false;
        }
        if (lot.status !== "done" && !isExactPastAuction(lot, nowMs)) {
          return false;
        }
        const soldPrice = soldPriceByLotId.get(lot.id);
        if (!soldPrice) {
          return true;
        }
        if (soldPrice.lookupStatus === "found") {
          return false;
        }
        if (!soldPrice.nextAttemptAt) {
          return true;
        }
        return Date.parse(soldPrice.nextAttemptAt) <= nowMs;
      })
      .sort((left, right) => {
        const leftSoldPrice = soldPriceByLotId.get(left.id);
        const rightSoldPrice = soldPriceByLotId.get(right.id);
        const leftAttemptMs = leftSoldPrice?.lastAttemptedAt ? Date.parse(leftSoldPrice.lastAttemptedAt) : 0;
        const rightAttemptMs = rightSoldPrice?.lastAttemptedAt ? Date.parse(rightSoldPrice.lastAttemptedAt) : 0;
        const leftAuctionMs = left.auctionDate ? Date.parse(left.auctionDate) : Number.MAX_SAFE_INTEGER;
        const rightAuctionMs = right.auctionDate ? Date.parse(right.auctionDate) : Number.MAX_SAFE_INTEGER;
        return leftAttemptMs - rightAttemptMs || leftAuctionMs - rightAuctionMs || left.lotNumber.localeCompare(right.lotNumber);
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

  recordSoldPriceResults(results: SoldPriceResultInput[]): SoldPriceResultSummary {
    let accepted = 0;
    let skipped = 0;

    this.db.transaction(() => {
      for (const result of results) {
        if (this.recordSoldPriceResult(result)) {
          accepted += 1;
        } else {
          skipped += 1;
        }
      }
    })();

    return { accepted, skipped };
  }

  private recordSoldPriceResult(input: SoldPriceResultInput): boolean {
    const lotRow = this.db.query("SELECT id FROM lots WHERE id = ? LIMIT 1").get(input.lotId) as Record<string, unknown> | null;
    if (!lotRow) {
      return false;
    }

    const existingRow = this.db
      .query("SELECT * FROM lot_sold_prices WHERE lot_id = ? LIMIT 1")
      .get(input.lotId) as Record<string, unknown> | null;
    const existing = existingRow ? mapSoldPrice(existingRow) : null;
    const now = new Date().toISOString();
    const nextAttemptCount = (existing?.attemptCount ?? 0) + 1;
    const requestedStatus = normalizeSoldPriceLookupStatus(input.lookupStatus);
    const finalBidUsd = input.finalBidUsd == null ? null : Math.round(Number(input.finalBidUsd));
    const lookupStatus = requestedStatus === "found" && (!finalBidUsd || finalBidUsd <= 0) ? "failed" : requestedStatus;
    const nextAttemptAt = getNextSoldPriceAttemptAt(lookupStatus, nextAttemptCount, now);
    const errorText = normalizedTextOrNull(input.errorText);

    if (existing?.lookupStatus === "found" && lookupStatus !== "found") {
      this.db.query(`
        UPDATE lot_sold_prices
        SET attempt_count = ?, last_attempted_at = ?, error_text = COALESCE(?, error_text), updated_at = ?
        WHERE lot_id = ?
      `).run(nextAttemptCount, now, errorText, now, input.lotId);
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
    const id = existing?.id ?? randomUUID();
    const createdAt = existing?.createdAt ?? now;
    const foundAt = lookupStatus === "found" ? (existing?.foundAt ?? now) : null;

    this.db.query(`
      INSERT INTO lot_sold_prices (
        id, lot_id, lookup_status, attempt_count, last_attempted_at, next_attempt_at, found_at,
        bidfax_url, matched_query, match_confidence, final_bid_usd, sale_date, sale_date_raw,
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
        bidfax_url = excluded.bidfax_url,
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
        updated_at = excluded.updated_at
    `).run(
      id,
      input.lotId,
      lookupStatus,
      nextAttemptCount,
      now,
      nextAttemptAt,
      foundAt,
      normalizedTextOrNull(input.bidfaxUrl),
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

    return true;
  }

  getSoldPriceExplorerItems(): SoldPriceExplorerItem[] {
    const publicLots = this.getPublicLotList();
    const publicLotsById = new Map(publicLots.map((lot) => [lot.id, lot]));
    const soldRows = (this.db.query(`
      SELECT *
      FROM lot_sold_prices
      WHERE lookup_status = 'found' AND final_bid_usd IS NOT NULL
    `).all() as Record<string, unknown>[])
      .map(mapSoldPrice);

    const items = soldRows
      .map((soldPrice) => {
        const lot = publicLotsById.get(soldPrice.lotId);
        return lot ? { ...lot, soldPrice } : null;
      })
      .filter((item): item is LotListItem & { soldPrice: SoldPriceRow } => item !== null)
      .sort((left, right) => {
        const rightSaleMs = Date.parse(right.soldPrice.saleDate || right.soldPrice.foundAt || right.updatedAt);
        const leftSaleMs = Date.parse(left.soldPrice.saleDate || left.soldPrice.foundAt || left.updatedAt);
        return rightSaleMs - leftSaleMs || right.soldPrice.finalBidUsd! - left.soldPrice.finalBidUsd!;
      });

    return buildSoldPriceStats(items);
  }

  applyTargetMetadataUpdates(payload: TargetMetadataUpdatePayload): TargetMetadataUpdateSummary {
    const observedAt = payload.observedAt || new Date().toISOString();
    let applied = 0;

    this.db.transaction(() => {
      for (const update of payload.updates ?? []) {
        if (this.applyTargetMetadataUpdate(update, observedAt)) {
          applied += 1;
        }
      }
    })();

    return { applied };
  }

  ingest(payload: IngestPayload): RunnerSummary {
    const runId = payload.run.id ?? randomUUID();
    const submittedAt = new Date().toISOString();
    const completedAt = payload.run.completedAt || submittedAt;
    const presentKeysByScope = new Map<string, Set<string>>();
    let upserted = 0;
    let missingMarked = 0;

    this.db.query(`
      INSERT INTO sync_runs (
        id, runner_id, runner_version, machine_name, submitted_at, started_at, completed_at,
        status, source_keys_json, covered_scopes_json, records_received
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
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

    const transaction = this.db.transaction(() => {
      for (const update of payload.targetUpdates ?? []) {
        this.applyTargetMetadataUpdate(update, completedAt);
      }

      for (const record of payload.records) {
        const scopeKey = `${record.sourceKey}:${record.targetKey}`;
        if (!presentKeysByScope.has(scopeKey)) {
          presentKeysByScope.set(scopeKey, new Set());
        }
        presentKeysByScope.get(scopeKey)?.add(record.lotNumber);
        this.upsertLotRecord(runId, completedAt, record);
        upserted += 1;
      }

      for (const scope of payload.run.scopes.filter((item) => item.status === "complete")) {
        missingMarked += this.reconcileMissingLots(runId, completedAt, scope, presentKeysByScope.get(`${scope.sourceKey}:${scope.targetKey}`) ?? new Set());
      }

      this.db.query(`
        UPDATE sync_runs
        SET status = ?, records_upserted = ?, records_missing_marked = ?, completed_at = ?
        WHERE id = ?
      `).run("complete", upserted, missingMarked, completedAt, runId);
    });

    transaction();
    return { runId, upserted, missingMarked };
  }

  uploadLotImage(input: {
    runId: string;
    sourceKey: SourceKey;
    lotNumber: string;
    sourceUrl: string;
    sortOrder: number;
    mimeType?: string | null;
    width?: number | null;
    height?: number | null;
    dataBase64: string;
  }): LotImageRow {
    const lotRow = this.db
      .query("SELECT * FROM lots WHERE source_key = ? AND lot_number = ? LIMIT 1")
      .get(input.sourceKey, input.lotNumber) as Record<string, unknown> | null;
    if (!lotRow) {
      throw new Error(`Unknown lot ${input.sourceKey}:${input.lotNumber}`);
    }
    const lot = mapLotRow(lotRow);
    const bytes = Buffer.from(input.dataBase64, "base64");
    const sha256 = sha256Hex(bytes);
    const mimeType = input.mimeType || "application/octet-stream";
    const extension = extFromMimeType(mimeType);
    const relativeDir = path.join(input.sourceKey, input.lotNumber);
    const absoluteDir = path.join(this.mediaDir, relativeDir);
    mkdirSync(absoluteDir, { recursive: true });
    const relativePath = path.join(relativeDir, `${sha256}.${extension}`);
    const absolutePath = path.join(this.mediaDir, relativePath);
    if (!existsSync(absolutePath)) {
      writeFileSync(absolutePath, bytes);
    }
    const now = new Date().toISOString();

    const existingRow = this.db.query("SELECT * FROM lot_images WHERE lot_id = ? LIMIT 1").get(lot.id) as Record<string, unknown> | null;
    const existingImage = existingRow ? mapLotImage(existingRow) : null;

    if (existingImage && existingImage.sha256 === sha256) {
      this.db.query(`
        UPDATE lot_images
        SET source_url = ?, storage_path = ?, mime_type = ?, sha256 = ?, byte_size = ?, width = ?, height = ?, sort_order = 0, last_seen_at = ?, last_sync_run_id = ?, active = 1
        WHERE id = ?
      `).run(
        input.sourceUrl,
        relativePath,
        mimeType,
        sha256,
        bytes.length,
        input.width ?? null,
        input.height ?? null,
        now,
        input.runId,
        existingImage.id,
      );
      if (existingImage.storagePath !== relativePath) {
        this.removeStoredImageFile(existingImage.storagePath);
      }
      return mapLotImage(this.db.query("SELECT * FROM lot_images WHERE id = ?").get(existingImage.id) as Record<string, unknown>);
    }

    if (
      existingImage &&
      hasProtectedImageDimensions(existingImage.width, existingImage.height) &&
      !hasProtectedImageDimensions(input.width ?? null, input.height ?? null)
    ) {
      return existingImage;
    }

    if (existingImage) {
      this.db.query("DELETE FROM lot_images WHERE id = ?").run(existingImage.id);
      this.removeStoredImageFile(existingImage.storagePath);
    }

    const id = randomUUID();
    this.db.query(`
      INSERT INTO lot_images (
        id, lot_id, source_url, storage_path, mime_type, sha256, byte_size,
        width, height, sort_order, created_at, last_seen_at, last_sync_run_id, active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      id,
      lot.id,
      input.sourceUrl,
      relativePath,
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
    return mapLotImage(this.db.query("SELECT * FROM lot_images WHERE id = ?").get(id) as Record<string, unknown>);
  }

  private applyTargetMetadataUpdate(update: VinTargetMetadataUpdate, observedAt: string): boolean {
    if (!update.targetKey) {
      return false;
    }
    const existingRow = this.db
      .query("SELECT * FROM vin_targets WHERE key = ? LIMIT 1")
      .get(update.targetKey) as Record<string, unknown> | null;
    if (!existingRow) {
      return false;
    }
    const existing = mapVinTarget(existingRow);
    const nextLabel = update.label?.trim();
    const nextCarType = update.carType?.trim();
    const nextMarker = update.marker?.trim();
    const nextYearFrom = update.yearFrom == null ? null : Number(update.yearFrom);
    const nextYearTo = update.yearTo == null ? null : Number(update.yearTo);
    const shouldReplaceMetadata = isGenericVinTargetMetadata(existing) && !!nextLabel && !!nextCarType && !!nextMarker;
    const shouldReplaceYears = hasGenericVinTargetYearRange(existing) && nextYearFrom != null && nextYearTo != null;

    if (!shouldReplaceMetadata && !shouldReplaceYears) {
      return false;
    }

    const result = this.db.query(`
      UPDATE vin_targets
      SET
        label = ?,
        car_type = ?,
        marker = ?,
        year_from = ?,
        year_to = ?,
        enabled_iaai = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      shouldReplaceMetadata ? nextLabel : existing.label,
      shouldReplaceMetadata ? nextCarType : existing.carType,
      shouldReplaceMetadata ? nextMarker : existing.marker,
      shouldReplaceYears ? nextYearFrom : existing.yearFrom,
      shouldReplaceYears ? nextYearTo : existing.yearTo,
      shouldReplaceMetadata ? 1 : boolFlag(existing.enabledIaai),
      observedAt,
      existing.id,
    );
    return Number(result.changes ?? 0) > 0;
  }

  private getResolvedTargetMetadata(targetKey: string | null | undefined): Pick<VinTarget, "carType" | "marker"> | null {
    if (!targetKey) {
      return null;
    }
    const row = this.db
      .query("SELECT * FROM vin_targets WHERE key = ? LIMIT 1")
      .get(targetKey) as Record<string, unknown> | null;
    if (!row) {
      return null;
    }
    const target = mapVinTarget(row);
    return isGenericVinTargetMetadata(target)
      ? null
      : {
          carType: target.carType,
          marker: target.marker,
        };
  }

  private upsertLotRecord(runId: string, observedAt: string, record: ScrapedLotRecord): void {
    const existing = this.db
      .query("SELECT * FROM lots WHERE source_key = ? AND lot_number = ? LIMIT 1")
      .get(record.sourceKey, record.lotNumber) as Record<string, unknown> | null;
    const resolvedTarget = this.getResolvedTargetMetadata(record.targetKey);
    const nextStatus = normalizeLotStatus(record.status);
    if (existing) {
      const current = mapLotRow(existing);
      const mergedStatus = shouldPreserveKnownLotStatus(nextStatus, current.status) ? current.status : nextStatus;
      const mergedSourceLabel = preferredText(record.sourceLabel, current.sourceLabel) || normalizeSourceLabel(record.sourceKey);
      const mergedTargetKey = preferredText(record.targetKey, current.targetKey);
      const mergedSourceDetailId = preferredText(record.sourceDetailId, current.sourceDetailId);
      const mergedCarType = preferredText(resolvedTarget?.carType || record.carType, current.carType) || current.carType;
      const mergedMarker = preferredText(resolvedTarget?.marker || record.marker, current.marker) || current.marker;
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
      this.db.query(`
        UPDATE lots
        SET
          source_label = ?,
          target_key = ?,
          source_detail_id = ?,
          car_type = ?,
          marker = ?,
          vin_pattern = ?,
          vin = ?,
          model_year = ?,
          year_page = ?,
          status = ?,
          auction_date = ?,
          auction_date_raw = ?,
          location = ?,
          url = ?,
          evidence = ?,
          color = ?,
          source_raw_json = ?,
          last_seen_at = ?,
          last_ingested_at = ?,
          last_sync_run_id = ?,
          missing_since = NULL,
          missing_count = 0,
          canceled_at = CASE WHEN ? IN ('upcoming', 'done', 'unknown') THEN NULL ELSE canceled_at END,
          updated_at = ?
        WHERE id = ?
      `).run(
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
      this.insertSnapshot(current.id, runId, observedAt, true, record);
      return;
    }

    const resolvedCarType = preferredText(resolvedTarget?.carType || record.carType, null) || normalizeWhitespace(record.carType);
    const resolvedMarker = preferredText(resolvedTarget?.marker || record.marker, null) || normalizeWhitespace(record.marker);

    const id = randomUUID();
    this.db.query(`
      INSERT INTO lots (
        id, source_key, source_label, target_key, lot_number, source_detail_id,
        car_type, marker, vin_pattern, vin, model_year, year_page, status,
        workflow_state, workflow_note, auction_date, auction_date_raw, location,
        url, evidence, color, source_raw_json, first_seen_at, last_seen_at, last_ingested_at, last_sync_run_id,
        missing_since, missing_count, canceled_at, approved_at, removed_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, NULL, NULL, NULL, ?)
    `).run(
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
    this.insertSnapshot(id, runId, observedAt, true, record);
  }

  private insertSnapshot(lotId: string, runId: string, observedAt: string, isPresent: boolean, record: ScrapedLotRecord | null): void {
    this.db.query(`
      INSERT OR REPLACE INTO lot_snapshots (id, lot_id, sync_run_id, observed_at, is_present, snapshot_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      `${lotId}:${runId}:${isPresent ? "present" : "missing"}`,
      lotId,
      runId,
      observedAt,
      boolFlag(isPresent),
      JSON.stringify(record ?? null),
    );
  }

  private reconcileMissingLots(runId: string, observedAt: string, scope: RunnerScope, presentLotNumbers: Set<string>): number {
    const existingRows = this.db
      .query("SELECT * FROM lots WHERE source_key = ? AND target_key = ?")
      .all(scope.sourceKey, scope.targetKey) as Record<string, unknown>[];
    let missingMarked = 0;
    const scopeReportedZeroLots = presentLotNumbers.size === 0;

    for (const row of existingRows) {
      const lot = mapLotRow(row);
      if (presentLotNumbers.has(lot.lotNumber)) {
        continue;
      }
      const nextMissingCount = lot.missingCount + 1;
      const shouldGraceSingleEmptyScopeRun = scopeReportedZeroLots && lot.status !== "done" && nextMissingCount === 1;
      const nextStatus =
        lot.status === "done"
          ? "done"
          : shouldGraceSingleEmptyScopeRun
            ? lot.status
            : nextMissingCount >= (scopeReportedZeroLots ? 3 : 2)
            ? "canceled"
            : "missing";
      this.db.query(`
        UPDATE lots
        SET
          status = ?,
          missing_since = COALESCE(missing_since, ?),
          missing_count = ?,
          canceled_at = CASE WHEN ? = 'canceled' THEN COALESCE(canceled_at, ?) ELSE canceled_at END,
          last_ingested_at = ?,
          last_sync_run_id = ?,
          updated_at = ?
        WHERE id = ?
      `).run(
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
      this.insertSnapshot(lot.id, runId, observedAt, false, null);
      missingMarked += 1;
    }
    return missingMarked;
  }

  savePushSubscription(endpoint: string, p256dh: string, auth: string): void {
    this.db.query(`
      INSERT INTO push_subscriptions (id, endpoint, p256dh, auth, created_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth
    `).run(randomUUID(), endpoint, p256dh, auth, new Date().toISOString());
  }

  removePushSubscription(endpoint: string): void {
    this.db.query("DELETE FROM push_subscriptions WHERE endpoint = ?").run(endpoint);
  }

  getPushSubscriptions(): Array<{ id: string; endpoint: string; p256dh: string; auth: string }> {
    return this.db.query("SELECT id, endpoint, p256dh, auth FROM push_subscriptions").all() as Array<{
      id: string;
      endpoint: string;
      p256dh: string;
      auth: string;
    }>;
  }

  getLotsToNotify12h(): Array<{ id: string; lot_number: string; source_key: string; marker: string }> {
    return this.db.query(`
      SELECT id, lot_number, source_key, marker
      FROM lots
      WHERE status = 'upcoming'
        AND workflow_state != 'removed'
        AND auction_date LIKE '%T%'
        AND datetime(auction_date) > datetime('now')
        AND datetime(auction_date) <= datetime('now', '+12 hours')
        AND id NOT IN (
          SELECT lot_id FROM lot_notification_log WHERE event_type = 'threshold_12h'
        )
    `).all() as Array<{ id: string; lot_number: string; source_key: string; marker: string }>;
  }

  getLotsToNotify30m(): Array<{ id: string; lot_number: string; source_key: string; marker: string }> {
    return this.db.query(`
      SELECT id, lot_number, source_key, marker
      FROM lots
      WHERE status = 'upcoming'
        AND workflow_state != 'removed'
        AND auction_date LIKE '%T%'
        AND datetime(auction_date) > datetime('now')
        AND datetime(auction_date) <= datetime('now', '+30 minutes')
        AND id NOT IN (
          SELECT lot_id FROM lot_notification_log WHERE event_type = 'threshold_30m'
        )
    `).all() as Array<{ id: string; lot_number: string; source_key: string; marker: string }>;
  }

  recordLotNotification(lotId: string, eventType: string): void {
    this.db.query(`
      INSERT OR IGNORE INTO lot_notification_log (lot_id, event_type, notified_at)
      VALUES (?, ?, ?)
    `).run(lotId, eventType, new Date().toISOString());
  }
}
