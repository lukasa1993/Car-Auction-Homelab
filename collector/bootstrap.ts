import { createHash, verify } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";

type SourceKey = "copart" | "iaai";

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

function parseSelectedSites(argv: string[]): SourceKey[] {
  const siteIndex = argv.indexOf("--site");
  if (siteIndex === -1 || !argv[siteIndex + 1]) {
    return ["copart", "iaai"];
  }

  const selectedSites = Array.from(
    new Set(
      argv[siteIndex + 1]
        .split(",")
        .map((value) => value.trim().toLowerCase())
        .filter((value): value is SourceKey => value === "copart" || value === "iaai"),
    ),
  );

  return selectedSites.length > 0 ? selectedSites : ["copart", "iaai"];
}

function stripSiteArg(argv: string[]): string[] {
  const nextArgs: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--site") {
      index += 1;
      continue;
    }
    nextArgs.push(argv[index]);
  }
  return nextArgs;
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

function stripPatchMarkers(source: string): string {
  return source.replace(/^\/\* bootstrap runtime patches:[^\n]* \*\/\n?/gm, "");
}

function replaceOneOf(source: string, searches: string[], replacement: string, label: string): string {
  for (const search of searches) {
    if (source.includes(search)) {
      return source.replace(search, replacement);
    }
  }
  throw new Error(`Collector runtime patch could not find expected snippet for ${label}.`);
}

