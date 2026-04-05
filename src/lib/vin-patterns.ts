const VIN_WILDCARD = "*";
const VIN_WILDCARD_REGEX = /[?*]/g;
const VIN_CORE_CHARSET = "[A-HJ-NPR-Z0-9*]";

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

export function inferVinTargetDefinition(value: string) {
  const vinPattern = normalizeVinPattern(value);
  const model = inferTeslaModel(vinPattern);
  const year = inferVinModelYear(vinPattern);
  const keyBase = slugifyVinPattern(vinPattern) || "vin-target";

  return {
    vinPattern,
    vinPrefix: deriveVinPrefix(vinPattern),
    key: `${model?.copartSlug ?? "tesla"}-${keyBase}`,
    label: model?.label ?? "Tesla",
    carType: model?.carType ?? "Tesla",
    marker: `${model?.label ?? "Tesla"} · ${vinPattern}`,
    yearFrom: year ?? 2024,
    yearTo: year ?? 2027,
    copartSlug: model?.copartSlug ?? "",
    iaaiPath: model?.iaaiPath ?? "",
    modelLabel: model?.label ?? null,
    inferredYear: year,
  };
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
  return new RegExp(anchored ? `^${body}$` : `(${body})`, "i");
}
