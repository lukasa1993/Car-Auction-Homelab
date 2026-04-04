import os from "node:os";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import { chromium, type BrowserContext, type Page } from "playwright";
import { DateTime } from "luxon";

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

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
    headless: argv.includes("--headless") || argv.includes("--unattended"),
    unattended: argv.includes("--unattended"),
    machineName: process.env.AUCTION_MACHINE_NAME || os.hostname(),
  };
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

function buildVinMaskRegex(mask: string, anchored = false): RegExp {
  const escaped = escapeRegex(mask).replaceAll("\\?", "[A-HJ-NPR-Z0-9]");
  const suffixLength = Math.max(0, 17 - mask.length);
  const tail = suffixLength ? `[A-HJ-NPR-Z0-9*]{0,${suffixLength}}` : "";
  const body = `${escaped}${tail}`;
  return new RegExp(anchored ? `^${body}$` : `(${body})`, "i");
}

function matchVehicleVinCode(vinOrPrefix = "", target: VinTarget): string | null {
  const normalized = String(vinOrPrefix || "").toUpperCase();
  if (!normalized) {
    return null;
  }
  return buildVinMaskRegex(target.vinPattern, true).test(normalized) ? target.vinPattern : null;
}

function extractMatchingVin(text: string, target: VinTarget): string {
  const match = text.match(buildVinMaskRegex(target.vinPattern));
  return match?.[1]?.toUpperCase() || "";
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
  const matchedCode = matchVehicleVinCode(vin, target) || target.vinPattern;
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
  const base = "https://auctiondata.iaai.com/Search?keyword=";
  return `${base}${encodeURIComponent(`${year} Tesla ${target.iaaiPath}`)}&bu=Vehicles`;
}

async function fetchIaaiSearchPageHtml(target: VinTarget, year: number, pageNumber: number): Promise<{ html: string; searchUrl: string }> {
  const searchUrl = buildIaaiSearchUrl(target, year);
  if (pageNumber === 1) {
    return { html: await fetchText(searchUrl), searchUrl };
  }
  const html = await fetchText("https://auctiondata.iaai.com/SearchPlugin/GetScrollList", {
    method: "POST",
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
    body: `{URL:'${searchUrl}',currentPage:${pageNumber}}`,
  });
  return { html, searchUrl };
}

function isIaaiEmptyResultsPage(html: string): boolean {
  return /<h2>\s*No Results Found\s*<\/h2>/i.test(html) || /id="hdnTotalvehicles" value="0"/i.test(html);
}

function extractIaaiCandidatesFromHtml(html: string): Array<{ text: string; url: string }> {
  const candidates: Array<{ text: string; url: string }> = [];
  const seen = new Set<string>();
  const pattern =
    /<h4 class="truncate"><a[^>]+href="(https:\/\/www\.iaai\.com\/VehicleDetail\/\d+~US)">([^<]+)<\/a><\/h4>([\s\S]*?)<div><a[^>]+href="\1">More Details<\/a>/gi;
  for (const match of html.matchAll(pattern)) {
    const url = decodeHtmlEntities(match[1]);
    const title = stripHtml(match[2]);
    const body = stripHtml(match[3]);
    const text = normalizeWhitespace(`${title} ${body}`);
    const key = `${url}|${text.slice(0, 300)}`;
    if (!url || !text || seen.has(key)) {
      continue;
    }
    seen.add(key);
    candidates.push({ text, url });
  }
  return candidates;
}

async function fetchIaaiDirectMatches(target: VinTarget, nowIso: string): Promise<{ records: ScrapedRecordWithImages[]; pagesFetched: number; candidatesScanned: number }> {
  const records: ScrapedRecordWithImages[] = [];
  const seenUrls = new Set<string>();
  let pagesFetched = 0;
  let candidatesScanned = 0;

  for (let year = target.yearFrom; year <= target.yearTo; year += 1) {
    for (let pageNumber = 1; pageNumber <= 10; pageNumber += 1) {
      const { html } = await fetchIaaiSearchPageHtml(target, year, pageNumber);
      pagesFetched += 1;
      if (/SearchPlugin\/NoAccess/i.test(html)) {
        throw new Error(`IAAI auctiondata access denied for ${target.key} ${year}`);
      }
      if (/Request unsuccessful|Incapsula incident id/i.test(html)) {
        throw new Error(`IAAI auctiondata request blocked for ${target.key} ${year}`);
      }
      const candidates = extractIaaiCandidatesFromHtml(html);
      candidatesScanned += candidates.length;
      if (candidates.length === 0) {
        if (pageNumber === 1 && isIaaiEmptyResultsPage(html)) {
          break;
        }
        if (pageNumber === 1) {
          throw new Error(`IAAI search returned no parsable listings for ${target.key} ${year}`);
        }
        break;
      }
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
        records.push({ record, imageCandidates: [] });
      }
      if (candidates.length < 100 || newOnPage === 0) {
        break;
      }
    }
  }

  return { records, pagesFetched, candidatesScanned };
}

