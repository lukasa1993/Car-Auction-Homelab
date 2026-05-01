export type SourceKey = "copart" | "iaai";

export type LotStatus = "upcoming" | "done" | "unknown" | "missing" | "canceled";

export type WorkflowState = "new" | "approved" | "removed";

export type SoldPriceLookupStatus = "found" | "not_found" | "blocked" | "failed";

export interface VinTarget {
  id: string;
  key: string;
  label: string;
  carType: string;
  marker: string;
  vinPattern: string;
  vinPrefix: string;
  yearFrom: number;
  yearTo: number;
  copartSlug: string;
  iaaiPath: string;
  rejectColors: string[];
  rejectLocations: string[];
  enabledCopart: boolean;
  enabledIaai: boolean;
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface RunnerScope {
  sourceKey: SourceKey;
  targetKey: string;
  status: "complete" | "failed" | "partial";
  notes?: string;
}

export interface ScrapedImagePayload {
  sourceUrl: string;
  sortOrder: number;
  mimeType?: string;
  width?: number | null;
  height?: number | null;
  caption?: string | null;
  dataBase64?: string | null;
}

export interface ScrapedLotRecord {
  sourceKey: SourceKey;
  sourceLabel: string;
  targetKey: string;
  yearPage: number | null;
  carType: string;
  marker: string;
  vinPattern: string;
  modelYear: number | null;
  vin: string;
  lotNumber: string;
  sourceDetailId?: string | null;
  vehicleTitle?: string | null;
  status: LotStatus;
  auctionDate: string;
  auctionDateRaw: string;
  location: string;
  url: string;
  evidence: string;
  color?: string | null;
  sourceRaw?: unknown;
  images?: ScrapedImagePayload[];
}

export interface VinTargetMetadataUpdate {
  targetKey: string;
  label?: string;
  carType?: string;
  marker?: string;
  yearFrom?: number | null;
  yearTo?: number | null;
}

export interface TargetMetadataUpdatePayload {
  observedAt?: string;
  updates: VinTargetMetadataUpdate[];
}

export interface IngestRunPayload {
  id?: string;
  runnerId: string;
  runnerVersion: string;
  machineName: string;
  startedAt: string;
  completedAt: string;
  sourceKeys: SourceKey[];
  scopes: RunnerScope[];
}

export interface IngestPayload {
  run: IngestRunPayload;
  records: ScrapedLotRecord[];
  targetUpdates?: VinTargetMetadataUpdate[];
}

export interface LotRow {
  id: string;
  sourceKey: SourceKey;
  sourceLabel: string;
  targetKey: string | null;
  lotNumber: string;
  sourceDetailId: string | null;
  carType: string;
  marker: string;
  vinPattern: string | null;
  vin: string | null;
  modelYear: number | null;
  yearPage: number | null;
  status: LotStatus;
  workflowState: WorkflowState;
  workflowNote: string | null;
  auctionDate: string | null;
  auctionDateRaw: string | null;
  location: string | null;
  url: string;
  evidence: string | null;
  color: string | null;
  sourceRawJson: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  lastIngestedAt: string;
  lastSyncRunId: string | null;
  missingSince: string | null;
  missingCount: number;
  canceledAt: string | null;
  approvedAt: string | null;
  removedAt: string | null;
  updatedAt: string;
}

export interface LotImageRow {
  id: string;
  lotId: string;
  sourceUrl: string;
  storagePath: string;
  mimeType: string | null;
  sha256: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  sortOrder: number;
  createdAt: string;
  lastSeenAt: string;
  lastSyncRunId: string | null;
  active: boolean;
}

export interface LotSnapshotRow {
  id: string;
  lotId: string;
  syncRunId: string | null;
  observedAt: string;
  isPresent: boolean;
  snapshotJson: string;
}

export interface LotActionRow {
  id: string;
  lotId: string;
  action: string;
  actor: string;
  note: string | null;
  metadataJson: string | null;
  createdAt: string;
}

export interface LotListItem extends LotRow {
  primaryImageId: string | null;
  imageCount: number;
}

export interface LotDetail {
  lot: LotRow;
  images: LotImageRow[];
  snapshots: LotSnapshotRow[];
  actions: LotActionRow[];
  soldPrice: SoldPriceRow | null;
}

export interface SoldPriceRow {
  id: string;
  lotId: string;
  lookupStatus: SoldPriceLookupStatus;
  attemptCount: number;
  lastAttemptedAt: string | null;
  nextAttemptAt: string | null;
  foundAt: string | null;
  externalUrl: string | null;
  matchedQuery: string | null;
  matchConfidence: number | null;
  finalBidUsd: number | null;
  saleDate: string | null;
  saleDateRaw: string | null;
  externalSourceKey: SourceKey | null;
  externalSourceLabel: string | null;
  externalLotNumber: string | null;
  externalVin: string | null;
  condition: string | null;
  damage: string | null;
  secondaryDamage: string | null;
  mileage: string | null;
  location: string | null;
  color: string | null;
  seller: string | null;
  documents: string | null;
  rawJson: string | null;
  errorText: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SoldPriceQueueItem {
  lotId: string;
  sourceKey: SourceKey;
  sourceLabel: string;
  targetKey: string | null;
  lotNumber: string;
  vin: string | null;
  modelYear: number | null;
  carType: string;
  marker: string;
  auctionDate: string | null;
  status: LotStatus;
  url: string;
}

export interface SoldPriceResultInput {
  lotId: string;
  lookupStatus: SoldPriceLookupStatus;
  externalUrl?: string | null;
  matchedQuery?: string | null;
  matchConfidence?: number | null;
  finalBidUsd?: number | null;
  saleDate?: string | null;
  saleDateRaw?: string | null;
  externalSourceKey?: SourceKey | null;
  externalSourceLabel?: string | null;
  externalLotNumber?: string | null;
  externalVin?: string | null;
  condition?: string | null;
  damage?: string | null;
  secondaryDamage?: string | null;
  mileage?: string | null;
  location?: string | null;
  color?: string | null;
  seller?: string | null;
  documents?: string | null;
  raw?: unknown;
  errorText?: string | null;
}

export interface SoldPriceStats {
  groupKey: string;
  groupLabel: string;
  groupCount: number;
  medianUsd: number | null;
  q1Usd: number | null;
  q3Usd: number | null;
  iqrUsd: number | null;
  deltaUsd: number | null;
  deltaPercent: number | null;
  outlier: "low" | "high" | null;
}

export interface SoldPriceExplorerItem extends LotListItem {
  soldPrice: SoldPriceRow;
  stats: SoldPriceStats;
}

export interface SoldPriceExplorerFilters {
  model: string;
  source: string;
  year: string;
  minPrice: string;
  maxPrice: string;
  q: string;
  highlightedOnly: boolean;
  sort: string;
}

export interface SoldPriceExplorerOptions {
  models: Array<{ key: string; label: string }>;
  sources: Array<{ key: string; label: string }>;
  years: number[];
}

export interface SoldPriceExplorerData {
  items: SoldPriceExplorerItem[];
  filters: SoldPriceExplorerFilters;
  options: SoldPriceExplorerOptions;
}

export interface RunnerManifestFile {
  path: string;
  sha256: string;
  byteSize: number;
}

export interface RunnerManifest {
  version: string;
  minimumSupportedVersion: string;
  generatedAt: string;
  baseUrl: string;
  entrypoint: string;
  packageJsonPath: string;
  files: RunnerManifestFile[];
}
