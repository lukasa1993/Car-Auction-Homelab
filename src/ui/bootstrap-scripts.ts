import {
  AUCTION_THEME_COOKIE_NAME,
  AUCTION_THEME_STORAGE_KEY,
  DEFAULT_THEME_PREFERENCE,
  normalizeThemePreference,
  type ThemePreference,
} from "@/lib/theme";
import type { UserDateHints } from "@/lib/date-render";

function serializeInlineJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function buildThemeBootstrapScript(initialPreference: ThemePreference): string {
  const normalized = normalizeThemePreference(initialPreference);
  return `(() => {
  const storageKey = ${serializeInlineJson(AUCTION_THEME_STORAGE_KEY)};
  const cookieName = ${serializeInlineJson(AUCTION_THEME_COOKIE_NAME)};
  const defaultPreference = ${serializeInlineJson(DEFAULT_THEME_PREFERENCE)};
  const normalizePreference = (value) => {
    const normalized = String(value || "").trim().toLowerCase();
    return normalized === "light" || normalized === "dark" || normalized === "system" ? normalized : defaultPreference;
  };
  const root = document.documentElement;
  const prefersDarkQuery = window.matchMedia("(prefers-color-scheme: dark)");
  const cookieSuffix = "; Path=/; Max-Age=31536000; SameSite=Lax" + (window.location.protocol === "https:" ? "; Secure" : "");
  const readStoredPreference = () => {
    try {
      const storedValue = window.localStorage.getItem(storageKey);
      return storedValue == null ? null : normalizePreference(storedValue);
    } catch {
      return null;
    }
  };
  const writePreference = (preference) => {
    try { window.localStorage.setItem(storageKey, preference); } catch {}
    document.cookie = cookieName + "=" + encodeURIComponent(preference) + cookieSuffix;
  };
  const resolveTheme = (preference) => preference === "dark" || (preference === "system" && prefersDarkQuery.matches) ? "dark" : "light";
  const emitTheme = (preference, resolvedTheme) => {
    window.__AUCTION_THEME__ = { preference, resolvedTheme };
    window.dispatchEvent(new CustomEvent("auction-theme-change", { detail: { preference, resolvedTheme } }));
  };
  const applyTheme = (preference, persist = false) => {
    const normalizedPreference = normalizePreference(preference);
    const resolvedTheme = resolveTheme(normalizedPreference);
    root.classList.toggle("dark", resolvedTheme === "dark");
    root.dataset.themePreference = normalizedPreference;
    root.style.colorScheme = resolvedTheme;
    if (persist) writePreference(normalizedPreference);
    emitTheme(normalizedPreference, resolvedTheme);
    return normalizedPreference;
  };
  let currentPreference = readStoredPreference() || normalizePreference(${serializeInlineJson(normalized)});
  currentPreference = applyTheme(currentPreference, currentPreference !== defaultPreference);
  window.__setAuctionTheme = (preference) => { currentPreference = applyTheme(preference, true); };
  const handleSystemThemeChange = () => {
    if (currentPreference === "system") applyTheme(currentPreference, false);
  };
  if (typeof prefersDarkQuery.addEventListener === "function") {
    prefersDarkQuery.addEventListener("change", handleSystemThemeChange);
  } else if (typeof prefersDarkQuery.addListener === "function") {
    prefersDarkQuery.addListener(handleSystemThemeChange);
  }
})();`;
}

export function buildDateBootstrapScript(initialHints: UserDateHints): string {
  return `(() => {
  const initialHints = ${serializeInlineJson(initialHints)};
  const normalizeLocale = (value) => {
    const input = String(value || "").trim();
    if (!input) return null;
    try { return Intl.getCanonicalLocales(input)[0] || null; } catch { return null; }
  };
  const normalizeTimeZone = (value) => {
    const input = String(value || "").trim();
    if (!input) return null;
    try { return new Intl.DateTimeFormat("en-US", { timeZone: input }).resolvedOptions().timeZone || null; } catch { return null; }
  };
  const locale = normalizeLocale((navigator.languages && navigator.languages[0]) || navigator.language) || initialHints.locale || null;
  let resolvedTimeZone = null;
  try { resolvedTimeZone = normalizeTimeZone(new Intl.DateTimeFormat().resolvedOptions().timeZone); } catch { resolvedTimeZone = null; }
  const timeZone = resolvedTimeZone || initialHints.timeZone || null;
  const hints = { locale, timeZone };
  window.__AUCTION_USER_HINTS__ = hints;
  const cookieSuffix = "; Path=/; Max-Age=31536000; SameSite=Lax" + (window.location.protocol === "https:" ? "; Secure" : "");
  if (hints.locale) document.cookie = "auction_locale=" + encodeURIComponent(hints.locale) + cookieSuffix;
  if (hints.timeZone) document.cookie = "auction_time_zone=" + encodeURIComponent(hints.timeZone) + cookieSuffix;
})();`;
}
