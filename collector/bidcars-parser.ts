export type BidcarsSourceKey = "copart" | "iaai";

export interface BidcarsParsedSale {
  title: string | null;
  url: string | null;
  finalBidUsd: number | null;
  sourceKey: BidcarsSourceKey | null;
  sourceLabel: string | null;
  lotNumber: string | null;
  vin: string | null;
  saleDate: string | null;
  saleDateRaw: string | null;
  condition: string | null;
  damage: string | null;
  secondaryDamage: string | null;
  mileage: string | null;
  location: string | null;
  color: string | null;
  seller: string | null;
  documents: string | null;
  rawText: string;
}

export interface BidcarsValidationTarget {
  sourceKey: BidcarsSourceKey;
  lotNumber: string;
  vin: string | null;
}

export interface BidcarsValidatedSale {
  sale: BidcarsParsedSale;
  confidence: number;
  reason: "vin-lot-source" | "lot-source" | "lot-only";
}

export const BIDCARS_BASE_URL = "https://bid.cars";

const SOURCE_PREFIX: Record<BidcarsSourceKey, string> = {
  copart: "1",
  iaai: "0",
};

const HTML_ENTITY_MAP: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  "#39": "'",
  nbsp: " ",
};

export function buildBidcarsLotUrl(sourceKey: BidcarsSourceKey, lotNumber: string): string {
  const normalizedLot = String(lotNumber || "").trim();
  return `${BIDCARS_BASE_URL}/en/lot/${SOURCE_PREFIX[sourceKey]}-${encodeURIComponent(normalizedLot)}`;
}

export function normalizeBidcarsText(value: string | null | undefined): string {
  return decodeHtmlEntities(String(value || ""))
    .replace(/\r/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtmlEntities(text: string): string {
  return String(text || "").replace(/&(#x?[0-9a-f]+|amp|lt|gt|quot|#39|nbsp);/gi, (match, entity) => {
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
  });
}

function stripHtml(html: string): string {
  return normalizeBidcarsText(
    String(html || "")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<\/(div|p|li|tr|h[1-6])>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  );
}

function readMatch(html: string, pattern: RegExp): string | null {
  const match = html.match(pattern);
  return normalizeBidcarsText(match?.[1] || "") || null;
}

function readLabeledValue(html: string, labels: string[]): string | null {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Pattern 1: <td>Label</td><td>Value</td> or <dt>Label</dt><dd>Value</dd>
    const tableLike = readMatch(
      html,
      new RegExp(`<(?:t[dh]|dt|th|span|div|li|strong|b)[^>]*>\\s*${escaped}\\s*:?\\s*<\\/(?:t[dh]|dt|th|span|div|li|strong|b)>\\s*(?:<(?:t[dh]|dd|span|div|li)[^>]*>)\\s*([^<]+)`, "i"),
    );
    if (tableLike) {
      return tableLike;
    }
    // Pattern 2: Label: value (single line, label inside any tag)
    const inlineColon = readMatch(
      html,
      new RegExp(`${escaped}\\s*:\\s*(?:<[^>]+>)*\\s*([^<\\n]+?)(?=<|$)`, "i"),
    );
    if (inlineColon) {
      return inlineColon;
    }
  }
  return null;
}

function parsePrice(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const parsed = Number(String(value).replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
}

function parseSaleDate(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const trimmed = String(value).trim();
  // ISO yyyy-mm-dd
  const isoMatch = trimmed.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }
  // mm/dd/yyyy or dd/mm/yyyy or dd.mm.yyyy
  const slashMatch = trimmed.match(/\b(\d{1,2})[./](\d{1,2})[./](\d{4})\b/);
  if (slashMatch) {
    const a = slashMatch[1].padStart(2, "0");
    const b = slashMatch[2].padStart(2, "0");
    // Heuristic: if first part > 12, treat as day-first (dd/mm/yyyy or dd.mm.yyyy)
    const first = Number(slashMatch[1]);
    if (first > 12) {
      return `${slashMatch[3]}-${b}-${a}`;
    }
    // Default to mm/dd/yyyy (US)
    return `${slashMatch[3]}-${a}-${b}`;
  }
  // Month-name dates: "Jan 5, 2026" or "5 Jan 2026"
  const months: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  };
  const namedUs = trimmed.match(/\b([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})\b/);
  if (namedUs) {
    const month = months[namedUs[1].slice(0, 3).toLowerCase()];
    if (month) {
      return `${namedUs[3]}-${month}-${namedUs[2].padStart(2, "0")}`;
    }
  }
  const namedEu = trimmed.match(/\b(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})\b/);
  if (namedEu) {
    const month = months[namedEu[2].slice(0, 3).toLowerCase()];
    if (month) {
      return `${namedEu[3]}-${month}-${namedEu[1].padStart(2, "0")}`;
    }
  }
  return null;
}

