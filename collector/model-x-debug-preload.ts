import { chromium, type Browser, type BrowserContext, type Page, type Request, type Response } from "playwright";

interface ModelXTargetSummary {
  key: string;
  label: string;
  carType: string;
  vinPattern: string;
  vinPrefix: string;
  yearFrom: number | null;
  yearTo: number | null;
  copartSlug: string;
  iaaiPath: string;
  enabledCopart: boolean;
  enabledIaai: boolean;
}

const PATCH_MARKER = Symbol.for("lnh.auction.modelXDebugPreload.patched");
const MAX_TEXT = 2_000;
const MAX_RESPONSE_TEXT = 80_000;
const MAX_ARRAYS = 10;
const MAX_SAMPLES_PER_ARRAY = 8;

const state = globalThis as typeof globalThis & {
  [PATCH_MARKER]?: boolean;
  __collectorModelXTargets?: ModelXTargetSummary[];
};

function isEnabled(): boolean {
  const value = String(process.env.AUCTION_COLLECTOR_MODEL_X_DEBUG || "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on" || value === "debug";
}

function normalize(value: unknown, max = MAX_TEXT): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function log(event: string, payload: Record<string, unknown> = {}): void {
  if (!isEnabled()) {
    return;
  }
  console.log(JSON.stringify({ message: "collector model-x debug", event, pid: process.pid, ...payload }, null, 2));
}

function vinPrefixFromPattern(value: unknown): string {
  const normalized = String(value ?? "").toUpperCase().replace(/\s+/g, "").replace(/[?*]/g, "*");
  const index = normalized.indexOf("*");
  return index === -1 ? normalized : normalized.slice(0, index);
}

function looksLikeModelXTarget(target: any): boolean {
  const haystack = normalize([
    target?.key,
    target?.label,
    target?.carType,
    target?.marker,
    target?.vinPattern,
    target?.vinPrefix,
    target?.copartSlug,
    target?.iaaiPath,
  ].filter(Boolean).join(" ")).toLowerCase();
  return haystack.includes("model x") || haystack.includes("model-x") || haystack.includes("7saxcde5");
}

function summarizeTarget(target: any): ModelXTargetSummary {
  const vinPattern = String(target?.vinPattern || "");
  return {
    key: String(target?.key || ""),
    label: String(target?.label || ""),
    carType: String(target?.carType || ""),
    vinPattern,
    vinPrefix: String(target?.vinPrefix || vinPrefixFromPattern(vinPattern)),
    yearFrom: Number.isFinite(Number(target?.yearFrom)) ? Number(target.yearFrom) : null,
    yearTo: Number.isFinite(Number(target?.yearTo)) ? Number(target.yearTo) : null,
    copartSlug: String(target?.copartSlug || ""),
    iaaiPath: String(target?.iaaiPath || ""),
    enabledCopart: !!target?.enabledCopart,
    enabledIaai: !!target?.enabledIaai,
  };
}

function currentPrefixes(): string[] {
  const fromTargets = (state.__collectorModelXTargets || [])
    .flatMap((target) => [target.vinPrefix, vinPrefixFromPattern(target.vinPattern)])
    .filter(Boolean);
  return [...new Set(["7SAXCDE5", ...fromTargets].map((value) => String(value).toUpperCase()))];
}

function isModelXText(value: unknown): boolean {
  const text = normalize(value, MAX_TEXT).toLowerCase();
  if (!text) {
    return false;
  }
  if (text.includes("model x") || text.includes("model-x") || text.includes("7saxcde5")) {
    return true;
  }
  return currentPrefixes().some((prefix) => prefix && text.toUpperCase().includes(prefix));
}

function requestPostData(request: Request): string {
  try {
    return normalize(request.postData() || "", MAX_TEXT);
  } catch {
    return "";
  }
}

function isRelevantUrlOrBody(url: string, postData = ""): boolean {
  const combined = `${url} ${postData}`;
  if (isModelXText(combined)) {
    return true;
  }
  const lower = combined.toLowerCase();
  return (
    (lower.includes("copart.com") || lower.includes("iaai.com")) &&
    (lower.includes("search") || lower.includes("lot") || lower.includes("vehicle") || lower.includes("inventory")) &&
    currentPrefixes().some((prefix) => lower.includes(prefix.toLowerCase()))
  );
}

function compactObject(value: any): Record<string, unknown> {
  const keys = [
    "lotNumberStr",
    "lotNumber",
    "ln",
    "stockNumber",
    "StockNumber",
    "StockNum",
    "VehicleId",
    "fv",
    "vin",
    "VIN",
    "ld",
    "vehicleTitle",
    "VehicleTitle",
    "lcy",
    "year",
    "Year",
    "yn",
    "syn",
    "BranchName",
    "VehicleLocation",
    "clr",
    "color",
    "ad",
    "adt",
    "AuctionDateTime",
    "auctionDate",
    "saleDate",
    "ldu",
    "url",
    "href",
  ];
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (value?.[key] != null && value[key] !== "") {
      out[key] = value[key];
    }
  }
  if (value?.dynamicLotDetails && typeof value.dynamicLotDetails === "object") {
    out.dynamicLotDetails = {
      currentBid: value.dynamicLotDetails.currentBid,
      saleStatus: value.dynamicLotDetails.saleStatus,
      bidStatus: value.dynamicLotDetails.bidStatus,
    };
  }
  const rawTitle = normalize([value?.ld, value?.vehicleTitle, value?.VehicleTitle, value?.Title, value?.title].filter(Boolean).join(" "), 220);
  if (rawTitle) {
    out.titlePreview = rawTitle;
  }
  return Object.keys(out).length > 0 ? out : { preview: normalize(JSON.stringify(value), 260) };
}

