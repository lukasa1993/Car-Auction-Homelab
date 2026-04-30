import os from "node:os";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import { chromium, type BrowserContext, type Page } from "playwright";

import {
  findBestBidfaxMatch,
  isBidfaxChallengeHtml,
  parseBidfaxDetailHtml,
  parseBidfaxSearchHtml,
  type BidfaxMatchedSale,
  type BidfaxParsedSale,
} from "./bidfax-parser";

type SourceKey = "copart" | "iaai";
type SoldPriceLookupStatus = "found" | "not_found" | "blocked" | "failed";

interface RunnerManifest {
  version: string;
  minimumSupportedVersion: string;
}

interface SoldPriceQueueItem {
  lotId: string;
  sourceKey: SourceKey;
  sourceLabel: string;
  targetKey: string | null;
  lotNumber: string;
  vin: string | null;
  modelYear: number | null;
  carType: string;
  marker: string;
  auctionDate: string | null;
  status: string;
  url: string;
}

interface SoldPriceResultInput {
  lotId: string;
  lookupStatus: SoldPriceLookupStatus;
  bidfaxUrl?: string | null;
  matchedQuery?: string | null;
  matchConfidence?: number | null;
  finalBidUsd?: number | null;
  saleDate?: string | null;
  saleDateRaw?: string | null;
  externalSourceKey?: SourceKey | null;
  externalSourceLabel?: string | null;
  externalLotNumber?: string | null;
  externalVin?: string | null;
  condition?: string | null;
  damage?: string | null;
  secondaryDamage?: string | null;
  mileage?: string | null;
  location?: string | null;
  color?: string | null;
  seller?: string | null;
  documents?: string | null;
  raw?: unknown;
  errorText?: string | null;
}

interface RunnerArgs {
  baseUrl: string;
  updateBaseUrl: string;
  limit: number;
  machineName: string;
}

const packageJson = JSON.parse(await Bun.file(new URL("./package.json", import.meta.url)).text()) as { version?: string };
const RUNNER_VERSION = String(packageJson.version || "0.1.0");
const REQUIRED_DISPLAY = process.env.AUCTION_REQUIRED_DISPLAY || ":99";
const DEFAULT_MANUAL_GATE_TIMEOUT_MS = 15 * 60 * 1000;
const DEFAULT_MANUAL_GATE_POLL_MS = 3000;
const BIDFAX_BASE_URL = "https://en.bidfax.info";
const QUERY_DELAY_MS = 2500;
const DETAIL_DELAY_MS = 900;
const SHARED_HEADED_BROWSER_PRIMARY_URL = process.env.AUCTION_HEADED_BROWSER_URL || "";
const SHARED_HEADED_BROWSER_FALLBACK_URL = process.env.AUCTION_HEADED_BROWSER_FALLBACK_URL || "";
const SHARED_HEADED_BROWSER_PASSWORD = process.env.AUCTION_HEADED_BROWSER_PASSWORD || "";

