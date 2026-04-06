export const AUCTION_THEME_STORAGE_KEY = "auction-theme";
export const AUCTION_THEME_COOKIE_NAME = "auction_theme";

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const DEFAULT_THEME_PREFERENCE: ThemePreference = "system";

export function normalizeThemePreference(value: string | null | undefined): ThemePreference {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "light" || normalized === "dark" || normalized === "system") {
    return normalized;
  }
  return DEFAULT_THEME_PREFERENCE;
}

export function resolveThemePreference(preference: ThemePreference, prefersDark: boolean): ResolvedTheme {
  if (preference === "system") {
    return prefersDark ? "dark" : "light";
  }
  return preference;
}