function looksLikeLotObject(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const item = value as Record<string, unknown>;
  return [
    "lotNumberStr",
    "lotNumber",
    "ln",
    "fv",
    "vin",
    "VIN",
    "ld",
    "lcy",
    "VehicleId",
    "StockNumber",
    "StockNum",
  ].some((key) => key in item);
}

function objectMatchesModelX(value: unknown): boolean {
  if (!value || typeof value !== "object") {
    return isModelXText(value);
  }
  const item = value as Record<string, unknown>;
  return isModelXText([
    item.fv,
    item.vin,
    item.VIN,
    item.ld,
    item.vehicleTitle,
    item.VehicleTitle,
    item.Title,
    item.title,
    item.ldu,
    item.url,
    item.href,
  ].filter(Boolean).join(" "));
}

function findLotArrays(value: unknown, path = "$", out: Array<{ path: string; total: number; modelX: number; samples: unknown[] }> = []): Array<{ path: string; total: number; modelX: number; samples: unknown[] }> {
  if (out.length >= MAX_ARRAYS || value == null) {
    return out;
  }
  if (Array.isArray(value)) {
    const lotItems = value.filter(looksLikeLotObject);
    if (lotItems.length > 0) {
      const modelXItems = lotItems.filter(objectMatchesModelX);
      out.push({
        path,
        total: lotItems.length,
        modelX: modelXItems.length,
        samples: (modelXItems.length ? modelXItems : lotItems).slice(0, MAX_SAMPLES_PER_ARRAY).map(compactObject),
      });
    }
    for (let index = 0; index < Math.min(value.length, 20) && out.length < MAX_ARRAYS; index += 1) {
      findLotArrays(value[index], `${path}[${index}]`, out);
    }
    return out;
  }
  if (typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (out.length >= MAX_ARRAYS) {
        break;
      }
      findLotArrays(child, `${path}.${key}`, out);
    }
  }
  return out;
}

async function inspectFetchResponse(label: string, url: string, response: globalThis.Response): Promise<void> {
  const contentType = response.headers.get("content-type") || "";
  const status = response.status;
  let text = "";
  try {
    text = await response.clone().text();
  } catch (error) {
    log(`${label}-response-unreadable`, { url, status, contentType, error: String(error) });
    return;
  }
  const preview = normalize(text, MAX_TEXT);
  let json: unknown = null;
  if (text.length <= MAX_RESPONSE_TEXT && /json/i.test(contentType)) {
    try {
      json = JSON.parse(text);
    } catch {}
  }
  const lotArrays = json ? findLotArrays(json) : [];
  log(`${label}-response`, {
    url,
    status,
    contentType,
    byteLength: text.length,
    modelXTextSeen: isModelXText(text),
    lotArrays,
    preview: lotArrays.length ? undefined : preview,
  });
}