function absolutizeUrl(url: string | null, baseUrl: string): string | null {
  if (!url) {
    return null;
  }
  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return null;
  }
}

function parseVinFromText(text: string): string | null {
  const match = String(text).match(/\b([A-HJ-NPR-Z0-9]{17})\b/);
  return match ? match[1].toUpperCase() : null;
}

function parseLotNumberFromUrl(url: string | null): { sourceKey: BidcarsSourceKey | null; lotNumber: string | null } {
  if (!url) {
    return { sourceKey: null, lotNumber: null };
  }
  const match = url.match(/\/lot\/([01])-([0-9]+)/i);
  if (!match) {
    return { sourceKey: null, lotNumber: null };
  }
  return {
    sourceKey: match[1] === "1" ? "copart" : "iaai",
    lotNumber: match[2],
  };
}

function parseSourceFromHtml(html: string): { sourceKey: BidcarsSourceKey | null; sourceLabel: string | null } {
  const lower = html.toLowerCase();
  if (/\bcopart\b/.test(lower)) {
    return { sourceKey: "copart", sourceLabel: "Copart" };
  }
  if (/\b(iaai|iaa|insurance auto auctions)\b/.test(lower)) {
    return { sourceKey: "iaai", sourceLabel: "IAAI" };
  }
  return { sourceKey: null, sourceLabel: null };
}

function readJsonLd(html: string): Record<string, unknown> | null {
  const matches = [...String(html || "").matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const match of matches) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (Array.isArray(parsed)) {
        for (const entry of parsed) {
          if (entry && typeof entry === "object") {
            return entry as Record<string, unknown>;
          }
        }
        continue;
      }
      if (parsed && typeof parsed === "object") {
        return parsed as Record<string, unknown>;
      }
    } catch {
      continue;
    }
  }
  return null;
}

function readJsonLdString(node: Record<string, unknown> | null, key: string): string | null {
  if (!node) {
    return null;
  }
  const value = node[key];
  if (typeof value === "string") {
    return normalizeBidcarsText(value) || null;
  }
  if (typeof value === "number") {
    return String(value);
  }
  if (value && typeof value === "object" && "name" in value && typeof (value as Record<string, unknown>).name === "string") {
    return normalizeBidcarsText((value as Record<string, unknown>).name as string) || null;
  }
  return null;
}