function parseArgs(argv: string[]): RunnerArgs {
  const baseUrlIndex = argv.indexOf("--base-url");
  const updateBaseUrlIndex = argv.indexOf("--update-base-url");
  const limitIndex = argv.indexOf("--limit");
  const baseUrl = (baseUrlIndex !== -1 ? argv[baseUrlIndex + 1] : process.env.AUCTION_BASE_URL || "https://auc.ldev.cloud").replace(/\/$/, "");
  const limit = Number(limitIndex !== -1 ? argv[limitIndex + 1] : process.env.AUCTION_SOLD_PRICE_LIMIT || "20");
  return {
    baseUrl,
    updateBaseUrl: (
      updateBaseUrlIndex !== -1
        ? argv[updateBaseUrlIndex + 1]
        : process.env.AUCTION_COLLECTOR_UPDATE_BASE_URL || `${baseUrl}/collector/runtime`
    ).replace(/\/$/, ""),
    limit: Number.isFinite(limit) && limit > 0 ? Math.min(100, Math.floor(limit)) : 20,
    machineName: process.env.AUCTION_MACHINE_NAME || os.hostname(),
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getPositiveEnvNumber(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(1, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes === 0 ? `${seconds}s` : `${minutes}m ${seconds}s`;
}

function buildSharedHeadedBrowserHelp(currentUrl = ""): string {
  const details = [
    SHARED_HEADED_BROWSER_PRIMARY_URL ? `Open ${SHARED_HEADED_BROWSER_PRIMARY_URL}` : "",
    SHARED_HEADED_BROWSER_FALLBACK_URL ? `fallback ${SHARED_HEADED_BROWSER_FALLBACK_URL}` : "",
    SHARED_HEADED_BROWSER_PASSWORD ? "shared browser password is configured" : "",
    currentUrl ? `current page ${currentUrl}` : "",
  ].filter(Boolean);
  return details.length > 0 ? details.join("; ") : "Use the shared headed browser to clear the gate.";
}

async function waitForManualGateClearance<T>({
  label,
  reason,
  readState,
  isResolved,
  summarizeState,
  getCurrentUrl,
}: {
  label: string;
  reason: string;
  readState: () => Promise<T>;
  isResolved: (state: T) => boolean;
  summarizeState?: (state: T) => string;
  getCurrentUrl?: () => string;
}): Promise<T> {
  const timeoutMs = getPositiveEnvNumber("AUCTION_MANUAL_GATE_TIMEOUT_MS", DEFAULT_MANUAL_GATE_TIMEOUT_MS);
  const pollMs = getPositiveEnvNumber("AUCTION_MANUAL_GATE_POLL_MS", DEFAULT_MANUAL_GATE_POLL_MS);
  const startedAt = Date.now();
  const initialUrl = getCurrentUrl?.() || "";
  console.warn(
    `Manual action required for ${label}: ${reason}. Waiting up to ${formatDuration(timeoutMs)}. ${buildSharedHeadedBrowserHelp(initialUrl)}`,
  );
  let lastState = await readState();
  while (Date.now() - startedAt < timeoutMs) {
    if (isResolved(lastState)) {
      console.log(`Manual gate cleared for ${label} after ${formatDuration(Date.now() - startedAt)}.`);
      return lastState;
    }
    await delay(pollMs);
    lastState = await readState();
  }
  const stateSummary = summarizeState ? summarizeState(lastState) : "";
  throw new Error(`Manual gate not cleared for ${label} within ${formatDuration(timeoutMs)}. ${stateSummary}`);
}

async function fetchJson<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return await response.json() as T;
}

async function fetchRemoteManifest(baseUrl: string): Promise<RunnerManifest> {
  return await fetchJson(`${baseUrl}/manifest.json`, {
    headers: { "cache-control": "no-store" },
  });
}

function compareVersionStrings(left: string, right: string): number {
  const leftParts = String(left || "").split(".");
  const rightParts = String(right || "").split(".");
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = leftParts[index] || "0";
    const rightPart = rightParts[index] || "0";
    const leftIsNumber = /^\d+$/.test(leftPart);
    const rightIsNumber = /^\d+$/.test(rightPart);
    if (leftIsNumber && rightIsNumber) {
      const diff = Number(leftPart) - Number(rightPart);
      if (diff !== 0) {
        return diff < 0 ? -1 : 1;
      }
      continue;
    }
    const diff = leftPart.localeCompare(rightPart);
    if (diff !== 0) {
      return diff < 0 ? -1 : 1;
    }
  }
  return 0;
}

async function verifyRunnerFreshness(baseUrl: string): Promise<void> {
  const manifest = await fetchRemoteManifest(baseUrl);
  if (compareVersionStrings(RUNNER_VERSION, manifest.minimumSupportedVersion) < 0 || RUNNER_VERSION !== manifest.version) {
    throw new Error(
      `Sold-price runner ${RUNNER_VERSION} is stale. Remote collector is ${manifest.version}. Re-run the bootstrap/update step before scraping.`,
    );
  }
}

async function fetchQueue(baseUrl: string, token: string, limit: number): Promise<SoldPriceQueueItem[]> {
  const query = new URLSearchParams({ limit: String(limit) });
  const payload = await fetchJson<{ lots: SoldPriceQueueItem[] }>(`${baseUrl}/api/sold-price/queue?${query.toString()}`, {
    headers: {
      authorization: `Bearer ${token}`,
      "cache-control": "no-store",
    },
  });
  return payload.lots || [];
}

async function postResults(baseUrl: string, token: string, results: SoldPriceResultInput[]): Promise<void> {
  if (results.length === 0) {
    return;
  }
  await fetchJson(`${baseUrl}/api/sold-price/results`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ results }),
  });
}

