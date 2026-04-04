import { createHash, verify } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";

interface RunnerManifestFile {
  path: string;
  sha256: string;
  byteSize: number;
}

interface RunnerManifest {
  version: string;
  minimumSupportedVersion: string;
  generatedAt: string;
  baseUrl: string;
  entrypoint: string;
  packageJsonPath: string;
  files: RunnerManifestFile[];
}

function parseArgs(argv: string[]) {
  const baseUrlIndex = argv.indexOf("--base-url");
  const updateBaseUrlIndex = argv.indexOf("--update-base-url");
  const homeIndex = argv.indexOf("--collector-home") !== -1 ? argv.indexOf("--collector-home") : argv.indexOf("--runner-home");
  const keyIndex = argv.indexOf("--public-key-file");
  const baseUrl = (baseUrlIndex !== -1 ? argv[baseUrlIndex + 1] : process.env.AUCTION_BASE_URL || "https://auc.ldev.cloud").replace(/\/$/, "");
  return {
    baseUrl,
    updateBaseUrl: (
      updateBaseUrlIndex !== -1
        ? argv[updateBaseUrlIndex + 1]
        : process.env.AUCTION_COLLECTOR_UPDATE_BASE_URL || `${baseUrl}/collector/runtime`
    ).replace(/\/$/, ""),
    runnerHome: homeIndex !== -1 ? argv[homeIndex + 1] : path.join(os.homedir(), ".cache", "lnh-auction-collector"),
    publicKeyFile:
      keyIndex !== -1
        ? argv[keyIndex + 1]
        : process.env.AUCTION_COLLECTOR_PUBLIC_KEY_FILE || process.env.AUCTION_RUNNER_PUBLIC_KEY_FILE || "",
    passthroughArgs: argv.filter((value, index) => {
      if (["--base-url", "--update-base-url", "--collector-home", "--runner-home", "--public-key-file"].includes(value)) {
        return false;
      }
      if (index > 0 && ["--base-url", "--update-base-url", "--collector-home", "--runner-home", "--public-key-file"].includes(argv[index - 1])) {
        return false;
      }
      return true;
    }),
  };
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { "cache-control": "no-store" },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return await response.text();
}

async function fetchManifest(baseUrl: string): Promise<RunnerManifest> {
  const response = await fetch(`${baseUrl}/manifest.json`, {
    headers: { "cache-control": "no-store" },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${baseUrl}/manifest.json`);
  }
  return await response.json() as RunnerManifest;
}

function verifyManifest(manifest: RunnerManifest, signatureBase64: string, publicKeyPem: string): void {
  const valid = verify(
    null,
    Buffer.from(JSON.stringify(manifest), "utf8"),
    publicKeyPem,
    Buffer.from(signatureBase64, "base64"),
  );
  if (!valid) {
    throw new Error("Runner manifest signature is invalid.");
  }
}

async function downloadFile(url: string, destination: string, expectedSha256: string): Promise<void> {
  const response = await fetch(url, {
    headers: { "cache-control": "no-store" },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const actualSha256 = sha256Hex(bytes);
  if (actualSha256 !== expectedSha256) {
    throw new Error(`Hash mismatch for ${url}: expected ${expectedSha256}, got ${actualSha256}`);
  }
  mkdirSync(path.dirname(destination), { recursive: true });
  writeFileSync(destination, bytes);
}

function joinUpdateUrl(baseUrl: string, relativePath: string): string {
  const encodedPath = relativePath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${baseUrl}/${encodedPath}`;
}

async function ensureRunnerVersion(updateBaseUrl: string, runnerHome: string, manifest: RunnerManifest): Promise<string> {
  const versionDir = path.join(runnerHome, "versions", manifest.version);
  const manifestPath = path.join(versionDir, "manifest.json");
  mkdirSync(versionDir, { recursive: true });

  let installNeeded = !existsSync(manifestPath);
  if (!installNeeded) {
    try {
      const localManifest = JSON.parse(readFileSync(manifestPath, "utf8")) as RunnerManifest;
      installNeeded = JSON.stringify(localManifest.files) !== JSON.stringify(manifest.files);
    } catch {
      installNeeded = true;
    }
  }

  if (installNeeded) {
    for (const file of manifest.files) {
      const destination = path.join(versionDir, file.path);
      await downloadFile(joinUpdateUrl(updateBaseUrl, file.path), destination, file.sha256);
    }
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    const install = Bun.spawn(["bun", "install"], {
      cwd: versionDir,
      stdout: "inherit",
      stderr: "inherit",
      stdin: "ignore",
    });
    const installCode = await install.exited;
    if (installCode !== 0) {
      throw new Error(`bun install failed with exit code ${installCode}`);
    }
  }

  const browserMarker = path.join(versionDir, ".playwright-installed");
  if (!existsSync(browserMarker)) {
    const browserInstall = Bun.spawn(["bunx", "playwright", "install", "chromium"], {
      cwd: versionDir,
      stdout: "inherit",
      stderr: "inherit",
      stdin: "ignore",
    });
    const browserCode = await browserInstall.exited;
    if (browserCode !== 0) {
      throw new Error(`playwright install failed with exit code ${browserCode}`);
    }
    writeFileSync(browserMarker, new Date().toISOString());
  }

  writeFileSync(path.join(runnerHome, "current-version.txt"), manifest.version);
  return versionDir;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.publicKeyFile) {
    throw new Error("Set AUCTION_COLLECTOR_PUBLIC_KEY_FILE or pass --public-key-file before running the collector bootstrap.");
  }
  const publicKeyPem = readFileSync(args.publicKeyFile, "utf8");
  const manifest = await fetchManifest(args.updateBaseUrl);
  const signature = await fetchText(`${args.updateBaseUrl}/manifest.sig`);
  verifyManifest(manifest, signature.trim(), publicKeyPem);
  const versionDir = await ensureRunnerVersion(args.updateBaseUrl, args.runnerHome, manifest);

  const child = Bun.spawn(
    ["bun", "run", manifest.entrypoint, "--base-url", args.baseUrl, "--update-base-url", args.updateBaseUrl, ...args.passthroughArgs],
    {
      cwd: versionDir,
      stdout: "inherit",
      stderr: "inherit",
      stdin: "inherit",
      env: process.env,
    },
  );
  const exitCode = await child.exited;
  process.exit(exitCode);
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