async function launchAuctionContext(headless: boolean): Promise<BrowserContext> {
  const profileDir = path.join(os.homedir(), ".cache", "lnh-auction-collector", "playwright-profile");
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
    const looksLikeImage =
      /(image|img|thumb|photo|hero|gallery)/i.test(keyHint) ||
      /\.(?:jpe?g|png|webp|avif|gif)(?:[?#].*)?$/i.test(trimmed) ||
      /\/image/i.test(trimmed);
    if (!looksLikeImage) {
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
    collectImageUrlsFromValue(nested, results, baseOrigin, key);
  }
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
  const vin = String(item.fv || "").toUpperCase();
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
  const imageCandidates = new Set<string>();
  collectImageUrlsFromValue(item, imageCandidates, "https://www.copart.com");
  return { record, imageCandidates: [...imageCandidates].slice(0, 8) };
}

async function fetchCopartMatches(page: Page, target: VinTarget, nowIso: string): Promise<ScrapedRecordWithImages[]> {
  const records: ScrapedRecordWithImages[] = [];
  const seenLots = new Set<string>();
  const entryLimit = 8;
  for (let pageIndex = 0; pageIndex < 8; pageIndex += 1) {
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

function extractImageCandidatesFromHtml(html: string, baseUrl: string): string[] {
  const results = new Set<string>();
  const patterns = [
    /https?:\/\/[^"' )]+?\.(?:jpg|jpeg|png|webp|avif|gif)(?:\?[^"' )]+)?/gi,
    /(?:src|data-src|data-zoom-image|data-fullimage|data-lazy)=["']([^"']+)["']/gi,
  ];
  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      const candidate = absolutizeUrl(match[1] || match[0], baseUrl);
      if (candidate) {
        results.add(candidate);
      }
    }
  }
  return [...results];
}

async function collectPageImageCandidates(page: Page): Promise<string[]> {
  return await page.evaluate(() => {
    const attrs = ["src", "data-src", "data-lazy", "data-zoom-image", "data-fullimage", "data-original"];
    const urls = new Set<string>();
    for (const element of Array.from(document.querySelectorAll("img, source, a"))) {
      for (const attr of attrs) {
        const value = element.getAttribute(attr);
        if (value) {
          urls.add(value);
        }
      }
      if (element instanceof HTMLAnchorElement && element.href && /\.(?:jpe?g|png|webp|avif|gif)(?:[?#].*)?$/i.test(element.href)) {
        urls.add(element.href);
      }
    }
    return [...urls];
  });
}

async function enrichRecordImages(page: Page, item: ScrapedRecordWithImages): Promise<ScrapedRecordWithImages> {
  if (item.imageCandidates.length > 0) {
    return item;
  }
  await page.goto(item.record.url, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
  await dismissBanners(page);
  await page.waitForTimeout(1500);
  const html = await page.content().catch(() => "");
  const domUrls = await collectPageImageCandidates(page);
  const all = new Set<string>();
  for (const url of [...domUrls, ...extractImageCandidatesFromHtml(html, item.record.url)]) {
    const absolute = absolutizeUrl(url, item.record.url);
    if (!absolute) {
      continue;
    }
    if (/sprite|logo|icon|avatar/i.test(absolute)) {
      continue;
    }
    all.add(absolute);
  }
  return {
    ...item,
    imageCandidates: [...all].slice(0, 8),
  };
}

async function fetchImagePayload(page: Page, imageUrl: string): Promise<{ sourceUrl: string; mimeType: string; width: number | null; height: number | null; dataBase64: string } | null> {
  const payload = await page.evaluate(async (url) => {
    try {
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) {
        return null;
      }
      const mimeType = response.headers.get("content-type") || "application/octet-stream";
      const buffer = await response.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = "";
      const chunkSize = 0x8000;
      for (let index = 0; index < bytes.length; index += chunkSize) {
        binary += String.fromCharCode(...bytes.slice(index, index + chunkSize));
      }
      return {
        mimeType,
        dataBase64: btoa(binary),
      };
    } catch {
      return null;
    }
  }, imageUrl).catch(() => null) as { mimeType: string; dataBase64: string } | null;
  if (!payload?.dataBase64) {
    return null;
  }
  return {
    sourceUrl: imageUrl,
    mimeType: payload.mimeType,
    width: null,
    height: null,
    dataBase64: payload.dataBase64,
  };
}

async function uploadImages(baseUrl: string, token: string, runId: string, page: Page, items: ScrapedRecordWithImages[]): Promise<void> {
  for (const item of items) {
    const enriched = await enrichRecordImages(page, item);
    let sortOrder = 0;
    for (const imageUrl of enriched.imageCandidates.slice(0, 8)) {
      const payload = await fetchImagePayload(page, imageUrl);
      if (!payload) {
        continue;
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
          sourceUrl: payload.sourceUrl,
          mimeType: payload.mimeType,
          width: payload.width,
          height: payload.height,
          sortOrder,
          dataBase64: payload.dataBase64,
        }),
      }).catch(() => {});
      sortOrder += 1;
    }
  }
}

async function verifyRunnerFreshness(baseUrl: string): Promise<void> {
  const manifest = await fetchRemoteManifest(baseUrl);
  if (Bun.semver.order(RUNNER_VERSION, manifest.minimumSupportedVersion) < 0 || RUNNER_VERSION !== manifest.version) {
    throw new Error(
      `Collector ${RUNNER_VERSION} is stale. Remote collector is ${manifest.version}. Re-run the bootstrap/update step before scraping.`,
    );
  }
}

async function scrapeCopartTargets(page: Page, targets: VinTarget[], nowIso: string, scopes: CoveredScope[]): Promise<ScrapedRecordWithImages[]> {
  const records: ScrapedRecordWithImages[] = [];
  for (const target of targets.filter((item) => item.enabledCopart && item.active)) {
    const scope: CoveredScope = { sourceKey: "copart", targetKey: target.key, status: "failed" };
    scopes.push(scope);
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
    const targetRecords = await fetchCopartMatches(page, target, nowIso);
    records.push(...targetRecords);
    scope.status = "complete";
    scope.notes = `${targetRecords.length} records`;
  }
  return records;
}

async function scrapeIaaiTargets(targets: VinTarget[], nowIso: string, scopes: CoveredScope[]): Promise<ScrapedRecordWithImages[]> {
  const records: ScrapedRecordWithImages[] = [];
  for (const target of targets.filter((item) => item.enabledIaai && item.active)) {
    const scope: CoveredScope = { sourceKey: "iaai", targetKey: target.key, status: "failed" };
    scopes.push(scope);
    try {
      const result = await fetchIaaiDirectMatches(target, nowIso);
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

  let context: BrowserContext | null = null;
  try {
    if (args.siteKeys.includes("copart") || args.siteKeys.includes("iaai")) {
      context = await launchAuctionContext(args.headless);
    }
    if (args.siteKeys.includes("copart")) {
      const page = context?.pages()[0] || await context!.newPage();
      const copartRecords = await scrapeCopartTargets(page, activeTargets, nowIso, scopes);
      allRecords.push(...copartRecords);
    }
    if (args.siteKeys.includes("iaai")) {
      const iaaiRecords = await scrapeIaaiTargets(activeTargets, nowIso, scopes);
      allRecords.push(...iaaiRecords);
    }
    const dedupedRecords = Array.from(
      new Map(allRecords.map((item) => [`${item.record.sourceKey}|${item.record.lotNumber}`, item])).values(),
    );
    const completedAt = new Date().toISOString();
    const ingestResult = await postIngest(args.baseUrl, ingestToken, scopes, dedupedRecords, args, startedAt, completedAt);
    console.log(`Ingested ${dedupedRecords.length} records into ${args.baseUrl} run ${ingestResult.runId}.`);

    if (context) {
      const page = context.pages()[0] || await context.newPage();
      await uploadImages(args.baseUrl, ingestToken, ingestResult.runId, page, dedupedRecords);
    }
  } finally {
    if (context) {
      await context.close().catch(() => {});
    }
  }
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