function patchRunnerEntrypoint(versionDir: string, manifest: RunnerManifest): void {
  const entrypointPath = path.join(versionDir, manifest.entrypoint);
  const rawSource = readFileSync(entrypointPath, "utf8");
  if (manifest.entrypoint.endsWith(".js")) {
    console.warn(
      `Skipping collector runtime patch for built entrypoint ${manifest.entrypoint}. Refresh collector/release instead of patching compiled output.`,
    );
    return;
  }
  const patchMarker = "/* bootstrap runtime patches: iaai-location-v2 target-blacklist-v1 */";
  if (rawSource.includes(patchMarker)) {
    return;
  }
  let source = stripPatchMarkers(rawSource);

  source = replaceOneOf(
    source,
    [
      "const readTitleValue = (node: ParentNode, prefix: string) =>\n      normalize(node.querySelector<HTMLElement>(`[title^=\\\"${prefix}\\\"]`)?.textContent);",
      "const readTitleValue = (node: ParentNode, prefix: string) => {\n      const element = node.querySelector<HTMLElement>(`[title^=\\\"${prefix}\\\"]`);\n      const value = element?.getAttribute(\\\"title\\\") || element?.textContent || \\\"\\\";\n      return normalize(value.replace(new RegExp(`^${prefix}\\\\s*`, \\\"i\\\"), \\\"\\\"));\n    };",
    ],
    "const readTitleValue = (node: ParentNode, prefix: string) => {\n      const element = node.querySelector<HTMLElement>(`[title^=\\\"${prefix}\\\"]`);\n      const value = element?.getAttribute(\\\"title\\\") || element?.textContent || \\\"\\\";\n      return normalize(value.replace(new RegExp(`^${prefix}\\\\s*`, \\\"i\\\"), \\\"\\\"));\n    };",
    "iaai readTitleValue",
  );

  source = replaceOneOf(
    source,
    [
      "const branch = normalize(block.querySelector<HTMLElement>('a[aria-label=\\\"Branch Name\\\"]')?.textContent);",
      "const branchElement = block.querySelector<HTMLElement>('a[aria-label=\\\"Branch Name\\\"]');\n      const branch = normalize(branchElement?.getAttribute(\\\"title\\\") || branchElement?.textContent);",
    ],
    "const branchElement = block.querySelector<HTMLElement>('a[aria-label=\\\"Branch Name\\\"]');\n      const branch = normalize(branchElement?.getAttribute(\\\"title\\\") || branchElement?.textContent);",
    "iaai branch extraction",
  );

  source = replaceOneOf(
    source,
    [
      "const vehicleLocation = normalize(block.querySelector<HTMLElement>('.text-md[title^=\\\"Vehicle Location:\\\"]')?.textContent);",
      "const vehicleLocationElement = block.querySelector<HTMLElement>('.text-md[title^=\\\"Vehicle Location:\\\"]');\n      const vehicleLocation = normalize(\n        (vehicleLocationElement?.getAttribute(\\\"title\\\") || vehicleLocationElement?.textContent || \\\"\\\")\n          .replace(/^Vehicle Location:\\\\s*/i, \\\"\\\"),\n      );",
    ],
    "const vehicleLocationElement = block.querySelector<HTMLElement>('.text-md[title^=\\\"Vehicle Location:\\\"]');\n      const vehicleLocation = normalize(\n        (vehicleLocationElement?.getAttribute(\\\"title\\\") || vehicleLocationElement?.textContent || \\\"\\\")\n          .replace(/^Vehicle Location:\\\\s*/i, \\\"\\\"),\n      );",
    "iaai vehicle location extraction",
  );

  source = replaceOneOf(
    source,
    [
      "function normalizeColorValue(value: string | null | undefined): string | null {\n  const normalized = normalizeWhitespace(value);\n  if (!normalized) {\n    return null;\n  }\n  return toTitleCase(normalized.replace(/[.,;:\\-–]+$/, \"\"));\n}",
    ],
    "function normalizeColorValue(value: string | null | undefined): string | null {\n  const normalized = normalizeWhitespace(value);\n  if (!normalized) {\n    return null;\n  }\n  return toTitleCase(normalized.replace(/[.,;:\\-–]+$/, \"\"));\n}\n\nfunction normalizeTargetFilterList(values: unknown): string[] {\n  if (!Array.isArray(values)) {\n    return [];\n  }\n  const result: string[] = [];\n  const seen = new Set<string>();\n  for (const value of values) {\n    const normalized = normalizeWhitespace(String(value || \"\"));\n    if (!normalized) {\n      continue;\n    }\n    const key = normalized.toLowerCase();\n    if (seen.has(key)) {\n      continue;\n    }\n    seen.add(key);\n    result.push(normalized);\n  }\n  return result;\n}\n\nfunction normalizeLocationForTargetFilter(value: string | null | undefined): string {\n  return normalizeWhitespace(String(value || \"\").toLowerCase().replace(/[^a-z0-9]+/g, \" \"));\n}\n\nfunction matchesTargetBlacklist(target: VinTarget, record: { color?: string | null; location?: string | null }): boolean {\n  const rejectColors = normalizeTargetFilterList((target as any).rejectColors);\n  if (rejectColors.length > 0) {\n    const normalizedColor = normalizeWhitespace(String(record.color || \"\")).toLowerCase();\n    if (normalizedColor && rejectColors.some((value) => value.toLowerCase() === normalizedColor)) {\n      return true;\n    }\n  }\n\n  const rejectLocations = normalizeTargetFilterList((target as any).rejectLocations);\n  if (rejectLocations.length === 0) {\n    return false;\n  }\n\n  const normalizedLocation = normalizeLocationForTargetFilter(record.location);\n  if (!normalizedLocation) {\n    return false;\n  }\n  const locationTokens = new Set(normalizedLocation.split(\" \"));\n  return rejectLocations.some((value) => {\n    const normalizedNeedle = normalizeLocationForTargetFilter(value);\n    if (!normalizedNeedle) {\n      return false;\n    }\n    return normalizedNeedle.includes(\" \")\n      ? normalizedLocation.includes(normalizedNeedle)\n      : locationTokens.has(normalizedNeedle);\n  });\n}",
    "target blacklist helpers",
  );

  source = replaceOneOf(
    source,
    [
      "  const record: ScrapedLotRecord = {\n    sourceKey,\n    sourceLabel: sourceKey === \"iaai\" ? \"IAAI\" : \"Copart\",\n    targetKey: target.key,\n    yearPage,\n    carType: target.carType,\n    marker: target.marker,\n    vinPattern: matchedCode,\n    modelYear,\n    vin,\n    lotNumber: extractLot(text, candidate.url),\n    sourceDetailId: sourceKey === \"iaai\" ? candidate.url.match(/\\/VehicleDetail\\/(\\d+)/i)?.[1] || null : null,\n    vehicleTitle: normalizeVehicleTitle(candidate.title || \"\"),\n    status,\n    auctionDate,\n    auctionDateRaw,\n    location: extractLocation(text),\n    url: candidate.url,\n    evidence: text,\n    color: candidate.color ?? extractColorValue(text),\n    sourceRaw: candidate.sourceRaw,\n  };\n  if (!record.lotNumber) {",
    ],
    "  const record: ScrapedLotRecord = {\n    sourceKey,\n    sourceLabel: sourceKey === \"iaai\" ? \"IAAI\" : \"Copart\",\n    targetKey: target.key,\n    yearPage,\n    carType: target.carType,\n    marker: target.marker,\n    vinPattern: matchedCode,\n    modelYear,\n    vin,\n    lotNumber: extractLot(text, candidate.url),\n    sourceDetailId: sourceKey === \"iaai\" ? candidate.url.match(/\\/VehicleDetail\\/(\\d+)/i)?.[1] || null : null,\n    vehicleTitle: normalizeVehicleTitle(candidate.title || \"\"),\n    status,\n    auctionDate,\n    auctionDateRaw,\n    location: extractLocation(text),\n    url: candidate.url,\n    evidence: text,\n    color: candidate.color ?? extractColorValue(text),\n    sourceRaw: candidate.sourceRaw,\n  };\n  if (matchesTargetBlacklist(target, record)) {\n    return { value: null, filterReason: \"identity\" };\n  }\n  if (!record.lotNumber) {",
    "buildRecord target blacklist",
  );

  source = replaceOneOf(
    source,
    [
      "  const record: ScrapedLotRecord = {\n    sourceKey: \"copart\",\n    sourceLabel: \"Copart\",\n    targetKey: target.key,\n    yearPage: Number(item.lcy) || null,\n    carType: target.carType,\n    marker: target.marker,\n    vinPattern: matchedCode,\n    modelYear: Number(item.lcy) || null,\n    vin,\n    lotNumber: String(item.lotNumberStr || \"\"),\n    sourceDetailId: null,\n    vehicleTitle,\n    status,\n    auctionDate: dateInfo.value,\n    auctionDateRaw: dateInfo.raw,\n    location: item.yn || item.syn || \"\",\n    url: `https://www.copart.com/lot/${item.lotNumberStr}/${item.ldu || \"\"}`.replace(/\\/$/, \"\"),\n    evidence: text,\n    color: normalizeColorValue(item.clr) || extractColorValue([item.lcd, item.ld, item.ess].filter(Boolean).join(\" \")),\n    sourceRaw: {\n      source: \"copart-search-api\",\n      item,\n    },\n  };\n  if (!record.lotNumber) {",
    ],
    "  const record: ScrapedLotRecord = {\n    sourceKey: \"copart\",\n    sourceLabel: \"Copart\",\n    targetKey: target.key,\n    yearPage: Number(item.lcy) || null,\n    carType: target.carType,\n    marker: target.marker,\n    vinPattern: matchedCode,\n    modelYear: Number(item.lcy) || null,\n    vin,\n    lotNumber: String(item.lotNumberStr || \"\"),\n    sourceDetailId: null,\n    vehicleTitle,\n    status,\n    auctionDate: dateInfo.value,\n    auctionDateRaw: dateInfo.raw,\n    location: item.yn || item.syn || \"\",\n    url: `https://www.copart.com/lot/${item.lotNumberStr}/${item.ldu || \"\"}`.replace(/\\/$/, \"\"),\n    evidence: text,\n    color: normalizeColorValue(item.clr) || extractColorValue([item.lcd, item.ld, item.ess].filter(Boolean).join(\" \")),\n    sourceRaw: {\n      source: \"copart-search-api\",\n      item,\n    },\n  };\n  if (matchesTargetBlacklist(target, record)) {\n    return { value: null, filterReason: \"identity\" };\n  }\n  if (!record.lotNumber) {",
    "buildCopartApiRecord target blacklist",
  );

  writeFileSync(entrypointPath, `${patchMarker}\n${source}`);
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

  patchRunnerEntrypoint(versionDir, manifest);
  writeFileSync(path.join(runnerHome, "current-version.txt"), manifest.version);
  return versionDir;
}

