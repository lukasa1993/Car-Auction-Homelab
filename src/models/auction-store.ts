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

function preferredText(next: string | null | undefined, fallback: string | null | undefined): string | null {
  return normalizedTextOrNull(next) ?? normalizedTextOrNull(fallback);
}

function preferredNumber(next: number | null | undefined, fallback: number | null | undefined): number | null {
  return next == null ? fallback ?? null : Number(next);
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

      CREATE INDEX IF NOT EXISTS idx_lots_source_target ON lots(source_key, target_key);
      CREATE INDEX IF NOT EXISTS idx_lots_workflow ON lots(workflow_state);
      CREATE INDEX IF NOT EXISTS idx_lot_images_lot_id ON lot_images(lot_id);
      CREATE INDEX IF NOT EXISTS idx_snapshots_lot_id ON lot_snapshots(lot_id);
      CREATE INDEX IF NOT EXISTS idx_actions_lot_id ON lot_actions(lot_id);
    `);
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
    const now = new Date().toISOString();
    const label = input.label ?? (keepExistingMetadata ? existing?.label ?? generic.label : generic.label);
    const carType = input.carType ?? (keepExistingMetadata ? existing?.carType ?? generic.carType : generic.carType);
    const marker = input.marker ?? (keepExistingMetadata ? existing?.marker ?? generic.marker : generic.marker);
    const yearFrom = input.yearFrom ?? (existing?.yearFrom ?? inferred.inferredYear ?? inferred.yearFrom);
    const yearTo = input.yearTo ?? (existing?.yearTo ?? inferred.inferredYear ?? inferred.yearTo);
    const copartSlug = input.copartSlug ?? (inferred.copartSlug || existing?.copartSlug || "");
    const iaaiPath = input.iaaiPath ?? (inferred.iaaiPath || existing?.iaaiPath || "");
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
    return { lot, images, snapshots, actions };
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
        url, evidence, first_seen_at, last_seen_at, last_ingested_at, last_sync_run_id,
        missing_since, missing_count, canceled_at, approved_at, removed_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, NULL, NULL, NULL, ?)
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
}
