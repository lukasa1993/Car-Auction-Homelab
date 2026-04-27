const VIN_WILDCARD = "*";
const VIN_WILDCARD_REGEX = /[?*]/g;
const VIN_CORE_CHARSET = "[A-HJ-NPR-Z0-9*]";
const VIN_ALLOWED_PATTERN = /^[A-HJ-NPR-Z0-9*]+$/;
export const DEFAULT_GENERIC_YEAR_FROM = 2001;
export const DEFAULT_GENERIC_YEAR_TO = 2030;

const TESLA_MODEL_BY_CODE = {
  "3": {
    label: "Model 3",
    carType: "Tesla Model 3",
    copartSlug: "model-3",
    iaaiPath: "Model 3",
  },
  S: {
    label: "Model S",
    carType: "Tesla Model S",
    copartSlug: "model-s",
    iaaiPath: "Model S",
  },
  X: {
    label: "Model X",
    carType: "Tesla Model X",
    copartSlug: "model-x",
    iaaiPath: "Model X",
  },
  Y: {
    label: "Model Y",
    carType: "Tesla Model Y",
    copartSlug: "model-y",
    iaaiPath: "Model Y",
  },
} as const;

const MODEL_YEAR_BY_CODE: Record<string, number> = {
  A: 2010,
  B: 2011,
  C: 2012,
  D: 2013,
  E: 2014,
  F: 2015,
  G: 2016,
  H: 2017,
  J: 2018,
  K: 2019,
  L: 2020,
  M: 2021,
  N: 2022,
  P: 2023,
  R: 2024,
  S: 2025,
  T: 2026,
  V: 2027,
  W: 2028,
  X: 2029,
  Y: 2030,
  1: 2001,
  2: 2002,
  3: 2003,
  4: 2004,
  5: 2005,
  6: 2006,
  7: 2007,
  8: 2008,
  9: 2009,
};

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isVinDebugEnabled(): boolean {
  const value = String(process.env.AUCTION_VIN_DEBUG || process.env.DEBUG_VIN_TARGETS || "")
    .trim()
    .toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on" || value === "debug";
}

function logVinPatternDebug(event: string, payload: Record<string, unknown>): void {
  if (!isVinDebugEnabled()) {
    return;
  }
  console.log(
    JSON.stringify(
      {
        message: "vin pattern debug",
        event,
        ...payload,
      },
      null,
      2,
    ),
  );
}

