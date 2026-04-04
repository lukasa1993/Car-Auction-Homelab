import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { buildRunnerManifest, signRunnerManifest } from "../src/lib/runner-manifest";

const DEFAULT_UPDATE_BASE_URL = "https://raw.githubusercontent.com/lukasa1993/Car-Auction-Homelab/main/collector/release";

function getArg(argv: string[], flag: string, fallback: string): string {
  const index = argv.indexOf(flag);
  return index !== -1 && argv[index + 1] ? argv[index + 1] : fallback;
}

async function main(): Promise<void> {
  const rootDir = path.resolve(import.meta.dir, "..");
  const collectorDir = path.join(rootDir, "collector");
  const distDir = path.join(collectorDir, "dist");
  const releaseDir = path.resolve(
    getArg(process.argv.slice(2), "--release-dir", path.join(collectorDir, "release")),
  );
  const privateKeyFile = path.resolve(
    getArg(
      process.argv.slice(2),
      "--private-key-file",
      process.env.AUCTION_COLLECTOR_PRIVATE_KEY_FILE || path.join(rootDir, "runner-keys", "collector-signing-key.pem"),
    ),
  );
  const updateBaseUrl = getArg(
    process.argv.slice(2),
    "--update-base-url",
    process.env.AUCTION_COLLECTOR_UPDATE_BASE_URL || DEFAULT_UPDATE_BASE_URL,
  ).replace(/\/$/, "");

  if (!existsSync(privateKeyFile)) {
    throw new Error(`Collector signing key not found at ${privateKeyFile}`);
  }

  const build = Bun.spawn({
    cmd: ["bun", "run", "build"],
    cwd: collectorDir,
    stdout: "inherit",
    stderr: "inherit",
    stdin: "ignore",
  });
  const buildExitCode = await build.exited;
  if (buildExitCode !== 0) {
    throw new Error(`collector build failed with exit code ${buildExitCode}`);
  }

  const packageJson = JSON.parse(readFileSync(path.join(collectorDir, "package.json"), "utf8")) as { version?: string };
  const version = String(packageJson.version || "0.1.0");
  const minimumSupportedVersion = process.env.AUCTION_MINIMUM_RUNNER_VERSION || version;

  rmSync(releaseDir, { recursive: true, force: true });
  mkdirSync(releaseDir, { recursive: true });

  for (const entry of readdirSync(distDir, { withFileTypes: true })) {
    if (!entry.isFile()) {
      continue;
    }
    copyFileSync(path.join(distDir, entry.name), path.join(releaseDir, entry.name));
  }

  const manifest = buildRunnerManifest({
    runnerDir: distDir,
    baseUrl: updateBaseUrl,
    version,
    minimumSupportedVersion,
  });
  const signature = signRunnerManifest(manifest, readFileSync(privateKeyFile, "utf8"));

  writeFileSync(path.join(releaseDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  writeFileSync(path.join(releaseDir, "manifest.sig"), `${signature}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        ok: true,
        releaseDir,
        updateBaseUrl,
        version,
        minimumSupportedVersion,
        files: readdirSync(releaseDir).sort(),
      },
      null,
      2,
    ),
  );
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
