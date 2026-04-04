import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { buildRunnerManifest, signRunnerManifest } from "../lib/runner-manifest";
import type { ServerConfig } from "./config";

export function buildCollectorManifest(config: ServerConfig) {
  return buildRunnerManifest({
    runnerDir: config.collectorRuntimeDir,
    baseUrl: config.collectorUpdateBaseUrl,
    version: config.collectorVersion,
    minimumSupportedVersion: config.minimumSupportedCollectorVersion,
  });
}

export function readCollectorPrivateKey(config: ServerConfig): string | null {
  if (!config.collectorPrivateKeyPath || !existsSync(config.collectorPrivateKeyPath)) {
    return null;
  }
  return readFileSync(config.collectorPrivateKeyPath, "utf8");
}

export function signCollectorManifest(config: ServerConfig) {
  const privateKey = readCollectorPrivateKey(config);
  if (!privateKey) {
    return null;
  }
  return signRunnerManifest(buildCollectorManifest(config), privateKey);
}

export function resolveCollectorRuntimeFile(config: ServerConfig, relativePath: string): string | null {
  const normalized = relativePath.replace(/^\/+/, "");
  const absolute = path.resolve(config.collectorRuntimeDir, normalized);
  if (!absolute.startsWith(path.resolve(config.collectorRuntimeDir))) {
    return null;
  }
  return absolute;
}
