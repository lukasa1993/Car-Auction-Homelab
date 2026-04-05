import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { chromium, type BrowserContext, type Page } from "playwright";
import { DateTime } from "luxon";

import { buildVinMaskRegex, normalizeVinPattern } from "../src/lib/vin-patterns";

type SourceKey = "copart" | "iaai";
type RunnerScopeStatus = "complete" | "failed" | "partial";

interface VinTarget {
  id: string;
  key: string;
  label: string;
  carType: string;
  marker: string;
  vinPattern: string;
  vinPrefix: string;
  yearFrom: number;
  yearTo: number;
  copartSlug: string;
  iaaiPath: string;
  enabledCopart: boolean;
  enabledIaai: boolean;
  active: boolean;
  sortOrder: number;
}

interface RunnerManifest {
  version: string;
  minimumSupportedVersion: string;
}

interface ScrapedLotRecord {
  sourceKey: SourceKey;
  sourceLabel: string;
  targetKey: string;
  yearPage: number | null;
  carType: string;
  marker: string;
  vinPattern: string;
  modelYear: number | null;
  vin: string;
  lotNumber: string;
  sourceDetailId?: string | null;
  status: "upcoming" | "done" | "unknown" | "missing" | "canceled";
  auctionDate: string;
  auctionDateRaw: string;
  location: string;
  url: string;
  evidence: string;
}

interface ScrapedRecordWithImages {
  record: ScrapedLotRecord;
  imageCandidates: string[];
}

interface LotImageSyncState {
  imageId: string;
  sourceUrl: string;
  sha256: string;
  width: number | null;
  height: number | null;
}

interface CoveredScope {
  sourceKey: SourceKey;
  targetKey: string;
  status: RunnerScopeStatus;
  notes?: string;
}

interface RunnerArgs {
  baseUrl: string;
  updateBaseUrl: string;
  siteKeys: SourceKey[];
  headless: boolean;
  unattended: boolean;
  machineName: string;
}

const packageJson = JSON.parse(await Bun.file(new URL("./package.json", import.meta.url)).text()) as { version?: string };
const RUNNER_VERSION = String(packageJson.version || "0.1.0");
const DEFAULT_HTTP_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36";
const MAX_IMAGE_FETCH_ATTEMPTS = 4;
const IMAGE_UPLOAD_CONCURRENCY = 4;
const COPART_TARGET_DELAY_MS = 2500;
const COPART_READY_SETTLE_MS = 1500;
const COPART_API_PAGE_DELAY_MS = 1250;
const COPART_DELAY_JITTER_MS = 750;
const MIN_HD_LONG_EDGE = 1024;
const MIN_HD_SHORT_EDGE = 720;

const HTML_ENTITY_MAP: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  "#39": "'",
  nbsp: " ",
};

const UPCOMING_MARKERS = [
  "upcoming lot",
  "pre-bid",
  "bid now",
  "current bid",
  "auction live",
  "buy now",
  "sale date: future",
  "auction date: future",
  "future",
];

const DONE_MARKERS = [
  "sold",
  "awarded",
  "archived",
  "auction ended",
  "ended on",
  "sale ended",
  "final bid",
];

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

const TIMEZONE_ZONES: Record<string, string> = {
  UTC: "UTC",
  GMT: "UTC",
  EST: "America/New_York",
  EDT: "America/New_York",
  CST: "America/Chicago",
  CDT: "America/Chicago",
  MST: "America/Denver",
  MDT: "America/Denver",
  PST: "America/Los_Angeles",
  PDT: "America/Los_Angeles",
};

function normalizeWhitespace(value: string | null | undefined): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function decodeHtmlEntities(text: string): string {
  return String(text || "")
    .replace(/&(#x?[0-9a-f]+|amp|lt|gt|quot|#39|nbsp);/gi, (match, entity) => {
      const normalized = entity.toLowerCase();
      if (normalized in HTML_ENTITY_MAP) {
        return HTML_ENTITY_MAP[normalized];
      }
      if (normalized.startsWith("#x")) {
        return String.fromCodePoint(Number.parseInt(normalized.slice(2), 16));
      }
      if (normalized.startsWith("#")) {
        return String.fromCodePoint(Number.parseInt(normalized.slice(1), 10));
      }
      return match;
    })
    .replace(/\r/g, " ");
}

function stripHtml(html: string): string {
  return normalizeWhitespace(
    decodeHtmlEntities(
      String(html || "")
        .replace(/<br\s*\/?>/gi, " ")
        .replace(/<\/(div|p|li|tr|h[1-6])>/gi, " ")
        .replace(/<[^>]+>/g, " "),
    ),
  );
}

function pad2(value: number | string): string {
  return String(value).padStart(2, "0");
}

