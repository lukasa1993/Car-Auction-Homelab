import type { UserDateHints } from "../lib/date-render";

export function hasExactAuctionTime(auctionDate: string | null | undefined): boolean {
  return typeof auctionDate === "string" && auctionDate.includes("T");
}

export function formatAuctionCountdown(auctionDate: string | null | undefined, nowMs: number): string | null {
  if (typeof auctionDate !== "string" || !auctionDate.includes("T")) {
    return null;
  }

  const target = Date.parse(auctionDate);
  if (Number.isNaN(target)) {
    return null;
  }

  const diff = target - nowMs;
  if (diff <= 0) {
    // A stored sale time that is hours in the past is almost always a stale
    // row (placeholder date, lot moved to "Future / date TBD", etc.), not a
    // lot that is genuinely still live. Don't pretend it's live forever.
    if (diff < -2 * 60 * 60 * 1000) {
      return null;
    }
    return "Live now";
  }

  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  return `${minutes}m ${seconds}s`;
}

export function formatLocalAuctionTime(
  auctionDate: string | null | undefined,
  hints?: UserDateHints | null,
): string | null {
  if (typeof auctionDate !== "string" || !auctionDate.includes("T")) {
    return null;
  }
  if (!hints?.timeZone) {
    return null;
  }

  const target = new Date(auctionDate);
  if (Number.isNaN(target.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat(hints.locale || undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: hints.timeZone,
  }).format(target);
}

export function formatAuctionDateDisplay(lot: {
  auctionDate: string | null;
  auctionDateRaw: string | null;
}): string {
  if (lot.auctionDateRaw && lot.auctionDateRaw !== "future") {
    return lot.auctionDateRaw;
  }
  if (lot.auctionDate === "future") {
    return "Future / upcoming";
  }
  return lot.auctionDate || "";
}

export function formatRelativeTimestamp(iso: string | null | undefined, nowMs: number, emptyLabel = "No ingest yet"): string {
  if (!iso) {
    return emptyLabel;
  }

  const timestampMs = Date.parse(iso);
  if (Number.isNaN(timestampMs)) {
    return iso;
  }

  const minutes = Math.floor((nowMs - timestampMs) / 60000);
  if (minutes < 1) {
    return "just now";
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  if (minutes < 1440) {
    return `${Math.floor(minutes / 60)}h ago`;
  }
  return `${Math.floor(minutes / 1440)}d ago`;
}

export function formatTimestampFallback(iso: string | null | undefined, emptyLabel = "—"): string {
  if (!iso) return emptyLabel;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  return `${new Date(ms).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

export function formatTimestamp(
  iso: string | null | undefined,
  hints?: UserDateHints | null,
  emptyLabel = "—",
): string {
  const fallback = formatTimestampFallback(iso, emptyLabel);
  if (!iso) return fallback;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return fallback;
  if (!hints?.timeZone) return fallback;
  return new Intl.DateTimeFormat(hints.locale || undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: hints.timeZone,
  }).format(new Date(ms));
}

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${i === 0 ? v.toFixed(0) : v.toFixed(1)} ${units[i]}`;
}

export function formatUsd(value: number | null | undefined, emptyLabel = "—"): string {
  if (value == null || !Number.isFinite(value)) {
    return emptyLabel;
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatSignedUsd(value: number | null | undefined, emptyLabel = "—"): string {
  if (value == null || !Number.isFinite(value)) {
    return emptyLabel;
  }
  const absolute = formatUsd(Math.abs(value));
  if (value === 0) {
    return absolute;
  }
  return `${value > 0 ? "+" : "-"}${absolute}`;
}

export function formatPercent(value: number | null | undefined, emptyLabel = "—"): string {
  if (value == null || !Number.isFinite(value)) {
    return emptyLabel;
  }
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
    style: "percent",
  }).format(value);
}

export function stripTeslaPrefix(carType: string): string {
  return carType.replace(/^Tesla\s+/, "");
}

function toTitleCase(value: string): string {
  return value
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function extractLotColor(evidence: string | null | undefined): string | null {
  const text = String(evidence || "");
  if (!text) {
    return null;
  }

  const patterns = [
    /\bExterior\s+Color:\s*([^:]+?)(?=\s+(?:Interior\s+Color:|Primary\s+Damage:|Secondary\s+Damage:|Odometer:|Airbags:|Key:|Engine:|Fuel\s+Type:|Transmission:|Driveline\s+Type:|VIN:|Lot\s+number:|Stock\s*#:|Branch:|Market:|Auction:|Current\s+bid:|$))/i,
    /\bColor:\s*([^:]+?)(?=\s+(?:Exterior\s+Color:|Interior\s+Color:|Primary\s+Damage:|Secondary\s+Damage:|Odometer:|Airbags:|Key:|Engine:|Fuel\s+Type:|Transmission:|Driveline\s+Type:|VIN:|Lot\s+number:|Stock\s*#:|Branch:|Market:|Auction:|Current\s+bid:|$))/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) {
      continue;
    }
    const color = match[1].replace(/\s+/g, " ").trim().replace(/[.,;:\-–]+$/, "");
    if (color) {
      return toTitleCase(color);
    }
  }

  return null;
}
