import { createHash, sign } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import type { RunnerManifest } from "./types";

interface BuildRunnerManifestInput {
  runnerDir: string;
  baseUrl: string;
  version: string;
  minimumSupportedVersion: string;
}

function sha256File(filePath: string): string {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

export function buildRunnerManifest(input: BuildRunnerManifestInput): RunnerManifest {
  const files = readdirSync(input.runnerDir)
    .filter((fileName) =>
      [
        "auction-runner.js",
        "sold-price-runner.js",
        "bootstrap.js",
        "package.json",
        "README.txt",
      ].includes(fileName),
    )
    .sort()
    .map((fileName) => {
      const filePath = path.join(input.runnerDir, fileName);
      return {
        path: fileName,
        sha256: sha256File(filePath),
        byteSize: statSync(filePath).size,
      };
    });

  return {
    version: input.version,
    minimumSupportedVersion: input.minimumSupportedVersion,
    generatedAt: new Date().toISOString(),
    baseUrl: input.baseUrl,
    entrypoint: "auction-runner.js",
    packageJsonPath: "package.json",
    files,
  };
}

export function signRunnerManifest(manifest: RunnerManifest, privateKeyPem: string): string {
  return sign(null, Buffer.from(JSON.stringify(manifest), "utf8"), privateKeyPem).toString(
    "base64",
  );
}