function parseArgs(argv: string[]): RunnerArgs {
  const siteKeys = new Set<SourceKey>(["copart", "iaai"]);
  const siteIndex = argv.indexOf("--site");
  if (siteIndex !== -1 && argv[siteIndex + 1]) {
    siteKeys.clear();
    for (const part of argv[siteIndex + 1].split(",")) {
      const normalized = part.trim().toLowerCase();
      if (normalized === "copart" || normalized === "iaai") {
        siteKeys.add(normalized);
      }
    }
  }
  if (siteKeys.size === 0) {
    throw new Error("No valid sites selected. Use --site copart,iaai");
  }
  const baseUrlArg = argv.indexOf("--base-url");
  const updateBaseUrlArg = argv.indexOf("--update-base-url");
  const baseUrl = (baseUrlArg !== -1 ? argv[baseUrlArg + 1] : process.env.AUCTION_BASE_URL || "https://auc.ldev.cloud").replace(/\/$/, "");
  return {
    baseUrl,
    updateBaseUrl: (
      updateBaseUrlArg !== -1
        ? argv[updateBaseUrlArg + 1]
        : process.env.AUCTION_COLLECTOR_UPDATE_BASE_URL || `${baseUrl}/collector/runtime`
    ).replace(/\/$/, ""),
    siteKeys: [...siteKeys],
    headless: false,
    unattended: false,
    machineName: process.env.AUCTION_MACHINE_NAME || os.hostname(),
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function delayWithJitter(baseMs: number, jitterMs: number): Promise<void> {
  const jitter = jitterMs > 0 ? Math.floor(Math.random() * jitterMs) : 0;
  await delay(baseMs + jitter);
}

function getLuxonZone(zone: string | null | undefined): string {
  return TIMEZONE_ZONES[String(zone || "").toUpperCase()] || "UTC";
}

function inferYearForMonthDay(month: number, day: number, now: Date): number {
  const currentYear = now.getFullYear();
  const candidate = new Date(currentYear, month - 1, day);
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (candidate < yesterday) {
    return currentYear + 1;
  }
  return currentYear;
}

function parseTimeParts(raw: string): { hour: number; minute: number; second: number; hasTime: boolean } {
  if (!raw) {
    return { hour: 0, minute: 0, second: 0, hasTime: false };
  }
  const match = raw.trim().match(/^(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!match) {
    return { hour: 0, minute: 0, second: 0, hasTime: false };
  }
  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const second = Number(match[3] || 0);
  const meridiem = (match[4] || "").toUpperCase();
  if (meridiem === "AM" && hour === 12) {
    hour = 0;
  } else if (meridiem === "PM" && hour !== 12) {
    hour += 12;
  }
  return { hour, minute, second, hasTime: true };
}

function buildIsoDateTime(year: number, month: number, day: number, hour: number, minute: number, second: number, timeZone?: string | null): string {
  return (
    DateTime.fromObject({ year, month, day, hour, minute, second }, { zone: getLuxonZone(timeZone) }).toISO({
      suppressMilliseconds: true,
      includeOffset: true,
    }) || ""
  );
}

function parseDateString(raw: string, now: Date): string | null {
  const cleaned = raw
    .replace(/^(Mon|Tue|Tues|Wed|Thu|Thur|Thurs|Fri|Sat|Sun)\.?,?\s+/i, "")
    .replace(/\s+\d{1,2}:\d{2}\s*(AM|PM)\s*GMT[+-]\d+$/i, "")
    .trim();
  if (/^\d{4}[/-]\d{2}[/-]\d{2}$/.test(raw)) {
    return raw.replaceAll("/", "-");
  }
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(raw)) {
    const [day, month, year] = raw.split(".");
    return `${year}-${month}-${day}`;
  }
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
    const [month, day, year] = raw.split("/");
    return `${year}-${month}-${day}`;
  }
  const weekdayTimeMatch = raw.match(
    /^(?:Mon|Tue|Tues|Wed|Thu|Thur|Thurs|Fri|Sat|Sun)\.?,?\s+([A-Za-z]{3,9})\s+(\d{1,2})(?:\s*,\s*(\d{4}))?\s*,\s*(\d{1,2}(?::\d{2})?\s*(?:AM|PM))(?:\s+(UTC|GMT|EST|EDT|CST|CDT|MST|MDT|PST|PDT))?$/i,
  );
  if (weekdayTimeMatch) {
    const month = MONTHS[weekdayTimeMatch[1].toLowerCase()];
    const day = Number(weekdayTimeMatch[2]);
    const year = Number(weekdayTimeMatch[3] || inferYearForMonthDay(month, day, now));
    const { hour, minute, second } = parseTimeParts(weekdayTimeMatch[4]);
    return buildIsoDateTime(year, month, day, hour, minute, second, weekdayTimeMatch[5]);
  }
  const monthDateMatch = cleaned.match(/^([A-Za-z]{3,9})\s+(\d{1,2}),\s+(\d{4})$/);
  if (monthDateMatch) {
    const month = MONTHS[monthDateMatch[1].toLowerCase()];
    const day = pad2(monthDateMatch[2]);
    return `${monthDateMatch[3]}-${pad2(month)}-${day}`;
  }
  const monthDayNoYearMatch = cleaned.match(/^([A-Za-z]{3,9})\s+(\d{1,2})$/);
  if (monthDayNoYearMatch) {
    const month = MONTHS[monthDayNoYearMatch[1].toLowerCase()];
    const day = pad2(monthDayNoYearMatch[2]);
    const year = `${inferYearForMonthDay(month, Number(monthDayNoYearMatch[2]), now)}`;
    return `${year}-${pad2(month)}-${day}`;
  }
  return null;
}

function parseAuctionDate(text: string, now: Date): { raw: string; value: string } | null {
  const lowered = text.toLowerCase();
  const explicitPatterns = [
    /\b(?:sale date|auction date|ends on|ended on|starts on|date auction)[:\s-]*([0-9]{4}[/-][0-9]{2}[/-][0-9]{2})/i,
    /\b(?:sale date|auction date|ends on|ended on|starts on|date auction)[:\s-]*([0-9]{2}\.[0-9]{2}\.[0-9]{4})/i,
    /\b(?:sale date|auction date|ends on|ended on|starts on|date auction)[:\s-]*([0-9]{2}\/[0-9]{2}\/[0-9]{4})/i,
    /\b(?:sale date|auction date|ends on|ended on|starts on|date auction)[:\s-]*([A-Za-z]{3,9}\s+[0-9]{1,2},\s+[0-9]{4})/i,
    /\b(?:sale date|auction date|ends on|ended on|starts on|date auction)[:\s-]*((?:Mon|Tue|Tues|Wed|Thu|Thur|Thurs|Fri|Sat|Sun)\.?,?\s+[A-Za-z]{3,9}\s+\d{1,2}\s*,?\s*(?:\d{4}\s*,\s*)?\d{1,2}(?::\d{2})?\s*(?:AM|PM)\s*(?:UTC|GMT|EST|EDT|CST|CDT|MST|MDT|PST|PDT))\b/i,
    /\bAuction\s*:\s*((?:Mon|Tue|Tues|Wed|Thu|Thur|Thurs|Fri|Sat|Sun)\.?,?\s+[A-Za-z]{3,9}\s+\d{1,2}\s*,?\s*(?:\d{4}\s*,\s*)?\d{1,2}(?::\d{2})?\s*(?:AM|PM)\s*(?:UTC|GMT|EST|EDT|CST|CDT|MST|MDT|PST|PDT))\b/i,
  ];
  for (const pattern of explicitPatterns) {
    const match = text.match(pattern);
    if (!match) {
      continue;
    }
    const parsed = parseDateString(match[1], now);
    if (parsed) {
      return { raw: match[1], value: parsed };
    }
  }
  const statusMarker = UPCOMING_MARKERS.find((marker) => lowered.includes(marker));
  if (statusMarker) {
    return { raw: statusMarker, value: "future" };
  }
  return null;
}

function isUpcomingStatus(record: ScrapedLotRecord, nowIso: string): boolean {
  if (record.status === "done") {
    return false;
  }
  if (record.auctionDate === "future") {
    return true;
  }
  if (record.auctionDate) {
    if (record.auctionDate.includes("T")) {
      const scheduled = DateTime.fromISO(record.auctionDate, { setZone: true });
      const now = DateTime.fromISO(nowIso);
      if (scheduled.isValid && now.isValid) {
        return scheduled >= now;
      }
    }
    return record.auctionDate >= nowIso.slice(0, 10);
  }
  return record.status === "upcoming";
}

function isWithinSaleWindow(record: ScrapedLotRecord, nowIso: string, saleWindowDays = 7): boolean {
  if (!record.auctionDate || record.auctionDate === "future") {
    return false;
  }
  const now = DateTime.fromISO(nowIso);
  const windowEnd = now.plus({ days: saleWindowDays }).endOf("day");
  if (record.auctionDate.includes("T")) {
    const scheduled = DateTime.fromISO(record.auctionDate, { setZone: true });
    return scheduled.isValid && scheduled >= now && scheduled <= windowEnd;
  }
  const scheduledDate = DateTime.fromISO(record.auctionDate).endOf("day");
  return scheduledDate.isValid && scheduledDate >= now.startOf("day") && scheduledDate <= windowEnd;
}

function matchVehicleVinCode(vinOrPrefix = "", target: VinTarget): string | null {
  const normalized = normalizeVinPattern(vinOrPrefix);
  if (!normalized) {
    return null;
  }
  return buildVinMaskRegex(target.vinPattern, true).test(normalized) ? normalizeVinPattern(target.vinPattern) : null;
}

function extractMatchingVin(text: string, target: VinTarget): string {
  const match = text.match(buildVinMaskRegex(target.vinPattern));
  return normalizeVinPattern(match?.[1] || "");
}

function matchesVehicleIdentity(text: string, url: string, target: VinTarget): boolean {
  const haystack = `${text || ""} ${url || ""}`.toUpperCase();
  return target.carType.toUpperCase().split(/\s+/).every((token) => haystack.includes(token));
}

function inferStatus(text: string): ScrapedLotRecord["status"] {
  const lowered = text.toLowerCase();
  if (DONE_MARKERS.some((marker) => lowered.includes(marker))) {
    return "done";
  }
  if (UPCOMING_MARKERS.some((marker) => lowered.includes(marker))) {
    return "upcoming";
  }
  return "unknown";
}

function extractLot(text: string, url: string): string {
  const urlMatch = url.match(/\/lot\/(\d+)/i);
  if (urlMatch) {
    return urlMatch[1];
  }
  const textMatch =
    text.match(/\bLot[#:\s-]*([0-9-]{5,})\b/i) ||
    text.match(/\bStock[#:\s-]*([0-9-]{5,})\b/i);
  return textMatch ? textMatch[1] : "";
}

function extractLocation(text: string): string {
  const branchOrLocationMatch =
    text.match(/\bBranch:\s*([A-Za-z0-9 .,'()/-]{2,80}?)(?=\s+(?:Sale Document|Available to Public|Run & Drive|Offsite|Share|More Details|$))/i) ||
    text.match(/\bLocation:\s*([A-Za-z0-9 .,'()/-]{2,80}?)(?=\s+(?:Sale Document|Available to Public|Run & Drive|Offsite|Share|More Details|$))/i);
  if (branchOrLocationMatch) {
    return normalizeWhitespace(branchOrLocationMatch[1]);
  }
  const patterns = [
    /\b([A-Z]{2}\s*-\s*[A-Z][A-Z -]{2,})\b/,
    /\b([A-Za-z .'-]+\([A-Z]{2}\))\b/,
    /\bLocation:\s*([A-Za-z0-9 .,'()-]{4,80})\b/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return normalizeWhitespace(match[1]);
    }
  }
  return "";
}

function extractModelYear(text: string): number | null {
  const match = text.match(/\b(2020|2021|2022|2023|2024|2025|2026|2027)\b/);
  return match ? Number(match[1]) : null;
}

function buildRecord(sourceKey: SourceKey, yearPage: number, candidate: { text: string; url: string }, nowIso: string, target: VinTarget): ScrapedLotRecord | null {
  const text = normalizeWhitespace(candidate.text);
  if (!/\/lot\/\d+/i.test(candidate.url) && !/\/VehicleDetail\/\d+/i.test(candidate.url)) {
    return null;
  }
  if (!matchesVehicleIdentity(text, candidate.url || "", target)) {
    return null;
  }
  const vin = extractMatchingVin(text, target);
  if (!vin) {
    return null;
  }
  const matchedCode = matchVehicleVinCode(vin, target) || normalizeVinPattern(target.vinPattern);
  const status = inferStatus(text);
  const dateInfo = parseAuctionDate(text, new Date(nowIso));
  const auctionDate = dateInfo ? dateInfo.value : "";
  const auctionDateRaw = dateInfo ? dateInfo.raw : "";
  const modelYear = extractModelYear(text) ?? yearPage;
  if (modelYear < target.yearFrom || modelYear > target.yearTo) {
    return null;
  }
  const record: ScrapedLotRecord = {
    sourceKey,
    sourceLabel: sourceKey === "iaai" ? "IAAI" : "Copart",
    targetKey: target.key,
    yearPage,
    carType: target.carType,
    marker: target.marker,
    vinPattern: matchedCode,
    modelYear,
    vin,
    lotNumber: extractLot(text, candidate.url),
    sourceDetailId: sourceKey === "iaai" ? candidate.url.match(/\/VehicleDetail\/(\d+)/i)?.[1] || null : null,
    status,
    auctionDate,
    auctionDateRaw,
    location: extractLocation(text),
    url: candidate.url,
    evidence: text,
  };
  if (!record.lotNumber) {
    return null;
  }
  if (!isUpcomingStatus(record, nowIso) || !isWithinSaleWindow(record, nowIso)) {
    return null;
  }
  return record;
}

async function fetchJson<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return await response.json() as T;
}

async function fetchText(url: string, options: RequestInit = {}): Promise<string> {
  const response = await fetch(url, {
    ...options,
    headers: {
      "user-agent": DEFAULT_HTTP_USER_AGENT,
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return await response.text();
}

async function fetchRemoteManifest(baseUrl: string): Promise<RunnerManifest> {
  return await fetchJson<RunnerManifest>(`${baseUrl}/manifest.json`, {
    headers: { "cache-control": "no-store" },
  });
}

async function fetchScrapeConfig(baseUrl: string, token: string): Promise<{ configVersion: string; targets: VinTarget[] }> {
  return await fetchJson(`${baseUrl}/api/scrape-config`, {
    headers: {
      authorization: `Bearer ${token}`,
      "cache-control": "no-store",
    },
  });
}

function buildIaaiSearchUrl(target: VinTarget, year: number): string {
  const base = "https://www.iaai.com/Search?keyword=";
  const modelTerm = decodeIaaiSearchTerm(target.iaaiPath);
  return `${base}${encodeURIComponent(`${year} Tesla ${modelTerm}`)}`;
}

function decodeIaaiSearchTerm(value: string): string {
  const trimmed = normalizeWhitespace(String(value || ""));
  if (!trimmed) {
    return "";
  }
  try {
    return normalizeWhitespace(decodeURIComponent(trimmed));
  } catch {
    return trimmed;
  }
}

interface IaaiSearchCandidate {
  text: string;
  url: string;
  imageCandidates: string[];
}

interface IaaiSearchSnapshot {
  title: string;
  bodyPreview: string;
  failure: "access-denied" | "blocked" | null;
  noResults: boolean;
  currentPage: number;
  totalPages: number;
  resultCount: number;
  candidates: IaaiSearchCandidate[];
}

interface IaaiBootstrapState {
  title: string;
  bodyPreview: string;
  failure: "access-denied" | "blocked" | null;
  noResults: boolean;
  ready: boolean;
}

async function readIaaiBootstrapState(page: Page): Promise<IaaiBootstrapState> {
  await dismissBanners(page);
  return await page.evaluate(() => {
    const normalize = (value: string | null | undefined) => String(value || "").replace(/\s+/g, " ").trim();
    const bodyText = normalize(document.body?.innerText || "");
    const lower = bodyText.toLowerCase();
    const title = document.title;
    const searchHistory = document.querySelector<HTMLElement>("#searchHistory");
    const currentPageInput = document.querySelector<HTMLInputElement>("#CurrentPage");
    const pageSizeInput = document.querySelector<HTMLInputElement>("#PageSize");
    const resultCount = Number(searchHistory?.dataset.resultcount || 0);
    const pageSize = Number(searchHistory?.dataset.pagesize || pageSizeInput?.value || 100);
    let failure: "access-denied" | "blocked" | null = null;
    if (
      /noaccess/i.test(title) ||
      lower.includes("this content cannot be displayed because of an issue between the page administrator and the content provider")
    ) {
      failure = "access-denied";
    } else if (
      lower.includes("request unsuccessful") ||
      lower.includes("incapsula incident id") ||
      lower.includes("sorry, you have been blocked")
    ) {
      failure = "blocked";
    }
    return {
      title,
      bodyPreview: bodyText.slice(0, 500),
      failure,
      noResults: lower.includes("no items found for the search criteria specified") || (!!searchHistory && resultCount === 0),
      ready:
        (!!searchHistory || !!currentPageInput) &&
        pageSize > 0 &&
        (!!document.querySelector("#GBPSearchQuery") || !!document.querySelector("#Searches")),
    };
  });
}

async function waitForIaaiBootstrap(page: Page, timeoutMs = 20000): Promise<IaaiBootstrapState> {
  const startedAt = Date.now();
  let snapshot = await readIaaiBootstrapState(page);
  while (Date.now() - startedAt < timeoutMs) {
    if (snapshot.failure) {
      return snapshot;
    }
    if (snapshot.ready || snapshot.noResults) {
      return snapshot;
    }
    await page.waitForTimeout(500);
    snapshot = await readIaaiBootstrapState(page);
  }
  return snapshot;
}

async function buildIaaiSearchRequestPayload(page: Page, pageNumber: number): Promise<Record<string, unknown>> {
  return await page.evaluate((requestedPage) => {
    const parseJson = (value: string | null | undefined) => {
      if (!value) {
        return null;
      }
      try {
        return JSON.parse(value);
      } catch {
        return null;
      }
    };
    const gbpSearchQuery = parseJson((document.querySelector<HTMLInputElement>("#GBPSearchQuery")?.value || "").trim()) as {
      Searches?: Array<{ Facets?: unknown; FullSearch?: string; LongRanges?: unknown; LongDiscretes?: unknown }>;
      ZipCode?: string | null;
      Miles?: number | null;
      ShowRecommendations?: boolean | null;
      Sort?: Array<{ IsGeoSort?: boolean; SortField?: string; IsDescending?: boolean; UseUserIndex?: boolean; ForAnalytics?: boolean }>;
      PageSize?: number | null;
    } | null;
    const searchesScript = parseJson((document.querySelector<HTMLScriptElement>("#Searches")?.textContent || "").trim()) as
      | Array<{ Facets?: unknown; FullSearch?: string; LongRanges?: unknown; LongDiscretes?: unknown }>
      | null;
    const searches = (gbpSearchQuery?.Searches || searchesScript || [])
      .map((entry) => ({
        Facets: entry?.Facets ?? null,
        FullSearch: String(entry?.FullSearch || "").trim(),
        LongRanges: entry?.LongRanges ?? null,
        LongDiscretes: entry?.LongDiscretes ?? null,
      }))
      .filter((entry) => entry.FullSearch);
    const pageSize = Number(document.querySelector<HTMLInputElement>("#PageSize")?.value || gbpSearchQuery?.PageSize || 100);
    const sort = Array.isArray(gbpSearchQuery?.Sort) && gbpSearchQuery.Sort.length > 0
      ? gbpSearchQuery.Sort
      : [{ IsGeoSort: false, SortField: "AuctionDateTime", IsDescending: false }];
    return {
      Searches: searches,
      ZipCode: String(gbpSearchQuery?.ZipCode || ""),
      miles: Number(gbpSearchQuery?.Miles || 0),
      PageSize: Number.isFinite(pageSize) && pageSize > 0 ? pageSize : 100,
      CurrentPage: requestedPage,
      Sort: sort.map((entry) => ({
        IsGeoSort: !!entry?.IsGeoSort,
        SortField: String(entry?.SortField || "AuctionDateTime"),
        IsDescending: !!entry?.IsDescending,
        UseUserIndex: !!entry?.UseUserIndex,
        ForAnalytics: !!entry?.ForAnalytics,
      })),
      ShowRecommendations: !!gbpSearchQuery?.ShowRecommendations,
      SaleStatusFilters: [{ SaleStatus: 1, IsSelected: true }],
      BidStatusFilters: [{ BidStatus: 6, IsSelected: true }],
    };
  }, pageNumber);
}

async function fetchIaaiSearchPageHtmlFromInternalApi(page: Page, pageNumber: number): Promise<string> {
  const payload = await buildIaaiSearchRequestPayload(page, pageNumber);
  const response = await page.evaluate(async ({ body, timestamp }) => {
    const result = await fetch(`/Search?c=${timestamp}`, {
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": "application/json; charset=UTF-8",
        "x-requested-with": "XMLHttpRequest",
      },
      body: JSON.stringify(body),
    });
    return {
      ok: result.ok,
      status: result.status,
      text: await result.text(),
    };
  }, { body: payload, timestamp: Date.now() });
  if (!response.ok) {
    throw new Error(`IAAI internal search request failed with HTTP ${response.status} for page ${pageNumber}`);
  }
  return response.text;
}

async function readIaaiSearchSnapshotFromHtml(page: Page, html: string, fallbackPageNumber: number): Promise<IaaiSearchSnapshot> {
  return await page.evaluate(({ html, fallbackPageNumber }) => {
    const normalize = (value: string | null | undefined) => String(value || "").replace(/\s+/g, " ").trim();
    const template = document.createElement("template");
    template.innerHTML = html;
    const root = template.content;
    const readTitleValue = (node: ParentNode, prefix: string) =>
      normalize(node.querySelector<HTMLElement>(`[title^="${prefix}"]`)?.textContent);
    const bodyText = normalize((root.textContent || "").trim());
    const lower = bodyText.toLowerCase();
    const title = normalize(root.querySelector("title")?.textContent) || document.title;
    const searchHistory = root.querySelector<HTMLElement>("#searchHistory");
    const currentPageInput = root.querySelector<HTMLInputElement>("#CurrentPage");
    const pageSizeInput = root.querySelector<HTMLInputElement>("#PageSize");
    const currentPage = Number(searchHistory?.dataset.currentpage || currentPageInput?.value || fallbackPageNumber);
    const resultCount = Number(searchHistory?.dataset.resultcount || 0);
    const pageSize = Number(searchHistory?.dataset.pagesize || pageSizeInput?.value || 100);
    const totalPages = resultCount > 0 && pageSize > 0 ? Math.ceil(resultCount / pageSize) : 0;
    let failure: "access-denied" | "blocked" | null = null;
    if (
      /noaccess/i.test(title) ||
      lower.includes("this content cannot be displayed because of an issue between the page administrator and the content provider")
    ) {
      failure = "access-denied";
    } else if (
      lower.includes("request unsuccessful") ||
      lower.includes("incapsula incident id") ||
      lower.includes("sorry, you have been blocked")
    ) {
      failure = "blocked";
    }

    const candidates: IaaiSearchCandidate[] = [];
    const seenUrls = new Set<string>();
    for (const block of Array.from(root.querySelectorAll<HTMLElement>(".table-row.table-row-border"))) {
      const titleLink = block.querySelector<HTMLAnchorElement>('h4 a[href*="/VehicleDetail/"]');
      if (!titleLink) {
        continue;
      }
      const href = titleLink.getAttribute("href") || "";
      const url = href ? new URL(href, window.location.origin).toString() : "";
      if (!url || seenUrls.has(url)) {
        continue;
      }
      seenUrls.add(url);

      const stockNumber = readTitleValue(block, "Stock #:");
      const saleDoc = readTitleValue(block, "Title/Sale Doc:");
      const primaryDamage = readTitleValue(block, "Primary Damage:");
      const secondaryDamage = readTitleValue(block, "Secondary Damage:");
      const lossType = readTitleValue(block, "Loss:");
      const odometer = readTitleValue(block, "Odometer:");
      const startCode = readTitleValue(block, "Start Code:");
      const airbags = readTitleValue(block, "Airbags:");
      const keyState = readTitleValue(block, "Key :") || readTitleValue(block, "Key:");
      const engine = readTitleValue(block, "Engine:");
      const fuelType = readTitleValue(block, "Fuel Type:");
      const transmission = readTitleValue(block, "Transmission:");
      const driveline = readTitleValue(block, "Driveline Type:");
      const market = readTitleValue(block, "Market:");
      const acv = readTitleValue(block, "ACV:");
      const vin = normalize(block.querySelector<HTMLElement>('[id^="VIN-"]')?.textContent);
      const branch = normalize(block.querySelector<HTMLElement>('a[aria-label="Branch Name"]')?.textContent);
      const vehicleLocation = normalize(block.querySelector<HTMLElement>('.text-md[title^="Vehicle Location:"]')?.textContent);
      const auctionDate = normalize(
        block.querySelector<HTMLElement>(".data-list--action .data-list__item:first-child .data-list__value--action")?.textContent,
      );
      const actionTexts = Array.from(block.querySelectorAll<HTMLElement>(".data-list--action a, .data-list--action .data-list__value--action"))
        .map((element) => normalize(element.textContent))
        .filter(Boolean);
      const imageCandidates = Array.from(
        new Set(
          [block.querySelector<HTMLImageElement>("img[data-src]")?.getAttribute("data-src"), block.querySelector<HTMLImageElement>("img[src]")?.getAttribute("src")]
            .map((value) => (value ? new URL(value, window.location.origin).toString() : ""))
            .filter(Boolean),
        ),
      );
      const text = normalize(
        [
          normalize(titleLink.textContent),
          stockNumber ? `Stock #: ${stockNumber}` : "",
          saleDoc ? `Title/Sale Doc: ${saleDoc}` : "",
          primaryDamage ? `Primary Damage: ${primaryDamage}` : "",
          secondaryDamage ? `Secondary Damage: ${secondaryDamage}` : "",
          lossType ? `Loss: ${lossType}` : "",
          odometer ? `Odometer: ${odometer}` : "",
          startCode ? `Start Code: ${startCode}` : "",
          airbags ? `Airbags: ${airbags}` : "",
          keyState ? `Key: ${keyState}` : "",
          engine ? `Engine: ${engine}` : "",
          fuelType ? `Fuel Type: ${fuelType}` : "",
          transmission ? `Transmission: ${transmission}` : "",
          driveline ? `Driveline Type: ${driveline}` : "",
          vin ? `VIN:${vin}` : "",
          branch ? `Branch: ${branch}` : "",
          vehicleLocation ? `Location: ${vehicleLocation}` : "",
          market ? `Market: ${market}` : "",
          acv ? `ACV: ${acv}` : "",
          auctionDate ? `Auction: ${auctionDate}` : "",
          ...actionTexts,
        ]
          .filter(Boolean)
          .join(" "),
      );
      if (!text) {
        continue;
      }
      candidates.push({ text, url, imageCandidates });
    }

    return {
      title,
      bodyPreview: bodyText.slice(0, 500),
      failure,
      noResults:
        lower.includes("no items found for the search criteria specified") ||
        (!!searchHistory && resultCount === 0 && candidates.length === 0),
      currentPage,
      totalPages,
      resultCount,
      candidates,
    };
  }, { html, fallbackPageNumber });
}

async function fetchIaaiDirectMatches(page: Page, target: VinTarget, nowIso: string): Promise<{ records: ScrapedRecordWithImages[]; pagesFetched: number; candidatesScanned: number }> {
  const records: ScrapedRecordWithImages[] = [];
  const seenUrls = new Set<string>();
  let pagesFetched = 0;
  let candidatesScanned = 0;

  for (let year = target.yearFrom; year <= target.yearTo; year += 1) {
    const searchUrl = buildIaaiSearchUrl(target, year);
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
    const bootstrap = await waitForIaaiBootstrap(page);
    if (bootstrap.failure === "access-denied") {
      throw new Error(`IAAI search access denied for ${target.key} ${year}`);
    }
    if (bootstrap.failure === "blocked") {
      throw new Error(`IAAI search request blocked for ${target.key} ${year}`);
    }
    if (bootstrap.noResults) {
      continue;
    }

    let snapshot: IaaiSearchSnapshot | null = null;
    try {
      const firstPageHtml = await fetchIaaiSearchPageHtmlFromInternalApi(page, 1);
      snapshot = await readIaaiSearchSnapshotFromHtml(page, firstPageHtml, 1);
    } catch {
      snapshot = null;
    }

    if (!snapshot || (!snapshot.failure && !snapshot.noResults && snapshot.candidates.length === 0)) {
      const fallbackHtml = await page.content().catch(() => "");
      if (fallbackHtml) {
        snapshot = await readIaaiSearchSnapshotFromHtml(page, fallbackHtml, 1);
      }
    }

    if (!snapshot) {
      throw new Error(`IAAI search bootstrap produced no usable page data for ${target.key} ${year}`);
    }
    if (snapshot.failure === "access-denied") {
      throw new Error(`IAAI search access denied for ${target.key} ${year}`);
    }
    if (snapshot.failure === "blocked") {
      throw new Error(`IAAI search request blocked for ${target.key} ${year}`);
    }
    if (snapshot.noResults) {
      continue;
    }
    if (snapshot.candidates.length === 0) {
      throw new Error(`IAAI search returned no parsable listings for ${target.key} ${year} (${snapshot.title}: ${snapshot.bodyPreview})`);
    }

    const finalPage = Math.min(Math.max(snapshot.totalPages, 1), 10);
    for (let pageNumber = 1; pageNumber <= finalPage; pageNumber += 1) {
      if (pageNumber > 1) {
        const html = await fetchIaaiSearchPageHtmlFromInternalApi(page, pageNumber);
        snapshot = await readIaaiSearchSnapshotFromHtml(page, html, pageNumber);
        if (snapshot.failure === "access-denied") {
          throw new Error(`IAAI search access denied for ${target.key} ${year} page ${pageNumber}`);
        }
        if (snapshot.failure === "blocked") {
          throw new Error(`IAAI search request blocked for ${target.key} ${year} page ${pageNumber}`);
        }
        if (snapshot.noResults || snapshot.candidates.length === 0) {
          break;
        }
      }

      pagesFetched += 1;
      const candidates = snapshot.candidates;
      candidatesScanned += candidates.length;
      let newOnPage = 0;
      for (const candidate of candidates) {
        if (seenUrls.has(candidate.url)) {
          continue;
        }
        seenUrls.add(candidate.url);
        newOnPage += 1;
        const record = buildRecord("iaai", year, candidate, nowIso, target);
        if (!record) {
          continue;
        }
        records.push({ record, imageCandidates: candidate.imageCandidates });
      }
      if (pageNumber >= snapshot.totalPages || newOnPage === 0) {
        break;
      }
    }
  }

  return { records, pagesFetched, candidatesScanned };
}

async function launchAuctionContext(headless: boolean, profileKey: SourceKey): Promise<BrowserContext> {
  const profileDir = path.join(os.homedir(), ".cache", "lnh-auction-collector", `playwright-profile-${profileKey}`);
  await mkdir(profileDir, { recursive: true });
  return await chromium.launchPersistentContext(profileDir, {
    headless,
    viewport: headless ? { width: 1600, height: 1100 } : null,
    ignoreHTTPSErrors: true,
    args: ["--disable-blink-features=AutomationControlled"],
  });
}

async function dismissBanners(page: Page): Promise<void> {
  const labels = ["Accept All Cookies", "Accept", "Reject All", "Continue"];
  for (const label of labels) {
    const button = page.getByRole("button", { name: label }).first();
    if (await button.isVisible().catch(() => false)) {
      await button.click().catch(() => {});
      await page.waitForTimeout(300);
    }
  }
}

async function detectPageState(page: Page, siteKey: SourceKey): Promise<{ status: "ready" | "captcha" | "unknown"; detailCount: number; bodyPreview: string; title: string }> {
  await dismissBanners(page);
  const state = await page.evaluate(({ siteKey }) => {
    const bodyText = (document.body?.innerText || "").replace(/\s+/g, " ").trim();
    const lower = bodyText.toLowerCase();
    const hasHcaptchaFrame = !!document.querySelector('iframe[src*="hcaptcha"], .h-captcha');
    const hasHcaptchaText =
      lower.includes("confirm you're not a robot") ||
      lower.includes("drag the slider") ||
      lower.includes("i am human");
    const hasIncapsulaFrame = !!document.querySelector('iframe[src*="_Incapsula_Resource"]');
    const hasIncapsulaText =
      lower.includes("request unsuccessful") ||
      lower.includes("incapsula incident id") ||
      lower.includes("sorry, you have been blocked");
    const detailCount =
      siteKey === "copart"
        ? document.querySelectorAll('a[href*="/lot/"]').length
        : document.querySelectorAll('a[href*="/VehicleDetail/"]').length;
    return {
      title: document.title,
      bodyPreview: bodyText.slice(0, 500),
      hasCaptcha: hasHcaptchaFrame || hasHcaptchaText || hasIncapsulaFrame || hasIncapsulaText,
      detailCount,
      bodyLength: bodyText.length,
    };
  }, { siteKey });
  if (state.detailCount > 0 && state.bodyLength > 200) {
    return { status: "ready", detailCount: state.detailCount, bodyPreview: state.bodyPreview, title: state.title };
  }
  if (state.hasCaptcha) {
    return { status: "captcha", detailCount: state.detailCount, bodyPreview: state.bodyPreview, title: state.title };
  }
  return { status: "unknown", detailCount: state.detailCount, bodyPreview: state.bodyPreview, title: state.title };
}

async function waitForReadyOrCaptcha(page: Page, siteKey: SourceKey, timeoutMs = 12000): Promise<{ status: "ready" | "captcha" | "unknown"; detailCount: number; bodyPreview: string; title: string }> {
  const started = Date.now();
  let lastState = await detectPageState(page, siteKey);
  let captchaStreak = 0;
  while (Date.now() - started < timeoutMs) {
    const state = await detectPageState(page, siteKey);
    lastState = state;
    if (state.status === "ready") {
      return state;
    }
    if (state.status === "captcha") {
      captchaStreak += 1;
      if (captchaStreak >= 3 && Date.now() - started >= 4000) {
        return state;
      }
    } else {
      captchaStreak = 0;
    }
    await page.waitForTimeout(1000);
  }
  return lastState;
}

async function fetchCopartApiPage(page: Page, vinPrefix: string, pageIndex: number, pageSize: number): Promise<any> {
  return await page.evaluate(async ({ vinPrefix, pageIndex, pageSize }) => {
    const payload = {
      query: [vinPrefix],
      filter: {},
      sort: ["salelight_priority asc", "member_damage_group_priority asc", "auction_date_type desc", "auction_date_utc asc"],
      page: pageIndex,
      size: pageSize,
      start: pageIndex * pageSize,
      watchListOnly: false,
      freeFormSearch: true,
      hideImages: false,
      defaultSort: false,
      specificRowProvided: false,
      displayName: "",
      searchName: "",
      backUrl: "",
      includeTagByField: {},
      rawParams: {},
    };
    const response = await fetch("/public/lots/search-results", {
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": "application/json",
        "x-requested-with": "XMLHttpRequest",
      },
      body: JSON.stringify(payload),
    });
    return await response.json();
  }, { vinPrefix, pageIndex, pageSize });
}

function collectImageUrlsFromValue(value: unknown, results: Set<string>, baseOrigin: string, keyHint = ""): void {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!isLikelyImageCandidate(trimmed, keyHint)) {
      return;
    }
    try {
      const absolute = new URL(trimmed, baseOrigin).toString();
      results.add(absolute);
    } catch {
      // ignore
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectImageUrlsFromValue(item, results, baseOrigin, keyHint);
    }
    return;
  }
  if (!value || typeof value !== "object") {
    return;
  }
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    const nextKeyHint = keyHint ? `${keyHint}.${key}` : key;
    collectImageUrlsFromValue(nested, results, baseOrigin, nextKeyHint);
  }
}

function collectCopartListImageCandidates(item: any): string[] {
  const candidates = new Set<string>();
  collectImageUrlsFromValue(item, candidates, "https://www.copart.com");
  const promoted = new Set<string>();
  for (const candidate of candidates) {
    promoted.add(candidate);
    for (const variant of buildCopartImageVariants(candidate)) {
      promoted.add(variant);
    }
  }
  return [...promoted];
}

function buildCopartApiAuctionRaw(item: any): string {
  if (item?.ad) {
    const zone = getLuxonZone(item.tz);
    const when = DateTime.fromMillis(item.ad, { zone });
    if (when.isValid) {
      return `${when.toFormat("ccc LLL dd, h:mma")} ${item.tz || ""}`.trim();
    }
  }
  const bid = item?.dynamicLotDetails?.currentBid;
  if (typeof bid === "number" && bid > 0) {
    return `current bid $${bid}`;
  }
  if (item?.dynamicLotDetails?.lotSold) {
    return "sold";
  }
  return "upcoming lot";
}

function buildCopartApiAuctionDate(item: any): { value: string; raw: string } {
  if (item?.ad) {
    const zone = getLuxonZone(item.tz);
    const when = DateTime.fromMillis(item.ad, { zone });
    if (when.isValid) {
      return {
        value: when.toISO({ suppressMilliseconds: true, includeOffset: true }) || "",
        raw: buildCopartApiAuctionRaw(item),
      };
    }
  }
  return {
    value: "future",
    raw: buildCopartApiAuctionRaw(item),
  };
}

function buildCopartApiRecord(item: any, target: VinTarget, nowIso: string): ScrapedRecordWithImages | null {
  const text = normalizeWhitespace(
    [
      item.ld,
      item.fv && `VIN:${item.fv}`,
      item.lotNumberStr && `Lot number:${item.lotNumberStr}`,
      item.yn && `Location: ${item.yn}`,
      item.dd && `Primary damage: ${item.dd}`,
      item.sdd && `Secondary damage: ${item.sdd}`,
      item.dynamicLotDetails?.currentBid > 0 ? `Current bid: $${item.dynamicLotDetails.currentBid}` : "",
      buildCopartApiAuctionRaw(item),
      item.lcd,
      item.ess,
    ]
      .filter(Boolean)
      .join(" "),
  );

  if (!matchesVehicleIdentity(text, item.ldu || item.ld || "", target)) {
    return null;
  }
  const vin = normalizeVinPattern(String(item.fv || ""));
  const matchedCode = matchVehicleVinCode(vin, target);
  if (!matchedCode) {
    return null;
  }
  if (Number(item.lcy) < target.yearFrom || Number(item.lcy) > target.yearTo) {
    return null;
  }
  const status: ScrapedLotRecord["status"] = item?.dynamicLotDetails?.lotSold ? "done" : "upcoming";
  const dateInfo = buildCopartApiAuctionDate(item);
  const record: ScrapedLotRecord = {
    sourceKey: "copart",
    sourceLabel: "Copart",
    targetKey: target.key,
    yearPage: Number(item.lcy) || null,
    carType: target.carType,
    marker: target.marker,
    vinPattern: matchedCode,
    modelYear: Number(item.lcy) || null,
    vin,
    lotNumber: String(item.lotNumberStr || ""),
    sourceDetailId: null,
    status,
    auctionDate: dateInfo.value,
    auctionDateRaw: dateInfo.raw,
    location: item.yn || item.syn || "",
    url: `https://www.copart.com/lot/${item.lotNumberStr}/${item.ldu || ""}`.replace(/\/$/, ""),
    evidence: text,
  };
  if (!record.lotNumber || !isUpcomingStatus(record, nowIso) || !isWithinSaleWindow(record, nowIso)) {
    return null;
  }
  const imageCandidates = prioritizeImageCandidates(collectCopartListImageCandidates(item), record.url);
  return { record, imageCandidates: imageCandidates.slice(0, 8) };
}

async function fetchCopartMatches(page: Page, target: VinTarget, nowIso: string): Promise<ScrapedRecordWithImages[]> {
  const records: ScrapedRecordWithImages[] = [];
  const seenLots = new Set<string>();
  const entryLimit = 8;
  for (let pageIndex = 0; pageIndex < 8; pageIndex += 1) {
    if (pageIndex > 0) {
      await delayWithJitter(COPART_API_PAGE_DELAY_MS, COPART_DELAY_JITTER_MS);
    }
    const response = await fetchCopartApiPage(page, target.vinPrefix, pageIndex, 100);
    const content = response?.data?.results?.content || [];
    if (!content.length) {
      break;
    }
    let acceptedOnPage = 0;
    for (const item of content) {
      if (seenLots.has(String(item.lotNumberStr || ""))) {
        continue;
      }
      seenLots.add(String(item.lotNumberStr || ""));
      const record = buildCopartApiRecord(item, target, nowIso);
      if (record) {
        records.push(record);
        acceptedOnPage += 1;
      }
    }
    if (acceptedOnPage === 0) {
      break;
    }
    if (records.length >= entryLimit * 20) {
      break;
    }
  }
  return records;
}

function absolutizeUrl(rawUrl: string, baseUrl: string): string | null {
  try {
    return new URL(rawUrl, baseUrl).toString();
  } catch {
    return null;
  }
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

function sha256Hex(bytes: Uint8Array): string {
  const hash = createHash("sha256");
  hash.update(bytes);
  return hash.digest("hex");
}

function readUInt16BE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function readUInt16LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUInt24LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function readUInt32BE(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] * 0x1000000) +
    (bytes[offset + 1] << 16) +
    (bytes[offset + 2] << 8) +
    bytes[offset + 3]
  );
}

function extractPngDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (
    bytes.length < 24 ||
    bytes[0] !== 0x89 ||
    bytes[1] !== 0x50 ||
    bytes[2] !== 0x4e ||
    bytes[3] !== 0x47 ||
    bytes[4] !== 0x0d ||
    bytes[5] !== 0x0a ||
    bytes[6] !== 0x1a ||
    bytes[7] !== 0x0a
  ) {
    return null;
  }
  return {
    width: readUInt32BE(bytes, 16),
    height: readUInt32BE(bytes, 20),
  };
}

function extractGifDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 10) {
    return null;
  }
  const signature = String.fromCharCode(...bytes.slice(0, 6));
  if (signature !== "GIF87a" && signature !== "GIF89a") {
    return null;
  }
  return {
    width: readUInt16LE(bytes, 6),
    height: readUInt16LE(bytes, 8),
  };
}

function extractJpegDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return null;
  }
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    let markerOffset = offset + 1;
    while (markerOffset < bytes.length && bytes[markerOffset] === 0xff) {
      markerOffset += 1;
    }
    if (markerOffset >= bytes.length) {
      return null;
    }
    const marker = bytes[markerOffset];
    offset = markerOffset + 1;
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      continue;
    }
    if (offset + 1 >= bytes.length) {
      return null;
    }
    const segmentLength = readUInt16BE(bytes, offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) {
      return null;
    }
    if (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    ) {
      return {
        height: readUInt16BE(bytes, offset + 3),
        width: readUInt16BE(bytes, offset + 5),
      };
    }
    offset += segmentLength;
  }
  return null;
}

function extractWebpDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (
    bytes.length < 30 ||
    String.fromCharCode(...bytes.slice(0, 4)) !== "RIFF" ||
    String.fromCharCode(...bytes.slice(8, 12)) !== "WEBP"
  ) {
    return null;
  }
  const chunkType = String.fromCharCode(...bytes.slice(12, 16));
  if (chunkType === "VP8X" && bytes.length >= 30) {
    return {
      width: readUInt24LE(bytes, 24) + 1,
      height: readUInt24LE(bytes, 27) + 1,
    };
  }
  if (chunkType === "VP8L" && bytes.length >= 25 && bytes[20] === 0x2f) {
    const b0 = bytes[21];
    const b1 = bytes[22];
    const b2 = bytes[23];
    const b3 = bytes[24];
    return {
      width: 1 + (b0 | ((b1 & 0x3f) << 8)),
      height: 1 + (((b1 & 0xc0) >> 6) | (b2 << 2) | ((b3 & 0x0f) << 10)),
    };
  }
  if (chunkType === "VP8 " && bytes.length >= 30) {
    if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) {
      return null;
    }
    return {
      width: readUInt16LE(bytes, 26) & 0x3fff,
      height: readUInt16LE(bytes, 28) & 0x3fff,
    };
  }
  return null;
}