function patchGlobalFetch(): void {
  const originalFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" || input instanceof URL ? String(input) : String(input.url);
    const method = String(init?.method || (typeof input === "object" && "method" in input ? (input as globalThis.Request).method : "GET"));
    const body = normalize(init?.body, MAX_TEXT);
    const startedAt = Date.now();
    const response = await originalFetch(input as any, init as any);

    if (url.includes("/api/scrape-config")) {
      try {
        const config = await response.clone().json() as any;
        const targets = Array.isArray(config?.targets) ? config.targets.filter(looksLikeModelXTarget).map(summarizeTarget) : [];
        state.__collectorModelXTargets = targets;
        log("model-x-config-targets", { url, status: response.status, configVersion: config?.configVersion, targetCount: targets.length, targets });
      } catch (error) {
        log("model-x-config-read-failed", { url, status: response.status, error: String(error) });
      }
      return response;
    }

    if (isRelevantUrlOrBody(url, body)) {
      log("node-fetch-request", { method, url, bodyPreview: body || undefined });
      await inspectFetchResponse("node-fetch", url, response).catch((error) => {
        log("node-fetch-response-log-failed", { url, status: response.status, durationMs: Date.now() - startedAt, error: String(error) });
      });
    }

    return response;
  }) as typeof globalThis.fetch;
}

const relevantRequests = new WeakSet<Request>();

function attachPage(page: Page): void {
  page.on("request", (request) => {
    const url = request.url();
    const body = requestPostData(request);
    if (!isRelevantUrlOrBody(url, body)) {
      return;
    }
    relevantRequests.add(request);
    log("browser-request", {
      method: request.method(),
      url,
      resourceType: request.resourceType(),
      postDataPreview: body || undefined,
    });
  });

  page.on("response", async (response: Response) => {
    const request = response.request();
    if (!relevantRequests.has(request)) {
      return;
    }
    const url = response.url();
    const contentType = response.headers()["content-type"] || "";
    let text = "";
    try {
      text = await response.text();
    } catch (error) {
      log("browser-response-unreadable", { url, status: response.status(), contentType, error: String(error) });
      return;
    }
    const json = text.length <= MAX_RESPONSE_TEXT && /json/i.test(contentType)
      ? (() => {
          try { return JSON.parse(text); } catch { return null; }
        })()
      : null;
    const lotArrays = json ? findLotArrays(json) : [];
    log("browser-response", {
      url,
      status: response.status(),
      contentType,
      byteLength: text.length,
      modelXTextSeen: isModelXText(text),
      lotArrays,
      preview: lotArrays.length ? undefined : normalize(text, MAX_TEXT),
    });
  });
}

function attachContext(context: BrowserContext): void {
  for (const page of context.pages()) {
    attachPage(page);
  }
  context.on("page", attachPage);
}

function patchBrowser(browser: Browser): Browser {
  for (const context of browser.contexts()) {
    attachContext(context);
  }
  const originalNewContext = browser.newContext.bind(browser);
  browser.newContext = (async (...args: Parameters<Browser["newContext"]>) => {
    const context = await originalNewContext(...args);
    attachContext(context);
    return context;
  }) as Browser["newContext"];
  return browser;
}

function patchPlaywright(): void {
  const originalLaunch = chromium.launch.bind(chromium);
  chromium.launch = (async (...args: Parameters<typeof chromium.launch>) => {
    log("playwright-launch", { args: normalize(JSON.stringify(args), 600) });
    return patchBrowser(await originalLaunch(...args));
  }) as typeof chromium.launch;

  const originalLaunchPersistentContext = chromium.launchPersistentContext.bind(chromium);
  chromium.launchPersistentContext = (async (...args: Parameters<typeof chromium.launchPersistentContext>) => {
    log("playwright-launch-persistent-context", { args: normalize(JSON.stringify(args), 600) });
    const context = await originalLaunchPersistentContext(...args);
    attachContext(context);
    return context;
  }) as typeof chromium.launchPersistentContext;
}

if (isEnabled() && !state[PATCH_MARKER]) {
  state[PATCH_MARKER] = true;
  patchGlobalFetch();
  patchPlaywright();
  log("preload-installed", {
    note: "Shows Model X config targets, Model X Copart/IAAI requests, and raw Model X-like lot samples before collector filters run.",
    defaultPrefixes: currentPrefixes(),
  });
}
