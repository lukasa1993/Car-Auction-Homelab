import "@tanstack/react-start/server-only";
import auctionRunner from "../../collector/release/auction-runner.js?raw";
import bootstrap from "../../collector/release/bootstrap.js?raw";
import manifest from "../../collector/release/manifest.json?raw";
import manifestSig from "../../collector/release/manifest.sig?raw";
import packageJson from "../../collector/release/package.json?raw";
import readme from "../../collector/release/README.txt?raw";
import soldPriceRunner from "../../collector/release/sold-price-runner.js?raw";

const assets = new Map<string, { body: string; contentType: string }>([
  ["auction-runner.js", { body: auctionRunner, contentType: "text/javascript; charset=utf-8" }],
  ["bootstrap.js", { body: bootstrap, contentType: "text/javascript; charset=utf-8" }],
  ["manifest.json", { body: manifest, contentType: "application/json; charset=utf-8" }],
  ["manifest.sig", { body: manifestSig, contentType: "text/plain; charset=utf-8" }],
  ["package.json", { body: packageJson, contentType: "application/json; charset=utf-8" }],
  ["README.txt", { body: readme, contentType: "text/plain; charset=utf-8" }],
  [
    "sold-price-runner.js",
    { body: soldPriceRunner, contentType: "text/javascript; charset=utf-8" },
  ],
]);

export function getCollectorRuntimeAsset(assetPath: string): Response {
  const normalized = assetPath.replace(/^\/+/, "") || "manifest.json";
  const asset = assets.get(normalized);
  if (!asset) {
    return Response.json({ error: "Collector runtime asset not found" }, { status: 404 });
  }
  return new Response(asset.body, {
    headers: {
      "content-type": asset.contentType,
      "cache-control": normalized === "manifest.json" ? "no-store" : "public, max-age=300",
    },
  });
}