function extractImageDimensions(bytes: Uint8Array): { width: number | null; height: number | null } {
  for (const extractor of [extractPngDimensions, extractGifDimensions, extractJpegDimensions, extractWebpDimensions]) {
    const dimensions = extractor(bytes);
    if (dimensions && dimensions.width > 0 && dimensions.height > 0) {
      return dimensions;
    }
  }
  return { width: null, height: null };
}

function normalizeMimeType(contentType: string | null | undefined): string {
  return String(contentType || "application/octet-stream").split(";")[0].trim().toLowerCase();
}

function hasKnownImageDimensions(width: number | null, height: number | null): boolean {
  return Number.isFinite(width) && Number.isFinite(height) && Number(width) > 0 && Number(height) > 0;
}

function isHdImage(width: number | null, height: number | null): boolean {
  if (!hasKnownImageDimensions(width, height)) {
    return false;
  }
  const safeWidth = Number(width);
  const safeHeight = Number(height);
  const longEdge = Math.max(safeWidth, safeHeight);
  const shortEdge = Math.min(safeWidth, safeHeight);
  return longEdge >= MIN_HD_LONG_EDGE && shortEdge >= MIN_HD_SHORT_EDGE;
}

function scoreFetchedImage(payload: { sourceUrl: string; width: number | null; height: number | null; byteSize: number }): number {
  let score = scoreImageCandidate(payload.sourceUrl);
  if (hasKnownImageDimensions(payload.width, payload.height)) {
    const width = Number(payload.width);
    const height = Number(payload.height);
    const areaScore = Math.min(24, Math.round((width * height) / 250_000));
    score += areaScore;
    if (isHdImage(width, height)) {
      score += 20;
    } else {
      score -= 20;
    }
  }
  if (payload.byteSize >= 800_000) {
    score += 8;
  } else if (payload.byteSize >= 300_000) {
    score += 4;
  } else if (payload.byteSize < 120_000) {
    score -= 8;
  }
  return score;
}

