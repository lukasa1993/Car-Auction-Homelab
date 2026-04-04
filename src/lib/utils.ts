import { createHash } from "node:crypto";

export function normalizeWhitespace(value: string | null | undefined): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function sha256Hex(bytes: BufferSource | string): string {
  const hash = createHash("sha256");
  hash.update(typeof bytes === "string" ? bytes : Buffer.from(bytes as ArrayBuffer));
  return hash.digest("hex");
}

export function parseBoolean(value: string | null | undefined, defaultValue = false): boolean {
  if (value == null || value === "") {
    return defaultValue;
  }
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

export function extFromMimeType(mimeType: string | null | undefined): string {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/avif":
      return "avif";
    case "image/gif":
      return "gif";
    default:
      return "bin";
  }
}
