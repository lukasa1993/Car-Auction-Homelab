CREATE TABLE IF NOT EXISTS user (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  email_verified INTEGER NOT NULL DEFAULT 0,
  image TEXT,
  created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
  updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);

CREATE TABLE IF NOT EXISTS session (
  id TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL,
  token TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
  updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
  ip_address TEXT,
  user_agent TEXT,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS session_userId_idx ON session(user_id);

CREATE TABLE IF NOT EXISTS account (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  access_token TEXT,
  refresh_token TEXT,
  id_token TEXT,
  access_token_expires_at INTEGER,
  refresh_token_expires_at INTEGER,
  scope TEXT,
  password TEXT,
  created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
  updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);

CREATE INDEX IF NOT EXISTS account_userId_idx ON account(user_id);

CREATE TABLE IF NOT EXISTS verification (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
  updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);

CREATE INDEX IF NOT EXISTS verification_identifier_idx ON verification(identifier);

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
  reject_colors_json TEXT NOT NULL DEFAULT '[]',
  reject_locations_json TEXT NOT NULL DEFAULT '[]',
  enabled_copart INTEGER NOT NULL DEFAULT 1,
  enabled_iaai INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS vin_targets_active_idx ON vin_targets(active);
CREATE INDEX IF NOT EXISTS vin_targets_sort_idx ON vin_targets(sort_order, key);

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

CREATE INDEX IF NOT EXISTS idx_lots_source_target ON lots(source_key, target_key);
CREATE INDEX IF NOT EXISTS idx_lots_workflow ON lots(workflow_state);

CREATE TABLE IF NOT EXISTS lot_snapshots (
  id TEXT PRIMARY KEY,
  lot_id TEXT NOT NULL REFERENCES lots(id) ON DELETE CASCADE,
  sync_run_id TEXT REFERENCES sync_runs(id) ON DELETE SET NULL,
  observed_at TEXT NOT NULL,
  is_present INTEGER NOT NULL DEFAULT 1,
  snapshot_json TEXT NOT NULL,
  UNIQUE(lot_id, sync_run_id, is_present)
);

CREATE INDEX IF NOT EXISTS idx_snapshots_lot_id ON lot_snapshots(lot_id);

CREATE TABLE IF NOT EXISTS lot_actions (
  id TEXT PRIMARY KEY,
  lot_id TEXT NOT NULL REFERENCES lots(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  note TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_actions_lot_id ON lot_actions(lot_id);

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

CREATE UNIQUE INDEX IF NOT EXISTS idx_lot_images_single_lot ON lot_images(lot_id);
CREATE INDEX IF NOT EXISTS idx_lot_images_lot_id ON lot_images(lot_id);

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
  external_url TEXT,
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

CREATE INDEX IF NOT EXISTS idx_sold_prices_status_due ON lot_sold_prices(lookup_status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_sold_prices_final_bid ON lot_sold_prices(final_bid_usd);
