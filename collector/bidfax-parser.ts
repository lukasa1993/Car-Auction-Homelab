export type BidfaxSourceKey = "copart" | "iaai";

export interface BidfaxParsedSale {
  title: string | null;
  url: string | null;
  finalBidUsd: number | null;
  sourceKey: BidfaxSourceKey | null;
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

export interface BidfaxMatchTarget {
  sourceKey: BidfaxSourceKey;
  lotNumber: string;
  vin: string | null;
}

export interface BidfaxMatchedSale {
  sale: BidfaxParsedSale;
  confidence: number;
  reason: "vin-lot-source" | "vin" | "lot-source";
}

const HTML_ENTITY_MAP: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  "#39": "'",
  nbsp: " ",
};

export function normalizeBidfaxText(value: string | null | undefined): string {
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
  return normalizeBidfaxText(
    String(html || "")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<\/(div|p|li|tr|h[1-6])>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  );
}

function readMatch(html: string, pattern: RegExp): string | null {
  const match = html.match(pattern);
  return normalizeBidfaxText(match?.[1] || "") || null;
}

function readField(html: string, label: string): string | null {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return readMatch(
    html,
    new RegExp(`${escaped}:\\s*(?:&nbsp;|\\s)*(?:<[^>]+>)*\\s*(?:<span[^>]*>)?([^<\\n]+)`, "i"),
  );
}