async function launchBidfaxContext(): Promise<BrowserContext> {
  if (process.env.DISPLAY !== REQUIRED_DISPLAY) {
    throw new Error(
      `Sold-price runner must run headed on DISPLAY=${REQUIRED_DISPLAY}. Current DISPLAY=${process.env.DISPLAY || "<unset>"}. ${buildSharedHeadedBrowserHelp()}`,
    );
  }
  const profileDir = path.join(os.homedir(), ".cache", "lnh-auction-collector", "playwright-profile-bidfax");
  await mkdir(profileDir, { recursive: true });
  return await chromium.launchPersistentContext(profileDir, {
    headless: false,
    viewport: null,
    ignoreHTTPSErrors: true,
    args: ["--disable-blink-features=AutomationControlled"],
  });
}

async function readBidfaxPageState(page: Page): Promise<{ blocked: boolean; ready: boolean; title: string; bodyPreview: string; html: string }> {
  const html = await page.content().catch(() => "");
  const snapshot = await page.evaluate(() => {
    const bodyText = (document.body?.innerText || "").replace(/\s+/g, " ").trim();
    return {
      title: document.title || "",
      bodyPreview: bodyText.slice(0, 500),
      bodyLength: bodyText.length,
    };
  }).catch(() => ({ title: "", bodyPreview: "", bodyLength: 0 }));
  const lowerPreview = `${snapshot.title} ${snapshot.bodyPreview}`.toLowerCase();
  const blocked = isBidfaxChallengeHtml(html) ||
    lowerPreview.includes("enable javascript and cookies") ||
    lowerPreview.includes("confirm you're not a robot");
  return {
    blocked,
    ready: !blocked && snapshot.bodyLength > 100,
    title: snapshot.title,
    bodyPreview: snapshot.bodyPreview,
    html,
  };
}

async function waitForBidfaxReady(page: Page, label: string): Promise<{ html: string; blocked: boolean }> {
  let state = await readBidfaxPageState(page);
  const startedAt = Date.now();
  while (!state.ready && !state.blocked && Date.now() - startedAt < 12000) {
    await page.waitForTimeout(600);
    state = await readBidfaxPageState(page);
  }
  if (state.blocked) {
    try {
      state = await waitForManualGateClearance({
        label,
        reason: "Bidfax challenge",
        getCurrentUrl: () => page.url(),
        readState: async () => await readBidfaxPageState(page),
        isResolved: (nextState) => nextState.ready && !nextState.blocked,
        summarizeState: (nextState) => `${nextState.title} ${nextState.bodyPreview}`.slice(0, 240),
      });
    } catch (error) {
      console.warn(error instanceof Error ? error.message : String(error));
      return { html: state.html, blocked: true };
    }
  }
  return { html: state.html, blocked: state.blocked };
}

function buildSearchUrl(query: string): string {
  const params = new URLSearchParams({
    do: "search",
    subaction: "search",
    story: query,
    token2: "0",
    action2: "search_action",
  });
  return `${BIDFAX_BASE_URL}/?${params.toString()}`;
}

function toResultFromSale(item: SoldPriceQueueItem, match: BidfaxMatchedSale, query: string, sale: BidfaxParsedSale): SoldPriceResultInput {
  return {
    lotId: item.lotId,
    lookupStatus: "found",
    bidfaxUrl: sale.url,
    matchedQuery: query,
    matchConfidence: match.confidence,
    finalBidUsd: sale.finalBidUsd,
    saleDate: sale.saleDate,
    saleDateRaw: sale.saleDateRaw,
    externalSourceKey: sale.sourceKey,
    externalSourceLabel: sale.sourceLabel,
    externalLotNumber: sale.lotNumber,
    externalVin: sale.vin,
    condition: sale.condition,
    damage: sale.damage,
    secondaryDamage: sale.secondaryDamage,
    mileage: sale.mileage,
    location: sale.location,
    color: sale.color,
    seller: sale.seller,
    documents: sale.documents,
    raw: {
      reason: match.reason,
      title: sale.title,
      rawText: sale.rawText,
    },
  };
}

