import { randomUUID } from "node:crypto";

import type { VinTarget } from "../lib/types";
import { normalizeWhitespace } from "../lib/utils";
import {
  deriveVinPrefix,
  getVinTargetValidationError,
  inferVinTargetDefinition,
  isGenericVinTargetMetadata,
  normalizeVinPattern,
} from "../lib/vin-patterns";
import { AuctionStore } from "./auction-store";

function normalizeStringList(values: Array<string | null | undefined> | null | undefined): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values || []) {
    const normalized = normalizeWhitespace(String(value || ""));
    if (!normalized) {
      continue;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function parseJsonStringList(value: unknown): string[] {
  if (typeof value !== "string" || !value.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return normalizeStringList(parsed.map((item) => String(item ?? "")));
  } catch {
    return [];
  }
}

function buildGenericTargetMetadata(vinPattern: string): Pick<VinTarget, "label" | "carType" | "marker"> {
  const inferred = inferVinTargetDefinition(vinPattern);
  return {
    label: inferred.vinPrefix || inferred.vinPattern,
    carType: inferred.vinPrefix || inferred.vinPattern,
    marker: `VIN · ${inferred.vinPattern}`,
  };
}

function mapPatchedVinTarget(row: Record<string, unknown>): VinTarget {
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
    enabledCopart: Number(row.enabled_copart ?? 0) === 1,
    enabledIaai: Number(row.enabled_iaai ?? 0) === 1,
    active: Number(row.active ?? 0) === 1,
    sortOrder: Number(row.sort_order ?? 0),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function ensureTargetBlacklistColumns(store: AuctionStore): void {
  const db = store.db;
  const vinTargetColumns = new Set(
    (db.query("PRAGMA table_info(vin_targets)").all() as Array<Record<string, unknown>>).map((row) => String(row.name)),
  );
  if (!vinTargetColumns.has("reject_colors_json")) {
    db.exec("ALTER TABLE vin_targets ADD COLUMN reject_colors_json TEXT NOT NULL DEFAULT '[]'");
  }
  if (!vinTargetColumns.has("reject_locations_json")) {
    db.exec("ALTER TABLE vin_targets ADD COLUMN reject_locations_json TEXT NOT NULL DEFAULT '[]'");
  }
}

export function getPatchedVinTargets(store: AuctionStore, activeOnly = false): VinTarget[] {
  ensureTargetBlacklistColumns(store);
  const sql = activeOnly
    ? "SELECT * FROM vin_targets WHERE active = 1 ORDER BY sort_order, key"
    : "SELECT * FROM vin_targets ORDER BY sort_order, key";
  return (store.db.query(sql).all() as Record<string, unknown>[]).map(mapPatchedVinTarget);
}

export function getPatchedScrapeConfig(store: AuctionStore): { configVersion: string; targets: VinTarget[] } {
  ensureTargetBlacklistColumns(store);
  const row = store.db.query("SELECT MAX(updated_at) AS updated_at FROM vin_targets WHERE active = 1").get() as {
    updated_at?: string | null;
  };
  return {
    configVersion: String(row?.updated_at ?? new Date().toISOString()),
    targets: getPatchedVinTargets(store, true),
  };
}

export function upsertPatchedVinTarget(store: AuctionStore, input: Partial<VinTarget> & { vinPattern: string }): string {
  ensureTargetBlacklistColumns(store);
  const db = store.db;

  const validationError = getVinTargetValidationError(input.vinPattern);
  if (validationError) {
    throw new Error(validationError);
  }
  const inferred = inferVinTargetDefinition(input.vinPattern);
  if (!inferred.vinPattern) {
    throw new Error("VIN pattern is required.");
  }

  const existingRow = db
    .query("SELECT * FROM vin_targets WHERE id = ? OR key = ? LIMIT 1")
    .get(input.id ?? "", input.key ?? inferred.key) as Record<string, unknown> | null;
  const existing = existingRow ? mapPatchedVinTarget(existingRow) : null;
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
  const rejectColors = normalizeStringList(input.rejectColors ?? existing?.rejectColors ?? []);
  const rejectLocations = normalizeStringList(input.rejectLocations ?? existing?.rejectLocations ?? []);

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
    rejectColors,
    rejectLocations,
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
    sortOrder: input.sortOrder ?? (existing ? existing.sortOrder : (store as any).getNextVinTargetSortOrder()),
    createdAt: existing ? existing.createdAt : now,
    updatedAt: now,
  };

  db.query(`
    INSERT INTO vin_targets (
      id, key, label, car_type, marker, vin_pattern, vin_prefix,
      year_from, year_to, copart_slug, iaai_path, reject_colors_json, reject_locations_json,
      enabled_copart, enabled_iaai, active, sort_order, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    JSON.stringify(next.rejectColors),
    JSON.stringify(next.rejectLocations),
    next.enabledCopart ? 1 : 0,
    next.enabledIaai ? 1 : 0,
    next.active ? 1 : 0,
    next.sortOrder,
    next.createdAt,
    next.updatedAt,
  );

  return next.id;
}

export function applyTargetBlacklistPatch(store: AuctionStore): void {
  ensureTargetBlacklistColumns(store);
  (store as any).getVinTargets = (activeOnly = false) => getPatchedVinTargets(store, activeOnly);
  (store as any).getScrapeConfig = () => getPatchedScrapeConfig(store);
  (store as any).upsertVinTarget = (input: Partial<VinTarget> & { vinPattern: string }) => upsertPatchedVinTarget(store, input);
}