function parsePrice(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const parsed = Number(value.replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
}

function parseBidfaxDate(value: string | null): string | null {
  const match = String(value || "").match(/\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/);
  if (!match) {
    return null;
  }
  const day = match[1].padStart(2, "0");
  const month = match[2].padStart(2, "0");
  return `${match[3]}-${month}-${day}`;
}

function parseSourceKey(html: string): { sourceKey: BidfaxSourceKey | null; sourceLabel: string | null } {
  if (/\bclass=["'][^"']*copart/i.test(html) || />\s*Copart\s*</i.test(html)) {
    return { sourceKey: "copart", sourceLabel: "Copart" };
  }
  if (/\bclass=["'][^"']*iaai/i.test(html) || />\s*IAAI\s*</i.test(html)) {
    return { sourceKey: "iaai", sourceLabel: "IAAI" };
  }
  return { sourceKey: null, sourceLabel: null };
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
  const match = text.match(/\bvin\s*:?\s*([A-HJ-NPR-Z0-9*]{11,17})\b/i);
  return match ? match[1].toUpperCase() : null;
}

function parseSearchCard(block: string, baseUrl: string): BidfaxParsedSale | null {
  const title = readMatch(block, /<h2[^>]*>([\s\S]*?)<\/h2>/i) || readMatch(block, /<a[^>]+href=["'][^"']+["'][^>]*>([\s\S]*?)<\/a>/i);
  const href = readMatch(block, /<a[^>]+href=["']([^"']+)["']/i);
  const finalBidUsd = parsePrice(readMatch(block, /<span[^>]*class=["'][^"']*prices[^"']*["'][^>]*>([\s\S]*?)<\/span>/i));
  const rawText = stripHtml(block);
  const saleDateRaw = readField(block, "Date of sale");
  const { sourceKey, sourceLabel } = parseSourceKey(block);
  const sale: BidfaxParsedSale = {
    title,
    url: absolutizeUrl(href, baseUrl),
    finalBidUsd,
    sourceKey,
    sourceLabel,
    lotNumber: readField(block, "Lot number"),
    vin: parseVinFromText(title || rawText),
    saleDate: parseBidfaxDate(saleDateRaw),
    saleDateRaw,
    condition: readField(block, "Condition"),
    damage: readField(block, "Damage"),
    secondaryDamage: null,
    mileage: readField(block, "Mileage"),
    location: null,
    color: null,
    seller: null,
    documents: null,
    rawText,
  };
  return sale.finalBidUsd || sale.lotNumber || sale.vin ? sale : null;
}

export function parseBidfaxDetailHtml(html: string, url: string | null, baseUrl = "https://en.bidfax.info"): BidfaxParsedSale | null {
  const finalBidUsd = parsePrice(
    readMatch(html, /class=["'][^"']*bidfax-price[^"']*["'][^>]*>[\s\S]*?<span[^>]*class=["'][^"']*prices[^"']*["'][^>]*>([\s\S]*?)<\/span>/i) ||
      readMatch(html, /Final bid:\s*(?:&nbsp;|[\s\S])*?<span[^>]*class=["'][^"']*prices[^"']*["'][^>]*>([\s\S]*?)<\/span>/i),
  );
  const title = readMatch(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const rawText = stripHtml(html);
  const saleDateRaw = readField(html, "Date of sale");
  const { sourceKey, sourceLabel } = parseSourceKey(html);
  const sale: BidfaxParsedSale = {
    title,
    url: absolutizeUrl(url, baseUrl),
    finalBidUsd,
    sourceKey,
    sourceLabel,
    lotNumber: readField(html, "Lot number"),
    vin: readField(html, "VIN")?.toUpperCase() || parseVinFromText(title || rawText),
    saleDate: parseBidfaxDate(saleDateRaw),
    saleDateRaw,
    condition: readField(html, "Condition"),
    damage: readField(html, "Primary Damage") || readField(html, "Damage"),
    secondaryDamage: readField(html, "Secondary Damage"),
    mileage: readField(html, "Mileage"),
    location: readField(html, "Location"),
    color: readField(html, "Body color"),
    seller: readField(html, "Seller"),
    documents: readField(html, "Documents"),
    rawText,
  };
  return sale.finalBidUsd || sale.lotNumber || sale.vin ? sale : null;
}

export function parseBidfaxSearchHtml(html: string, baseUrl = "https://en.bidfax.info"): BidfaxParsedSale[] {
  if (isBidfaxChallengeHtml(html)) {
    return [];
  }
  const cardMatches = [...String(html || "").matchAll(/<div[^>]+class=["'][^"']*thumbnail\s+offer[^"']*["'][^>]*>([\s\S]*?)(?=<div[^>]+class=["'][^"']*thumbnail\s+offer|<\/body>|$)/gi)];
  const cards = cardMatches
    .map((match) => parseSearchCard(match[0], baseUrl))
    .filter((sale): sale is BidfaxParsedSale => sale !== null);
  if (cards.length > 0) {
    return cards;
  }
  const detail = parseBidfaxDetailHtml(html, baseUrl, baseUrl);
  return detail ? [detail] : [];
}

export function isBidfaxChallengeHtml(html: string): boolean {
  const text = String(html || "").toLowerCase();
  return (
    text.includes("just a moment") ||
    text.includes("cf-chl") ||
    text.includes("enable javascript and cookies to continue") ||
    text.includes("/cdn-cgi/challenge-platform/")
  );
}

export function findBestBidfaxMatch(sales: BidfaxParsedSale[], target: BidfaxMatchTarget): BidfaxMatchedSale | null {
  const normalizedTargetVin = target.vin ? target.vin.toUpperCase() : null;
  const normalizedLot = target.lotNumber.trim();
  const exactVinMatches = sales.filter((sale) => normalizedTargetVin && sale.vin?.toUpperCase() === normalizedTargetVin);
  const exactLotSourceMatches = sales.filter((sale) => (
    sale.lotNumber === normalizedLot &&
    sale.sourceKey === target.sourceKey
  ));
  const exactAll = exactVinMatches.find((sale) => sale.lotNumber === normalizedLot && sale.sourceKey === target.sourceKey);
  if (exactAll) {
    return { sale: exactAll, confidence: 1, reason: "vin-lot-source" };
  }
  if (exactLotSourceMatches.length > 0) {
    return { sale: exactLotSourceMatches[0], confidence: 0.96, reason: "lot-source" };
  }
  if (exactVinMatches.length > 0) {
    return { sale: exactVinMatches[0], confidence: 0.9, reason: "vin" };
  }
  return null;
}