async function enrichMatchedSale(page: Page, match: BidfaxMatchedSale, item: SoldPriceQueueItem): Promise<BidfaxMatchedSale> {
  if (!match.sale.url) {
    return match;
  }
  await delay(DETAIL_DELAY_MS);
  await page.goto(match.sale.url, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
  const state = await waitForBidfaxReady(page, `bidfax detail ${item.lotNumber}`);
  if (state.blocked) {
    return match;
  }
  const detailSale = parseBidfaxDetailHtml(state.html, match.sale.url);
  if (!detailSale) {
    return match;
  }
  const detailMatch = findBestBidfaxMatch([detailSale], {
    sourceKey: item.sourceKey,
    lotNumber: item.lotNumber,
    vin: item.vin,
  });
  return detailMatch || match;
}

async function searchBidfax(page: Page, item: SoldPriceQueueItem, query: string): Promise<{ match: BidfaxMatchedSale | null; blocked: boolean }> {
  const searchUrl = buildSearchUrl(query);
  await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
  const state = await waitForBidfaxReady(page, `bidfax search ${item.lotNumber}`);
  if (state.blocked) {
    return { match: null, blocked: true };
  }
  const sales = parseBidfaxSearchHtml(state.html);
  const match = findBestBidfaxMatch(sales, {
    sourceKey: item.sourceKey,
    lotNumber: item.lotNumber,
    vin: item.vin,
  });
  return {
    match: match ? await enrichMatchedSale(page, match, item) : null,
    blocked: false,
  };
}

async function lookupSoldPrice(page: Page, item: SoldPriceQueueItem): Promise<SoldPriceResultInput> {
  const queries = Array.from(new Set([item.vin, item.lotNumber].filter((value): value is string => !!value && value.trim().length > 0)));
  for (const [index, query] of queries.entries()) {
    if (index > 0) {
      await delay(QUERY_DELAY_MS);
    }
    try {
      const result = await searchBidfax(page, item, query);
      if (result.blocked) {
        return {
          lotId: item.lotId,
          lookupStatus: "blocked",
          matchedQuery: query,
          errorText: "Bidfax challenge was not cleared",
        };
      }
      if (result.match) {
        return toResultFromSale(item, result.match, query, result.match.sale);
      }
    } catch (error) {
      return {
        lotId: item.lotId,
        lookupStatus: "failed",
        matchedQuery: query,
        errorText: error instanceof Error ? error.message : String(error),
      };
    }
  }
  return {
    lotId: item.lotId,
    lookupStatus: "not_found",
    matchedQuery: queries[0] || item.lotNumber,
    errorText: "No exact Bidfax VIN or lot/source match",
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const ingestToken = process.env.AUCTION_INGEST_TOKEN;
  if (!ingestToken) {
    throw new Error("Set AUCTION_INGEST_TOKEN before running the sold-price runner.");
  }

  await verifyRunnerFreshness(args.updateBaseUrl);
  const queue = await fetchQueue(args.baseUrl, ingestToken, args.limit);
  console.log(`Loaded ${queue.length} sold-price candidate${queue.length === 1 ? "" : "s"} from ${args.baseUrl}.`);
  if (queue.length === 0) {
    return;
  }

  const context = await launchBidfaxContext();
  const results: SoldPriceResultInput[] = [];
  try {
    const page = context.pages()[0] || await context.newPage();
    for (const item of queue) {
      const result = await lookupSoldPrice(page, item);
      results.push(result);
      console.log(JSON.stringify({
        message: "sold price lookup",
        lotNumber: item.lotNumber,
        sourceKey: item.sourceKey,
        status: result.lookupStatus,
        finalBidUsd: result.finalBidUsd ?? null,
        matchedQuery: result.matchedQuery ?? null,
      }));
      await postResults(args.baseUrl, ingestToken, [result]);
      await delay(QUERY_DELAY_MS);
    }
  } finally {
    await context.close().catch(() => {});
  }

  const found = results.filter((result) => result.lookupStatus === "found").length;
  console.log(`Submitted ${results.length} sold-price result${results.length === 1 ? "" : "s"} (${found} found).`);
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