export function parseBidcarsDetailHtml(html: string, url: string | null, baseUrl = BIDCARS_BASE_URL): BidcarsParsedSale | null {
  const rawText = stripHtml(html);
  const jsonLd = readJsonLd(html);
  const jsonLdOffer = jsonLd && typeof jsonLd.offers === "object" && jsonLd.offers !== null
    ? jsonLd.offers as Record<string, unknown>
    : null;

  const parsedUrl = url
    || readMatch(rawText, /"url"\s*:\s*"([^"]*\/en\/lot\/[01]-[0-9]+[^"]*)"/i)
    || readMatch(rawText, /\b(https:\/\/bid\.cars\/en\/lot\/[01]-[0-9]+[^\s"]*)/i);

  const title = readJsonLdString(jsonLd, "name")
    || readMatch(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i)
    || readMatch(rawText, /\b(\d{4}\s+[A-Za-z][^|]+?\|\s*[A-HJ-NPR-Z0-9]{17}\s*\|\s*Bid History\s*\|\s*BidCars)/i);

  const fromUrl = parseLotNumberFromUrl(parsedUrl);
  const fromSource = parseSourceFromHtml(html);
  const sourceKey = fromUrl.sourceKey || fromSource.sourceKey;
  const sourceLabel = sourceKey === "copart" ? "Copart" : sourceKey === "iaai" ? "IAAI" : fromSource.sourceLabel;

  const lotNumber = fromUrl.lotNumber
    || readLabeledValue(html, ["Lot #", "Lot number", "Lot Number", "Lot No", "Lot"])
    || readMatch(rawText, /\bLot\s+(?:[01]-\s*)?([0-9]{4,})\b/i)
    || readMatch(rawText, /\/lot\/[01]-([0-9]+)/i);

  const vin = readLabeledValue(html, ["VIN", "Vin", "VIN number", "Vin number"])
    || readJsonLdString(jsonLd, "vehicleIdentificationNumber")
    || parseVinFromText(title || "")
    || parseVinFromText(rawText);

  const finalBidRaw = readMatch(rawText, /\bvar\s+finalBid\s*=\s*([0-9]+(?:\.[0-9]+)?)\s*;/i)
    || readMatch(rawText, /\bVehicle information\s+Final bid\s+\$?\s*([\d,\s]+(?:\.\d{1,2})?)\s*USD\b/i)
    || readMatch(rawText, /\bEstimated total price\s+\$?\s*([\d,\s]+(?:\.\d{1,2})?)\b/i)
    || readMatch(rawText, /\bSales History\s+Auction Date\s+Lot #\s+Final bid\s+Odometer\s+Status\s+Seller\s+\w+\s+\d{4}-\d{2}-\d{2}\s+[01]-[0-9]+\s+\$?\s*([\d,\s]+(?:\.\d{1,2})?)/i)
    || readMatch(rawText, /\bFinished\s+Final bid\s+\$?\s*([\d,\s]+(?:\.\d{1,2})?)/i)
    || readLabeledValue(html, [
      "Final bid",
      "Final Bid",
      "Sold for",
      "Final price",
      "Sold price",
      "Sale price",
      "Hammer price",
      "Purchase price",
    ]);

  const finalBidUsd = parsePrice(finalBidRaw);

  const saleDateRaw = readLabeledValue(html, [
    "Sale date",
    "Sale Date",
    "Date of sale",
    "Date sold",
    "Sold on",
    "Auction date",
  ])
    || readMatch(rawText, /\bAuction date\s+([A-Za-z]+,\s+[A-Za-z]+\s+\d{1,2},\s+\d{4})/i)
    || readMatch(rawText, /\bCopart\s+(\d{4}-\d{2}-\d{2})\s+[01]-[0-9]+/i)
    || readMatch(rawText, /"purchaseDate"\s*:\s*"([^"]+)"/i);

  const sale: BidcarsParsedSale = {
    title,
    url: absolutizeUrl(parsedUrl, baseUrl),
    finalBidUsd,
    sourceKey,
    sourceLabel,
    lotNumber: lotNumber ? String(lotNumber).trim() : null,
    vin: vin ? vin.toUpperCase().replace(/[^A-Z0-9*]/g, "") : null,
    saleDate: parseSaleDate(saleDateRaw),
    saleDateRaw,
    condition: readLabeledValue(html, ["Condition", "Vehicle condition", "Run & Drive"])
      || readMatch(rawText, /\bStart code\s+(.+?)\s+Key\b/i),
    damage: readLabeledValue(html, ["Primary damage", "Damage", "Main damage"])
      || readMatch(rawText, /\bPrimary damage\s+(.+?)\s+Secondary damage\b/i),
    secondaryDamage: readLabeledValue(html, ["Secondary damage", "Secondary Damage"])
      || readMatch(rawText, /\bSecondary damage\s+(.+?)\s+Odometer\b/i),
    mileage: readLabeledValue(html, ["Odometer", "Mileage", "Miles"])
      || readMatch(rawText, /\bOdometer\s+([\d\s,]+(?:mi|miles)(?:\s+\([\d\s,]+\s+km\))?)/i),
    location: readLabeledValue(html, ["Location", "Auction location", "Yard"])
      || readMatch(rawText, /\bLocation\s*:?\s+(.+?)\s+(?:Terminal|Shipping from|Seller|Odległość)\b/i),
      color: readMatch(rawText, /\bExterior color\s+([A-Za-z][A-Za-z0-9 /.'-]{1,50}?)\s+Transmission\b/i)
        || readJsonLdString(jsonLd, "color")
        || readLabeledValue(html, ["Exterior color", "Vehicle color", "Body color"]),
    seller: readLabeledValue(html, ["Seller", "Seller name"])
      || readMatch(rawText, /\bSeller\s*:?\s+([A-Za-z0-9 .&'/-]{2,80}?)\s+Sale Document\b/i),
    documents: readLabeledValue(html, ["Documents", "Title", "Title type", "Document type"])
      || readMatch(rawText, /\bSale Document\s+(.+?)\s+Loss\b/i),
    rawText,
  };
console.log(sale)
  if (!sale.finalBidUsd && !sale.lotNumber && !sale.vin) {
    return null;
  }
  return sale;
}

export function isBidcarsChallengeHtml(html: string): boolean {
  const lower = String(html || "").toLowerCase();
  const titleMatch = lower.match(/<title[^>]*>([^<]*)<\/title>/);
  const title = titleMatch ? titleMatch[1].trim() : "";
  if (title.startsWith("just a moment")) {
    return true;
  }
  if (/<form[^>]+id=["']challenge-form["']/.test(lower)) {
    return true;
  }
  if (/<div[^>]+id=["']challenge-(running|stage|body)["']/.test(lower)) {
    return true;
  }
  return false;
}

export function isBidcarsChallengeRendered(title: string, bodyPreview: string): boolean {
  const lowerTitle = title.toLowerCase().trim();
  const lowerBody = bodyPreview.toLowerCase();
  if (lowerTitle.startsWith("just a moment")) {
    return true;
  }
  if (lowerBody.includes("verify you are human") || lowerBody.includes("verifying you are human")) {
    return true;
  }
  if (lowerBody.includes("checking your browser") || lowerBody.includes("checking if the site connection is secure")) {
    return true;
  }
  if (lowerBody.includes("enable javascript and cookies to continue")) {
    return true;
  }
  if (lowerBody.includes("needs to review the security of your connection")) {
    return true;
  }
  return false;
}

export function isBidcarsNotFoundHtml(html: string): boolean {
  const text = String(html || "").toLowerCase();
  return (
    text.includes("lot not found") ||
    text.includes("page not found") ||
    /\b404\b/.test(text) && text.includes("not found")
  );
}

export function validateBidcarsSale(sale: BidcarsParsedSale, target: BidcarsValidationTarget): BidcarsValidatedSale | null {
  const targetLot = target.lotNumber.trim();
  const targetVin = target.vin ? target.vin.toUpperCase() : null;
  const lotMatches = sale.lotNumber === targetLot;
  if (!lotMatches) {
    return null;
  }
  const sourceMatches = sale.sourceKey === target.sourceKey;
  const vinMatches = !!targetVin && !!sale.vin && sale.vin.toUpperCase() === targetVin;
  if (vinMatches && sourceMatches) {
    return { sale, confidence: 1, reason: "vin-lot-source" };
  }
  if (sourceMatches) {
    return { sale, confidence: targetVin ? 0.85 : 0.92, reason: "lot-source" };
  }
  return { sale, confidence: 0.7, reason: "lot-only" };
}