function extractImageCandidatesFromHtml(html: string, baseUrl: string): string[] {
  const results = new Set<string>();
  const patterns = [
    /https?:\/\/[^"' )]+?\.(?:jpg|jpeg|png|webp|avif|gif)(?:\?[^"' )]+)?/gi,
    /(?:src|data-src|data-zoom-image|data-fullimage|data-lazy)=["']([^"']+)["']/gi,
  ];
  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      const rawCandidate = match[1] || match[0];
      if (!isLikelyImageCandidate(rawCandidate, "html.image")) {
        continue;
      }
      const candidate = absolutizeUrl(rawCandidate, baseUrl);
      if (candidate) {
        results.add(candidate);
      }
    }
  }
  return [...results];
}

function buildCopartImageVariants(rawUrl: string): string[] {
  const variants = new Set<string>();
  try {
    const parsed = new URL(rawUrl);
    if (!/copart\.com$/i.test(parsed.hostname) && !/cs\.copart\.com$/i.test(parsed.hostname)) {
      return [];
    }
    const match = parsed.pathname.match(/(\/v1\/AUTH_[^/]+\/)(ids-c-prod-)?lpp(\/.+)_(thb|ful|hrs)(\.(?:jpe?g|png|webp))$/i);
    if (!match) {
      return [];
    }
    const [, prefix, , middlePath, , extension] = match;
    for (const nextSize of ["hrs", "ful", "thb"]) {
      for (const nextPrefix of ["ids-c-prod-", ""]) {
        const next = new URL(parsed.toString());
        next.pathname = `${prefix}${nextPrefix}lpp${middlePath}_${nextSize}${extension}`;
        variants.add(next.toString());
      }
    }
  } catch {
    return [];
  }
  return [...variants];
}

