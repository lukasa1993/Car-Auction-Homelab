import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export interface ServerConfig {
  rootDir: string;
  dataDir: string;
  databasePath: string;
  mediaDir: string;
  collectorSourceDir: string;
  collectorRuntimeDir: string;
  publicDir: string;
  appCssSource: string;
  appCssOutput: string;
  appJsSource: string;
  appJsOutput: string;
  port: number;
  host: string;
  baseUrl: string;
  collectorUpdateBaseUrl: string;
  adminPassword: string;
  ingestToken: string;
  collectorPrivateKeyPath: string;
  collectorVersion: string;
  minimumSupportedCollectorVersion: string;
  vapidPublicKey: string;
  vapidPrivateKey: string;
  vapidSubject: string;
}

export function loadServerConfig(): ServerConfig {
  const rootDir = process.env.AUCTION_ROOT_DIR || path.resolve(import.meta.dir, "..", "..");
  const dataDir = process.env.AUCTION_DATA_DIR || path.join(rootDir, "data");
  const databasePath = process.env.AUCTION_SQLITE_PATH || path.join(dataDir, "auction.sqlite");
  const mediaDir = process.env.AUCTION_MEDIA_DIR || path.join(dataDir, "images");
  const collectorSourceDir =
    process.env.AUCTION_COLLECTOR_DIR ||
    process.env.AUCTION_RUNNER_DIR ||
    path.join(rootDir, "collector");
  const collectorRuntimeDir =
    process.env.AUCTION_COLLECTOR_RUNTIME_DIR ||
    path.join(collectorSourceDir, "dist");
  const publicDir = path.join(rootDir, "public");
  const appCssSource = path.join(rootDir, "src", "styles", "app.css");
  const appCssOutput = path.join(publicDir, "app.css");
  const appJsSource = path.join(rootDir, "src", "ui", "client.tsx");
  const appJsOutput = path.join(publicDir, "app.js");
  const port = Number.parseInt(process.env.PORT || process.env.AUCTION_PORT || "3005", 10);
  const host = process.env.HOST || process.env.AUCTION_HOST || "0.0.0.0";
  const baseUrl = (process.env.AUCTION_BASE_URL || `http://localhost:${port}`).replace(/\/$/, "");
  const collectorUpdateBaseUrl = (
    process.env.AUCTION_COLLECTOR_UPDATE_BASE_URL ||
    `${baseUrl}/collector/runtime`
  ).replace(/\/$/, "");
  const adminPassword = process.env.AUCTION_ADMIN_PASSWORD || "change-me";
  const ingestToken = process.env.AUCTION_INGEST_TOKEN || "change-me-ingest";
  const collectorPrivateKeyPath =
    process.env.AUCTION_COLLECTOR_PRIVATE_KEY_FILE ||
    process.env.AUCTION_RUNNER_PRIVATE_KEY_FILE ||
    "";
  const collectorVersionFile = existsSync(path.join(collectorSourceDir, "package.json"))
    ? path.join(collectorSourceDir, "package.json")
    : path.join(collectorRuntimeDir, "package.json");
  const collectorVersion =
    process.env.AUCTION_RUNNER_VERSION ||
    JSON.parse(readFileSync(collectorVersionFile, "utf8")).version ||
    "0.1.0";
  const minimumSupportedCollectorVersion =
    process.env.AUCTION_MINIMUM_RUNNER_VERSION || collectorVersion;

  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || "";
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || "";
  const vapidSubject = process.env.VAPID_SUBJECT || "";

  return {
    rootDir,
    dataDir,
    databasePath,
    mediaDir,
    collectorSourceDir,
    collectorRuntimeDir,
    publicDir,
    appCssSource,
    appCssOutput,
    appJsSource,
    appJsOutput,
    port,
    host,
    baseUrl,
    collectorUpdateBaseUrl,
    adminPassword,
    ingestToken,
    collectorPrivateKeyPath,
    collectorVersion,
    minimumSupportedCollectorVersion,
    vapidPublicKey,
    vapidPrivateKey,
    vapidSubject,
  };
}
