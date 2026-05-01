import "@tanstack/react-start/server-only";
import { getSecrets } from "@/utils/env";

export interface AuctionRuntimeConfig {
  baseUrl: string;
  collectorUpdateBaseUrl: string;
  collectorVersion: string;
  minimumSupportedCollectorVersion: string;
  ingestToken: string;
  vapidPublicKey: string;
  vapidPrivateKey: string;
  vapidSubject: string;
}

export function getAuctionConfig(request?: Request): AuctionRuntimeConfig {
  const secrets = getSecrets();
  const requestOrigin = request ? new URL(request.url).origin : "";
  const baseUrl = (secrets.AUCTION_BASE_URL || requestOrigin || "http://localhost:3005").replace(
    /\/$/,
    "",
  );
  const collectorVersion = secrets.AUCTION_COLLECTOR_VERSION || "0.1.0";

  return {
    baseUrl,
    collectorUpdateBaseUrl: (
      secrets.AUCTION_COLLECTOR_UPDATE_BASE_URL || `${baseUrl}/collector/runtime`
    ).replace(/\/$/, ""),
    collectorVersion,
    minimumSupportedCollectorVersion: secrets.AUCTION_MINIMUM_RUNNER_VERSION || collectorVersion,
    ingestToken: secrets.AUCTION_INGEST_TOKEN,
    vapidPublicKey: secrets.VAPID_PUBLIC_KEY,
    vapidPrivateKey: secrets.VAPID_PRIVATE_KEY,
    vapidSubject: secrets.VAPID_SUBJECT,
  };
}
