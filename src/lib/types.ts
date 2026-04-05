export type SourceKey = "copart" | "iaai";

export type LotStatus = "upcoming" | "done" | "unknown" | "missing" | "canceled";

export type WorkflowState = "new" | "approved" | "removed";

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