function buildIaaiImageVariants(rawUrl: string): string[] {
  const variants = new Set<string>();
  try {
    const parsed = new URL(rawUrl);
    if (!/vis\.iaai\.com$/i.test(parsed.hostname) || !/\/resizer$/i.test(parsed.pathname)) {
      return [];
    }
    const imageKeys = parsed.searchParams.get("imageKeys");
    if (!imageKeys) {
      return [];
    }
    const baseKeys = imageKeys.replace(/~RW\d+~H\d+~TH\d+/gi, "");

    const original = new URL(parsed.toString());
    original.searchParams.delete("width");
    original.searchParams.delete("height");
    original.searchParams.delete("w");
    original.searchParams.delete("h");
    variants.add(original.toString());

    const explicitLarge = new URL(original.toString());
    explicitLarge.searchParams.set("width", "2576");
    explicitLarge.searchParams.set("height", "1932");
    variants.add(explicitLarge.toString());

    const keySized = new URL(original.toString());
    keySized.searchParams.set("imageKeys", `${baseKeys}~RW2576~H1932~TH0`);
    variants.add(keySized.toString());
  } catch {
    return [];
  }
  return [...variants];
}

function stripCloudflareImageResize(url: string): string | null {
  const match = url.match(/\/cdn-cgi\/image\/[^/]+\/(https?:\/\/.+)$/i);
  return match ? match[1] : null;
}

