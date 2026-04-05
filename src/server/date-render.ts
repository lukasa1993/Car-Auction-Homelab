import type { DateRenderConfig } from "../lib/date-render";
import { normalizeLocale, normalizeTimeZone, parsePrimaryLocale } from "../lib/date-render";

const DATE_LOCALE_COOKIE = "auction_locale";
const DATE_TIME_ZONE_COOKIE = "auction_time_zone";

function parseCookies(cookieHeader: string | null): Map<string, string> {
  const cookies = new Map<string, string>();
  if (!cookieHeader) {
    return cookies;
  }

  for (const chunk of cookieHeader.split(";")) {
    const separatorIndex = chunk.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }
    const name = chunk.slice(0, separatorIndex).trim();
    const value = chunk.slice(separatorIndex + 1).trim();
    if (!name) {
      continue;
    }
    try {
      cookies.set(name, decodeURIComponent(value));
    } catch {
      cookies.set(name, value);
    }
  }

  return cookies;
}

export function buildDateRenderConfig(request: Request): DateRenderConfig {
  const cookies = parseCookies(request.headers.get("cookie"));
  const hintedLocale = normalizeLocale(cookies.get(DATE_LOCALE_COOKIE));
  const hintedTimeZone = normalizeTimeZone(cookies.get(DATE_TIME_ZONE_COOKIE));

  return {
    renderedAt: new Date().toISOString(),
    userDateHints: {
      locale: hintedLocale || parsePrimaryLocale(request.headers.get("accept-language")),
      timeZone: hintedTimeZone,
    },
  };
}
