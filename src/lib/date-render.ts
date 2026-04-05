export interface UserDateHints {
  locale: string | null;
  timeZone: string | null;
}

export interface DateRenderConfig {
  renderedAt: string;
  userDateHints: UserDateHints;
}

export function normalizeLocale(value: string | null | undefined): string | null {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return null;
  }

  try {
    return Intl.getCanonicalLocales(trimmed)[0] || null;
  } catch {
    return null;
  }
}

export function normalizeTimeZone(value: string | null | undefined): string | null {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return null;
  }

  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: trimmed }).resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

export function parsePrimaryLocale(acceptLanguage: string | null | undefined): string | null {
  if (!acceptLanguage) {
    return null;
  }

  const firstToken = acceptLanguage
    .split(",")
    .map((part) => part.split(";")[0]?.trim() || "")
    .find(Boolean);

  return normalizeLocale(firstToken);
}
