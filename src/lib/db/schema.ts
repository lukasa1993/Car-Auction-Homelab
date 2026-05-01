import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).default(false).notNull(),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .$onUpdate(() => new Date())
    .notNull(),
});

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
    scope: text("scope"),
    password: text("password"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const vinTargets = sqliteTable(
  "vin_targets",
  {
    id: text("id").primaryKey(),
    key: text("key").notNull().unique(),
    label: text("label").notNull(),
    carType: text("car_type").notNull(),
    marker: text("marker").notNull(),
    vinPattern: text("vin_pattern").notNull(),
    vinPrefix: text("vin_prefix").notNull(),
    yearFrom: integer("year_from").notNull(),
    yearTo: integer("year_to").notNull(),
    copartSlug: text("copart_slug").notNull(),
    iaaiPath: text("iaai_path").notNull(),
    rejectColorsJson: text("reject_colors_json").notNull().default("[]"),
    rejectLocationsJson: text("reject_locations_json").notNull().default("[]"),
    enabledCopart: integer("enabled_copart", { mode: "boolean" }).default(true).notNull(),
    enabledIaai: integer("enabled_iaai", { mode: "boolean" }).default(true).notNull(),
    active: integer("active", { mode: "boolean" }).default(true).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("vin_targets_active_idx").on(table.active),
    index("vin_targets_sort_idx").on(table.sortOrder, table.key),
  ],
);

export const syncRuns = sqliteTable("sync_runs", {
  id: text("id").primaryKey(),
  runnerId: text("runner_id"),
  runnerVersion: text("runner_version"),
  machineName: text("machine_name"),
  submittedAt: text("submitted_at").notNull(),
  startedAt: text("started_at"),
  completedAt: text("completed_at"),
  status: text("status").notNull(),
  sourceKeysJson: text("source_keys_json").notNull(),
  coveredScopesJson: text("covered_scopes_json").notNull(),
  recordsReceived: integer("records_received").default(0).notNull(),
  recordsUpserted: integer("records_upserted").default(0).notNull(),
  recordsMissingMarked: integer("records_missing_marked").default(0).notNull(),
  errorText: text("error_text"),
});

export const lots = sqliteTable(
  "lots",
  {
    id: text("id").primaryKey(),
    sourceKey: text("source_key").notNull(),
    sourceLabel: text("source_label").notNull(),
    targetKey: text("target_key"),
    lotNumber: text("lot_number").notNull(),
    sourceDetailId: text("source_detail_id"),
    carType: text("car_type").notNull(),
    marker: text("marker").notNull(),
    vinPattern: text("vin_pattern"),
    vin: text("vin"),
    modelYear: integer("model_year"),
    yearPage: integer("year_page"),
    status: text("status").notNull(),
    workflowState: text("workflow_state").default("new").notNull(),
    workflowNote: text("workflow_note"),
    auctionDate: text("auction_date"),
    auctionDateRaw: text("auction_date_raw"),
    location: text("location"),
    url: text("url").notNull(),
    evidence: text("evidence"),
    color: text("color"),
    sourceRawJson: text("source_raw_json"),
    firstSeenAt: text("first_seen_at").notNull(),
    lastSeenAt: text("last_seen_at").notNull(),
    lastIngestedAt: text("last_ingested_at").notNull(),
    lastSyncRunId: text("last_sync_run_id"),
    missingSince: text("missing_since"),
    missingCount: integer("missing_count").default(0).notNull(),
    canceledAt: text("canceled_at"),
    approvedAt: text("approved_at"),
    removedAt: text("removed_at"),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("lots_source_lot_idx").on(table.sourceKey, table.lotNumber),
    index("idx_lots_source_target").on(table.sourceKey, table.targetKey),
    index("idx_lots_workflow").on(table.workflowState),
  ],
);

export const lotSnapshots = sqliteTable(
  "lot_snapshots",
  {
    id: text("id").primaryKey(),
    lotId: text("lot_id")
      .notNull()
      .references(() => lots.id, { onDelete: "cascade" }),
    syncRunId: text("sync_run_id").references(() => syncRuns.id, { onDelete: "set null" }),
    observedAt: text("observed_at").notNull(),
    isPresent: integer("is_present", { mode: "boolean" }).default(true).notNull(),
    snapshotJson: text("snapshot_json").notNull(),
  },
  (table) => [
    uniqueIndex("lot_snapshots_lot_run_present_idx").on(
      table.lotId,
      table.syncRunId,
      table.isPresent,
    ),
    index("idx_snapshots_lot_id").on(table.lotId),
  ],
);

export const lotActions = sqliteTable(
  "lot_actions",
  {
    id: text("id").primaryKey(),
    lotId: text("lot_id")
      .notNull()
      .references(() => lots.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    actor: text("actor").notNull(),
    note: text("note"),
    metadataJson: text("metadata_json"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("idx_actions_lot_id").on(table.lotId)],
);

export const lotImages = sqliteTable(
  "lot_images",
  {
    id: text("id").primaryKey(),
    lotId: text("lot_id")
      .notNull()
      .references(() => lots.id, { onDelete: "cascade" }),
    sourceUrl: text("source_url").notNull(),
    storagePath: text("storage_path").notNull(),
    mimeType: text("mime_type"),
    sha256: text("sha256").notNull(),
    byteSize: integer("byte_size").notNull(),
    width: integer("width"),
    height: integer("height"),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: text("created_at").notNull(),
    lastSeenAt: text("last_seen_at").notNull(),
    lastSyncRunId: text("last_sync_run_id"),
    active: integer("active", { mode: "boolean" }).default(true).notNull(),
  },
  (table) => [
    uniqueIndex("lot_images_lot_sha_idx").on(table.lotId, table.sha256),
    uniqueIndex("idx_lot_images_single_lot").on(table.lotId),
    index("idx_lot_images_lot_id").on(table.lotId),
  ],
);

export const pushSubscriptions = sqliteTable("push_subscriptions", {
  id: text("id").primaryKey(),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: text("created_at").notNull(),
});

export const lotNotificationLog = sqliteTable(
  "lot_notification_log",
  {
    lotId: text("lot_id").notNull(),
    eventType: text("event_type").notNull(),
    notifiedAt: text("notified_at").notNull(),
  },
  (table) => [uniqueIndex("lot_notification_log_pk").on(table.lotId, table.eventType)],
);

export const lotSoldPrices = sqliteTable(
  "lot_sold_prices",
  {
    id: text("id").primaryKey(),
    lotId: text("lot_id")
      .notNull()
      .unique()
      .references(() => lots.id, { onDelete: "cascade" }),
    lookupStatus: text("lookup_status").notNull(),
    attemptCount: integer("attempt_count").default(0).notNull(),
    lastAttemptedAt: text("last_attempted_at"),
    nextAttemptAt: text("next_attempt_at"),
    foundAt: text("found_at"),
    externalUrl: text("external_url"),
    matchedQuery: text("matched_query"),
    matchConfidence: real("match_confidence"),
    finalBidUsd: integer("final_bid_usd"),
    saleDate: text("sale_date"),
    saleDateRaw: text("sale_date_raw"),
    externalSourceKey: text("external_source_key"),
    externalSourceLabel: text("external_source_label"),
    externalLotNumber: text("external_lot_number"),
    externalVin: text("external_vin"),
    condition: text("condition"),
    damage: text("damage"),
    secondaryDamage: text("secondary_damage"),
    mileage: text("mileage"),
    location: text("location"),
    color: text("color"),
    seller: text("seller"),
    documents: text("documents"),
    rawJson: text("raw_json"),
    errorText: text("error_text"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_sold_prices_status_due").on(table.lookupStatus, table.nextAttemptAt),
    index("idx_sold_prices_final_bid").on(table.finalBidUsd),
  ],
);
