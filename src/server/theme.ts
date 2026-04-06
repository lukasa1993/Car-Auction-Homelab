import { AUCTION_THEME_COOKIE_NAME, normalizeThemePreference, type ThemePreference } from "../lib/theme";

function parseCookies(header: string | null): Map<string, string> {
  const values = new Map<string, string>();
  for (const segment of String(header || "").split(";")) {
    const trimmed = segment.trim();
    if (!trimmed) {
      continue;
    }
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }
    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    if (!key) {
      continue;
    }
    values.set(key, decodeURIComponent(rawValue));
  }
  return values;
}

export function getThemePreferenceFromRequest(request: Request): ThemePreference {
  const cookies = parseCookies(request.headers.get("cookie"));
  return normalizeThemePreference(cookies.get(AUCTION_THEME_COOKIE_NAME));
}