function spawnCollectorProcess({
  versionDir,
  manifest,
  baseUrl,
  updateBaseUrl,
  passthroughArgs,
  siteKey,
}: {
  versionDir: string;
  manifest: RunnerManifest;
  baseUrl: string;
  updateBaseUrl: string;
  passthroughArgs: string[];
  siteKey?: SourceKey;
}) {
  const childArgs = [
    "bun",
    "run",
    manifest.entrypoint,
    "--base-url",
    baseUrl,
    "--update-base-url",
    updateBaseUrl,
    ...passthroughArgs,
    ...(siteKey ? ["--site", siteKey] : []),
  ];

  return Bun.spawn(childArgs, {
    cwd: versionDir,
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
    env: process.env,
  });
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

  const selectedSites = parseSelectedSites(args.passthroughArgs);
  const passthroughArgs = stripSiteArg(args.passthroughArgs);

  if (selectedSites.length <= 1) {
    const child = spawnCollectorProcess({
      versionDir,
      manifest,
      baseUrl: args.baseUrl,
      updateBaseUrl: args.updateBaseUrl,
      passthroughArgs,
      siteKey: selectedSites[0],
    });
    const exitCode = await child.exited;
    process.exit(exitCode);
  }

  const children = selectedSites.map((siteKey) =>
    spawnCollectorProcess({
      versionDir,
      manifest,
      baseUrl: args.baseUrl,
      updateBaseUrl: args.updateBaseUrl,
      passthroughArgs,
      siteKey,
    }),
  );

  const exitCodes = await Promise.all(children.map(async (child) => await child.exited));
  const failedExitCode = exitCodes.find((code) => code !== 0);
  process.exit(failedExitCode ?? 0);
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});