function slugifyVinPattern(value: string): string {
  return normalizeVinPattern(value)
    .toLowerCase()
    .replaceAll(VIN_WILDCARD, "x")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function normalizeVinPattern(value: string): string {
  return String(value || "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(VIN_WILDCARD_REGEX, VIN_WILDCARD);
}

export function deriveVinPrefix(value: string): string {
  const normalized = normalizeVinPattern(value);
  const wildcardIndex = normalized.indexOf(VIN_WILDCARD);
  return wildcardIndex === -1 ? normalized : normalized.slice(0, wildcardIndex);
}

export function inferTeslaModel(value: string) {
  const normalized = normalizeVinPattern(value);
  return TESLA_MODEL_BY_CODE[normalized[3] as keyof typeof TESLA_MODEL_BY_CODE] ?? null;
}

export function inferVinModelYear(value: string): number | null {
  const normalized = normalizeVinPattern(value);
  const yearCode = normalized[9];
  if (!yearCode || yearCode === VIN_WILDCARD) {
    return null;
  }
  return MODEL_YEAR_BY_CODE[yearCode] ?? null;
}

export function getVinTargetValidationError(value: string): string | null {
  const vinPattern = normalizeVinPattern(value);
  if (!vinPattern) {
    return "VIN pattern is required.";
  }
  if (vinPattern.length > 17) {
    return "VIN pattern cannot be longer than 17 characters.";
  }
  if (!VIN_ALLOWED_PATTERN.test(vinPattern)) {
    return "VIN pattern can only contain VIN characters and *.";
  }
  if (!deriveVinPrefix(vinPattern)) {
    return "VIN pattern must begin with a concrete VIN prefix before any wildcard.";
  }
  return null;
}

export function isGenericVinTargetMetadata(value: {
  label?: string | null;
  carType?: string | null;
  marker?: string | null;
  vinPattern?: string | null;
  vinPrefix?: string | null;
  copartSlug?: string | null;
  iaaiPath?: string | null;
}): boolean {
  const vinPattern = normalizeVinPattern(String(value.vinPattern || ""));
  const vinPrefix = normalizeVinPattern(String(value.vinPrefix || deriveVinPrefix(vinPattern)));
  const label = String(value.label || "").trim();
  const carType = String(value.carType || "").trim();
  const marker = String(value.marker || "").trim();
  const copartSlug = String(value.copartSlug || "").trim();
  const iaaiPath = String(value.iaaiPath || "").trim();

  return (
    (!!vinPrefix && label === vinPrefix && carType === vinPrefix && marker === `VIN · ${vinPattern}`) ||
    (label === "Tesla" && carType === "Tesla" && !copartSlug && !iaaiPath)
  );
}

export function hasGenericVinTargetYearRange(value: { yearFrom?: number | null; yearTo?: number | null }): boolean {
  return Number(value.yearFrom) === DEFAULT_GENERIC_YEAR_FROM && Number(value.yearTo) === DEFAULT_GENERIC_YEAR_TO;
}

export function inferVinTargetDefinition(value: string) {
  const vinPattern = normalizeVinPattern(value);
  const vinPrefix = deriveVinPrefix(vinPattern);
  const model = inferTeslaModel(vinPattern);
  const year = inferVinModelYear(vinPattern);
  const keyBase = slugifyVinPattern(vinPattern) || "vin-target";
  const genericLabel = vinPrefix || vinPattern || "VIN target";
  const definition = {
    vinPattern,
    vinPrefix,
    key: `${model?.copartSlug ?? "vin"}-${keyBase}`,
    label: model?.label ?? genericLabel,
    carType: model?.carType ?? genericLabel,
    marker: model?.label ? `${model.label} · ${vinPattern}` : `VIN · ${vinPattern}`,
    yearFrom: year ?? DEFAULT_GENERIC_YEAR_FROM,
    yearTo: year ?? DEFAULT_GENERIC_YEAR_TO,
    copartSlug: model?.copartSlug ?? "",
    iaaiPath: model?.iaaiPath ?? "",
    modelLabel: model?.label ?? null,
    inferredYear: year,
  };

  logVinPatternDebug("target_definition_inferred", {
    input: value,
    normalizedVinPattern: vinPattern,
    derivedVinPrefix: vinPrefix,
    note: "vinPrefix is only the concrete prefix before the first wildcard. Use vinPattern for full-mask matching.",
    definition,
  });

  return definition;
}

export function buildVinMaskRegex(mask: string, anchored = false): RegExp {
  const normalized = normalizeVinPattern(mask);
  if (!normalized) {
    return new RegExp(anchored ? "^$" : "($^)", "i");
  }
  const escaped = escapeRegex(normalized).replaceAll(`\\${VIN_WILDCARD}`, VIN_CORE_CHARSET);
  const suffixLength = Math.max(0, 17 - normalized.length);
  const tail = suffixLength ? `${VIN_CORE_CHARSET}{0,${suffixLength}}` : "";
  const body = `${escaped}${tail}`;
  const regex = new RegExp(anchored ? `^${body}$` : `(${body})`, "i");

  logVinPatternDebug("mask_regex_built", {
    inputMask: mask,
    normalizedMask: normalized,
    anchored,
    derivedPrefix: deriveVinPrefix(normalized),
    normalizedLength: normalized.length,
    suffixLength,
    body,
    regex: String(regex),
    note: anchored
      ? "Anchored regex is used to decide whether a full VIN/prefix matches this target."
      : "Unanchored regex is used to extract a matching VIN from scraped text.",
  });

  return regex;
}
