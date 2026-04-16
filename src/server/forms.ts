import type { VinTarget } from "../lib/types";
import { normalizeVinPattern } from "../lib/vin-patterns";

export function parseTargetForm(form: FormData, defaults: Partial<VinTarget> = {}): Partial<VinTarget> & {
  vinPattern: string;
} {
  return {
    id: defaults.id,
    key: String(form.get("key") || defaults.key || "").trim() || undefined,
    label: String(form.get("label") || defaults.label || "").trim() || undefined,
    carType: String(form.get("carType") || defaults.carType || "").trim() || undefined,
    vinPattern: normalizeVinPattern(String(form.get("vinPattern") || defaults.vinPattern || "")),
    marker: String(form.get("marker") || defaults.marker || "").trim() || undefined,
    yearFrom: form.has("yearFrom") ? Number.parseInt(String(form.get("yearFrom") || defaults.yearFrom || "2024"), 10) : defaults.yearFrom,
    yearTo: form.has("yearTo") ? Number.parseInt(String(form.get("yearTo") || defaults.yearTo || "2027"), 10) : defaults.yearTo,
    copartSlug: String(form.get("copartSlug") || defaults.copartSlug || "").trim() || undefined,
    iaaiPath: String(form.get("iaaiPath") || defaults.iaaiPath || "").trim() || undefined,
    enabledCopart: form.has("enabledCopart"),
    enabledIaai: form.has("enabledIaai"),
    active: form.has("active"),
  };
}

export function parseLotActionPath(pathname: string): { lotId: string; action: "approve" | "remove" | "restore" | "delete" } | null {
  const match = pathname.match(/^\/admin\/lots\/([^/]+)\/(approve|remove|restore|delete)$/);
  if (!match) {
    return null;
  }
  return {
    lotId: decodeURIComponent(match[1]),
    action: match[2] as "approve" | "remove" | "restore" | "delete",
  };
}

export function parsePublicRejectPath(pathname: string): { lotId: string } | null {
  const match = pathname.match(/^\/lots\/([^/]+)\/reject$/);
  if (!match) {
    return null;
  }
  return {
    lotId: decodeURIComponent(match[1]),
  };
}
