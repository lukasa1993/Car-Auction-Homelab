import { createPrivateKey, sign } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import type { RunnerManifest } from "./types";
import { sha256Hex } from "./utils";

function walkFiles(rootDir: string, relativeDir = ""): string[] {
  const directory = path.join(rootDir, relativeDir);
  const entries = readdirSync(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const relativePath = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(rootDir, relativePath));
      continue;
    }
    if (entry.isFile()) {
      files.push(relativePath);
    }
  }
  return files.sort((left, right) => left.localeCompare(right));
}

export function buildRunnerManifest(options: {
  runnerDir: string;
  baseUrl: string;
  version: string;
  minimumSupportedVersion: string;
}): RunnerManifest {
  let generatedAtMs = 0;
  const files = walkFiles(options.runnerDir).map((relativePath) => {
    const absolutePath = path.join(options.runnerDir, relativePath);
    const stats = statSync(absolutePath);
    generatedAtMs = Math.max(generatedAtMs, stats.mtimeMs);
    const content = readFileSync(absolutePath);
    return {
      path: relativePath.replaceAll(path.sep, "/"),
      sha256: sha256Hex(content),
      byteSize: stats.size,
    };
  });

  return {
    version: options.version,
    minimumSupportedVersion: options.minimumSupportedVersion,
    generatedAt: new Date(generatedAtMs || Date.now()).toISOString(),
    baseUrl: options.baseUrl.replace(/\/$/, ""),
    entrypoint: "auction-runner.js",
    packageJsonPath: "package.json",
    files,
  };
}

export function signRunnerManifest(manifest: RunnerManifest, privateKeyPem: string): string {
  const serialized = JSON.stringify(manifest);
  return sign(null, Buffer.from(serialized, "utf8"), createPrivateKey(privateKeyPem)).toString("base64");
}