function stripResizeSearchParams(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl);
    let changed = false;
    for (const key of ["width", "height", "w", "h", "quality", "q", "fit", "format", "dpr", "auto"]) {
      if (parsed.searchParams.has(key)) {
        parsed.searchParams.delete(key);
        changed = true;
      }
    }
    return changed ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function buildImageCandidateVariants(rawUrl: string, baseUrl: string): string[] {
  if (!isLikelyImageCandidate(rawUrl, "variant.seed")) {
    return [];
  }
  const absolute = absolutizeUrl(rawUrl, baseUrl);
  if (!absolute) {
    return [];
  }
  const variants = new Set<string>();
  const queue = [absolute];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || variants.has(current)) {
      continue;
    }
    variants.add(current);

    const cloudflareOriginal = stripCloudflareImageResize(current);
    if (cloudflareOriginal && !variants.has(cloudflareOriginal)) {
      queue.push(cloudflareOriginal);
    }

    const queryCleaned = stripResizeSearchParams(current);
    if (queryCleaned && !variants.has(queryCleaned)) {
      queue.push(queryCleaned);
    }

    for (const copartVariant of buildCopartImageVariants(current)) {
      if (!variants.has(copartVariant)) {
        queue.push(copartVariant);
      }
    }

    for (const iaaiVariant of buildIaaiImageVariants(current)) {
      if (!variants.has(iaaiVariant)) {
        queue.push(iaaiVariant);
      }
    }
  }
  return [...variants];
}

function extractLargestDimensionHint(text: string): number | null {
  const matches = [...text.matchAll(/(\d{2,4})x(\d{2,4})/gi)];
  if (matches.length === 0) {
    return null;
  }
  return matches.reduce((largest, match) => {
    const width = Number(match[1]);
    const height = Number(match[2]);
    return Math.max(largest, width, height);
  }, 0);
}

function scoreImageCandidate(imageUrl: string): number {
  let score = 0;
  const normalized = imageUrl.toLowerCase();

  if (/(^|[/?._-])(full|zoom|large|orig|original|hero|max|hires|hd)([/?._-]|$)/i.test(normalized)) {
    score += 10;
  }
  if (/(^|[/?._-])(hrs|ful)([/?._-]|$)/i.test(normalized)) {
    score += 12;
  }
  if (/(^|[/?._-])(thumb|thumbnail|small|preview|icon|sprite)([/?._-]|$)/i.test(normalized)) {
    score -= 10;
  }
  if (/\/cdn-cgi\/image\//i.test(normalized)) {
    score -= 4;
  }

  const dimensionHint = extractLargestDimensionHint(normalized);
  if (dimensionHint !== null) {
    if (dimensionHint >= 1600) {
      score += 8;
    } else if (dimensionHint >= 1000) {
      score += 5;
    } else if (dimensionHint <= 400) {
      score -= 8;
    } else if (dimensionHint <= 800) {
      score -= 4;
    }
  }

  try {
    const parsed = new URL(imageUrl);
    const widthHint = Number(parsed.searchParams.get("width") || parsed.searchParams.get("w") || "");
    const heightHint = Number(parsed.searchParams.get("height") || parsed.searchParams.get("h") || "");
    const searchDimensionHint = Math.max(widthHint || 0, heightHint || 0);
    if (searchDimensionHint >= 1600) {
      score += 8;
    } else if (searchDimensionHint >= 1000) {
      score += 5;
    } else if (searchDimensionHint > 0 && searchDimensionHint <= 400) {
      score -= 8;
    } else if (searchDimensionHint > 0 && searchDimensionHint <= 800) {
      score -= 4;
    }
  } catch {
    // ignore
  }

  return score;
}

