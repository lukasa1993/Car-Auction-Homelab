import type { VinTarget } from "../lib/types";

export function parseTargetForm(form: FormData, defaults: Partial<VinTarget> = {}): Partial<VinTarget> & {
  key: string;
  label: string;
  carType: string;
  vinPattern: string;
} {
  return {
    id: defaults.id,
    key: String(form.get("key") || defaults.key || "").trim(),
    label: String(form.get("label") || defaults.label || "").trim(),
    carType: String(form.get("carType") || defaults.carType || "").trim(),
    vinPattern: String(form.get("vinPattern") || defaults.vinPattern || "").trim().toUpperCase(),
    marker: String(form.get("marker") || defaults.marker || "").trim() || undefined,
    yearFrom: Number.parseInt(String(form.get("yearFrom") || defaults.yearFrom || "2024"), 10),
    yearTo: Number.parseInt(String(form.get("yearTo") || defaults.yearTo || "2027"), 10),
    copartSlug: String(form.get("copartSlug") || defaults.copartSlug || "").trim(),
    iaaiPath: String(form.get("iaaiPath") || defaults.iaaiPath || "").trim(),
    enabledCopart: form.has("enabledCopart"),
    enabledIaai: form.has("enabledIaai"),
    active: form.has("active"),
  };
}

export function parseLotActionPath(pathname: string): { lotId: string; action: "approve" | "remove" | "restore" } | null {
  const match = pathname.match(/^\/admin\/lots\/([^/]+)\/(approve|remove|restore)$/);
  if (!match) {
    return null;
  }
  return {
    lotId: decodeURIComponent(match[1]),
    action: match[2] as "approve" | "remove" | "restore",
  };
}