function canonicalizeImageCandidate(imageUrl: string): string {
  const withoutCloudflareResize = stripCloudflareImageResize(imageUrl) || imageUrl;
  return stripResizeSearchParams(withoutCloudflareResize) || withoutCloudflareResize;
}

function isLikelyImageCandidate(rawValue: string, keyHint = ""): boolean {
  const trimmed = String(rawValue || "").trim();
  if (!trimmed) {
    return false;
  }
  const normalized = trimmed.toLowerCase();
  const normalizedKeyHint = keyHint.toLowerCase();
  if (
    normalized.startsWith("data:") ||
    normalized.endsWith(".xml") ||
    /^(width|height|initial-scale|max(?:imum)?-scale|user-scalable|telephone=no|light dark|noindex|nofollow|ie=edge)/i.test(trimmed) ||
    /^[a-z-]+=[^/]+$/i.test(trimmed)
  ) {
    return false;
  }
  if (/\s/.test(trimmed) && !/%20/i.test(trimmed)) {
    return false;
  }
  const urlLike =
    /^https?:\/\//i.test(trimmed) ||
    trimmed.startsWith("//") ||
    trimmed.startsWith("/") ||
    trimmed.startsWith("./") ||
    trimmed.startsWith("../");
  const imagePathLike =
    /\.(?:jpe?g|png|webp|avif|gif)(?:[?#].*)?$/i.test(trimmed) ||
    /\/(image|images|img|photo|photos|media|thumbnail|thumb|resizer|hero|gallery)(?:[/?._-]|$)/i.test(trimmed) ||
    /cdn-cgi\/image/i.test(trimmed) ||
    /vis\.iaai\.com\/resizer/i.test(trimmed) ||
    /cs\.copart\.com\//i.test(trimmed);
  if (imagePathLike) {
    return true;
  }
  if (!urlLike) {
    return false;
  }
  return /(image|img|thumb|photo|hero|gallery|iconurl|full|preview)/i.test(normalizedKeyHint);
}

function prioritizeImageCandidates(imageCandidates: Iterable<string>, baseUrl: string): string[] {
  const ranked = new Map<string, { url: string; score: number; order: number }>();
  let order = 0;
  for (const rawCandidate of imageCandidates) {
    for (const variant of buildImageCandidateVariants(rawCandidate, baseUrl)) {
      if (/sprite|logo|icon|avatar/i.test(variant)) {
        continue;
      }
      const key = canonicalizeImageCandidate(variant);
      const next = { url: variant, score: scoreImageCandidate(variant), order };
      const existing = ranked.get(key);
      if (!existing || next.score > existing.score || (next.score === existing.score && next.order < existing.order)) {
        ranked.set(key, next);
      }
    }
    order += 1;
  }
  return [...ranked.values()]
    .sort((left, right) => right.score - left.score || left.order - right.order || left.url.localeCompare(right.url))
    .map((entry) => entry.url);
}

async function collectPageImageCandidates(page: Page): Promise<string[]> {
  return await page.evaluate(() => {
    const isLikelyImageCandidate = (rawValue: string) => {
      const trimmed = String(rawValue || "").trim();
      if (!trimmed) {
        return false;
      }
      const normalized = trimmed.toLowerCase();
      if (
        normalized.startsWith("data:") ||
        /^(width|height|initial-scale|max(?:imum)?-scale|user-scalable|telephone=no|light dark|noindex|nofollow|ie=edge)/i.test(trimmed) ||
        /^[a-z-]+=[^/]+$/i.test(trimmed)
      ) {
        return false;
      }
      if (/\s/.test(trimmed) && !/%20/i.test(trimmed)) {
        return false;
      }
      return (
        /\.(?:jpe?g|png|webp|avif|gif)(?:[?#].*)?$/i.test(trimmed) ||
        /\/(image|images|img|photo|photos|media|thumbnail|thumb|resizer|hero|gallery)(?:[/?._-]|$)/i.test(trimmed) ||
        /cdn-cgi\/image/i.test(trimmed) ||
        /vis\.iaai\.com\/resizer/i.test(trimmed) ||
        /cs\.copart\.com\//i.test(trimmed)
      );
    };
    const attrs = ["src", "srcset", "data-src", "data-lazy", "data-zoom-image", "data-fullimage", "data-original"];
    const urls = new Set<string>();
    for (const element of Array.from(document.querySelectorAll("img, source, a, meta"))) {
      for (const attr of attrs) {
        const value = element.getAttribute(attr);
        if (value) {
          for (const candidate of value.split(",")) {
            const normalized = candidate.trim().split(/\s+/)[0];
            if (normalized && isLikelyImageCandidate(normalized)) {
              urls.add(normalized);
            }
          }
        }
      }
      if (element instanceof HTMLMetaElement && element.content && isLikelyImageCandidate(element.content)) {
        urls.add(element.content);
      }
      if (element instanceof HTMLAnchorElement && element.href && /\.(?:jpe?g|png|webp|avif|gif)(?:[?#].*)?$/i.test(element.href)) {
        urls.add(element.href);
      }
    }
    return [...urls];
  });
}

async function enrichRecordImages(page: Page, item: ScrapedRecordWithImages): Promise<ScrapedRecordWithImages> {
  const rankedSeedCandidates = prioritizeImageCandidates(item.imageCandidates, item.record.url);
  if (rankedSeedCandidates.length > 0 && scoreImageCandidate(rankedSeedCandidates[0]) >= 6) {
    return {
      ...item,
      imageCandidates: rankedSeedCandidates.slice(0, 8),
    };
  }
  await page.goto(item.record.url, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
  await dismissBanners(page);
  await page.waitForTimeout(1500);
  const html = await page.content().catch(() => "");
  const domUrls = await collectPageImageCandidates(page);
  const prioritizedCandidates = prioritizeImageCandidates(
    [...rankedSeedCandidates, ...domUrls, ...extractImageCandidatesFromHtml(html, item.record.url)],
    item.record.url,
  );
  return {
    ...item,
    imageCandidates: prioritizedCandidates.slice(0, 8),
  };
}

async function fetchImagePayload(
  page: Page,
  imageUrl: string,
): Promise<{ sourceUrl: string; mimeType: string; sha256: string; width: number | null; height: number | null; byteSize: number; dataBase64: string } | null> {
  try {
    const cookies = await page.context().cookies(imageUrl);
    const cookieHeader = cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
    const response = await fetch(imageUrl, {
      headers: {
        "user-agent": DEFAULT_HTTP_USER_AGENT,
        accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        referer: page.url() || "https://www.copart.com/",
        ...(cookieHeader ? { cookie: cookieHeader } : {}),
      },
    });
    if (!response.ok) {
      return null;
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length === 0) {
      return null;
    }
    const mimeType = normalizeMimeType(response.headers.get("content-type"));
    const { width, height } = extractImageDimensions(bytes);
    return {
      sourceUrl: imageUrl,
      mimeType,
      sha256: sha256Hex(bytes),
      width,
      height,
      byteSize: bytes.length,
      dataBase64: Buffer.from(bytes).toString("base64"),
    };
  } catch {
    return null;
  }
}

async function fetchLotImageSyncState(
  baseUrl: string,
  token: string,
  sourceKey: SourceKey,
  lotNumber: string,
): Promise<LotImageSyncState | null> {
  try {
    const query = new URLSearchParams({ sourceKey, lotNumber });
    const response = await fetch(`${baseUrl}/api/ingest/image-state?${query.toString()}`, {
      headers: {
        authorization: `Bearer ${token}`,
        "cache-control": "no-store",
      },
    });
    if (!response.ok) {
      return null;
    }
    const payload = await response.json() as LotImageSyncState | null;
    if (!payload?.imageId || !payload?.sourceUrl || !payload?.sha256) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function selectBestImagePayload(
  payloads: Array<{ sourceUrl: string; mimeType: string; sha256: string; width: number | null; height: number | null; byteSize: number; dataBase64: string }>,
): { sourceUrl: string; mimeType: string; sha256: string; width: number | null; height: number | null; byteSize: number; dataBase64: string } | null {
  const acceptable = payloads.filter((payload) => isHdImage(payload.width, payload.height) || !hasKnownImageDimensions(payload.width, payload.height));
  if (acceptable.length === 0) {
    return null;
  }
  return [...acceptable].sort((left, right) => (
    scoreFetchedImage(right) - scoreFetchedImage(left) ||
    right.byteSize - left.byteSize ||
    right.sourceUrl.localeCompare(left.sourceUrl)
  ))[0] || null;
}

async function uploadImageForItem(baseUrl: string, token: string, runId: string, page: Page, item: ScrapedRecordWithImages): Promise<void> {
  const enriched = await enrichRecordImages(page, item);
  if (enriched.imageCandidates.length === 0) {
    console.warn(`No image candidates for ${item.record.sourceKey} lot ${item.record.lotNumber} ${item.record.url}`);
    return;
  }

  const currentImage = await fetchLotImageSyncState(baseUrl, token, item.record.sourceKey, item.record.lotNumber);
  const topCandidate = enriched.imageCandidates[0];
  if (currentImage && currentImage.sourceUrl === topCandidate && isHdImage(currentImage.width, currentImage.height)) {
    return;
  }

  const fetchedPayloads: Array<{
    sourceUrl: string;
    mimeType: string;
    sha256: string;
    width: number | null;
    height: number | null;
    byteSize: number;
    dataBase64: string;
  }> = [];

  for (const imageUrl of enriched.imageCandidates.slice(0, MAX_IMAGE_FETCH_ATTEMPTS)) {
    const payload = await fetchImagePayload(page, imageUrl);
    if (!payload) {
      console.warn(`Image fetch failed for lot ${item.record.lotNumber}: ${imageUrl}`);
      continue;
    }
    fetchedPayloads.push(payload);
  }

  const selectedPayload = selectBestImagePayload(fetchedPayloads);
  if (!selectedPayload) {
    const bestMeasured = [...fetchedPayloads]
      .sort((left, right) => scoreFetchedImage(right) - scoreFetchedImage(left) || right.byteSize - left.byteSize)[0];
    if (bestMeasured && hasKnownImageDimensions(bestMeasured.width, bestMeasured.height)) {
      console.warn(
        `Skipping non-HD image for lot ${item.record.lotNumber}: ${bestMeasured.width}x${bestMeasured.height} ${bestMeasured.sourceUrl}`,
      );
    } else {
      console.warn(`No acceptable image payloads for lot ${item.record.lotNumber}`);
    }
    return;
  }

  if (currentImage && currentImage.sha256 === selectedPayload.sha256) {
    return;
  }

  await fetch(`${baseUrl}/api/ingest/image`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      runId,
      sourceKey: item.record.sourceKey,
      lotNumber: item.record.lotNumber,
      sourceUrl: selectedPayload.sourceUrl,
      mimeType: selectedPayload.mimeType,
      width: selectedPayload.width,
      height: selectedPayload.height,
      sortOrder: 0,
      dataBase64: selectedPayload.dataBase64,
    }),
  }).catch(() => {});
}

async function uploadImages(baseUrl: string, token: string, runId: string, context: BrowserContext, items: ScrapedRecordWithImages[]): Promise<void> {
  if (items.length === 0) {
    return;
  }
  const workerCount = Math.min(IMAGE_UPLOAD_CONCURRENCY, items.length);
  const pages = await Promise.all(Array.from({ length: workerCount }, async () => await context.newPage()));
  let nextIndex = 0;
  try {
    await Promise.all(
      pages.map(async (page) => {
        while (nextIndex < items.length) {
          const item = items[nextIndex];
          nextIndex += 1;
          if (!item) {
            break;
          }
          await uploadImageForItem(baseUrl, token, runId, page, item);
        }
      }),
    );
  } finally {
    await Promise.all(pages.map(async (page) => await page.close().catch(() => {})));
  }
}

async function verifyRunnerFreshness(baseUrl: string): Promise<void> {
  const manifest = await fetchRemoteManifest(baseUrl);
  if (compareVersionStrings(RUNNER_VERSION, manifest.minimumSupportedVersion) < 0 || RUNNER_VERSION !== manifest.version) {
    throw new Error(
      `Collector ${RUNNER_VERSION} is stale. Remote collector is ${manifest.version}. Re-run the bootstrap/update step before scraping.`,
    );
  }
}

async function scrapeCopartTargets(page: Page, targets: VinTarget[], nowIso: string, scopes: CoveredScope[]): Promise<ScrapedRecordWithImages[]> {
  const records: ScrapedRecordWithImages[] = [];
  const copartTargets = targets.filter((item) => item.enabledCopart && item.active);
  for (const [index, target] of copartTargets.entries()) {
    const scope: CoveredScope = { sourceKey: "copart", targetKey: target.key, status: "failed" };
    scopes.push(scope);
    if (index > 0) {
      await delayWithJitter(COPART_TARGET_DELAY_MS, COPART_DELAY_JITTER_MS);
    }
    const searchUrl = `https://www.copart.com/vehicle-search-year/tesla/${target.copartSlug}/${target.yearFrom}`;
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
    const state = await waitForReadyOrCaptcha(page, "copart");
    if (state.status === "captcha") {
      scope.status = "failed";
      scope.notes = `captcha at ${searchUrl}`;
      console.warn(`Copart captcha for ${target.key} at ${searchUrl}`);
      continue;
    }
    if (state.status !== "ready") {
      scope.status = "partial";
      scope.notes = `unexpected state ${state.status}`;
      continue;
    }
    await delayWithJitter(COPART_READY_SETTLE_MS, COPART_DELAY_JITTER_MS);
    const targetRecords = await fetchCopartMatches(page, target, nowIso);
    records.push(...targetRecords);
    scope.status = "complete";
    scope.notes = `${targetRecords.length} records`;
  }
  return records;
}

async function scrapeIaaiTargets(page: Page, targets: VinTarget[], nowIso: string, scopes: CoveredScope[]): Promise<ScrapedRecordWithImages[]> {
  const records: ScrapedRecordWithImages[] = [];
  for (const target of targets.filter((item) => item.enabledIaai && item.active)) {
    const scope: CoveredScope = { sourceKey: "iaai", targetKey: target.key, status: "failed" };
    scopes.push(scope);
    try {
      const result = await fetchIaaiDirectMatches(page, target, nowIso);
      records.push(...result.records);
      scope.status = "complete";
      scope.notes = `${result.records.length} records across ${result.pagesFetched} pages`;
    } catch (error) {
      scope.status = "failed";
      scope.notes = normalizeWhitespace(error instanceof Error ? error.message : String(error));
      console.warn(`IAAI fetch failed for ${target.key}: ${scope.notes}`);
    }
  }
  return records;
}

async function postIngest(baseUrl: string, token: string, scopes: CoveredScope[], records: ScrapedRecordWithImages[], args: RunnerArgs, startedAt: string, completedAt: string): Promise<{ runId: string }> {
  const response = await fetch(`${baseUrl}/api/ingest`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      run: {
        runnerId: `${args.machineName}-${process.pid}`,
        runnerVersion: RUNNER_VERSION,
        machineName: args.machineName,
        startedAt,
        completedAt,
        sourceKeys: args.siteKeys,
        scopes,
      },
      records: records.map((item) => item.record),
    }),
  });
  if (!response.ok) {
    throw new Error(`Ingest failed with HTTP ${response.status}`);
  }
  return await response.json() as { runId: string };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const ingestToken = process.env.AUCTION_INGEST_TOKEN;
  if (!ingestToken) {
    throw new Error("Set AUCTION_INGEST_TOKEN before running the scraper.");
  }

  await verifyRunnerFreshness(args.updateBaseUrl);
  const config = await fetchScrapeConfig(args.baseUrl, ingestToken);
  const activeTargets = config.targets.filter((target) => target.active);
  console.log(`Loaded ${activeTargets.length} VIN targets from ${args.baseUrl} (config ${config.configVersion}).`);

  const startedAt = new Date().toISOString();
  const nowIso = startedAt;
  const scopes: CoveredScope[] = [];
  const allRecords: ScrapedRecordWithImages[] = [];

  const sourceContexts: Partial<Record<SourceKey, BrowserContext>> = {};
  try {
    if (args.siteKeys.includes("copart")) {
      sourceContexts.copart = await launchAuctionContext(args.headless, "copart");
    }
    if (args.siteKeys.includes("iaai")) {
      sourceContexts.iaai = await launchAuctionContext(args.headless, "iaai");
    }
    const listPhaseTasks: Array<Promise<ScrapedRecordWithImages[]>> = [];
    if (sourceContexts.copart) {
      const page = sourceContexts.copart.pages()[0] || await sourceContexts.copart.newPage();
      listPhaseTasks.push(scrapeCopartTargets(page, activeTargets, nowIso, scopes));
    }
    if (sourceContexts.iaai) {
      const iaaiPage = sourceContexts.iaai.pages()[0] || await sourceContexts.iaai.newPage();
      listPhaseTasks.push(scrapeIaaiTargets(iaaiPage, activeTargets, nowIso, scopes));
    }
    const listPhaseRecords = await Promise.all(listPhaseTasks);
    allRecords.push(...listPhaseRecords.flat());
    const dedupedRecords = Array.from(
      new Map(allRecords.map((item) => [`${item.record.sourceKey}|${item.record.lotNumber}`, item])).values(),
    );
    const completedAt = new Date().toISOString();
    const ingestResult = await postIngest(args.baseUrl, ingestToken, scopes, dedupedRecords, args, startedAt, completedAt);
    console.log(`Ingested ${dedupedRecords.length} records into ${args.baseUrl} run ${ingestResult.runId}.`);

    await Promise.all([
      sourceContexts.copart
        ? uploadImages(
            args.baseUrl,
            ingestToken,
            ingestResult.runId,
            sourceContexts.copart,
            dedupedRecords.filter((item) => item.record.sourceKey === "copart"),
          )
        : Promise.resolve(),
      sourceContexts.iaai
        ? uploadImages(
            args.baseUrl,
            ingestToken,
            ingestResult.runId,
            sourceContexts.iaai,
            dedupedRecords.filter((item) => item.record.sourceKey === "iaai"),
          )
        : Promise.resolve(),
    ]);
  } finally {
    for (const context of Object.values(sourceContexts)) {
      if (context) {
        await context.close().catch(() => {});
      }
    }
  }
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
