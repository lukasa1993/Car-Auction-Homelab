import "@tanstack/react-start/server-only";
import { env } from "cloudflare:workers";

type AuctionEnv = Env &
  Partial<
    Record<
      | "BETTER_AUTH_URL"
      | "AUCTION_COLLECTOR_UPDATE_BASE_URL"
      | "AUCTION_MINIMUM_RUNNER_VERSION"
      | "VAPID_PUBLIC_KEY"
      | "VAPID_PRIVATE_KEY"
      | "VAPID_SUBJECT",
      string
    >
  >;

const auctionEnv = env as AuctionEnv;

export function getD1(): D1Database {
  return auctionEnv.d1;
}

export function getImageBucket(): R2Bucket {
  return auctionEnv.AUCTION_IMAGES;
}

export function getSecrets() {
  const baseUrl =
    auctionEnv.BETTER_AUTH_URL || auctionEnv.AUCTION_BASE_URL || "http://localhost:3005";
  const authSecret = auctionEnv.BETTER_AUTH_SECRET || "";

  return {
    AUCTION_BASE_URL: baseUrl.replace(/\/$/, ""),
    AUCTION_COLLECTOR_UPDATE_BASE_URL: auctionEnv.AUCTION_COLLECTOR_UPDATE_BASE_URL || "",
    AUCTION_COLLECTOR_VERSION: auctionEnv.AUCTION_COLLECTOR_VERSION || "0.1.0",
    AUCTION_MINIMUM_RUNNER_VERSION:
      auctionEnv.AUCTION_MINIMUM_RUNNER_VERSION || auctionEnv.AUCTION_COLLECTOR_VERSION || "0.1.0",
    AUCTION_INGEST_TOKEN: auctionEnv.AUCTION_INGEST_TOKEN || "",
    AUCTION_ADMIN_EMAILS: auctionEnv.AUCTION_ADMIN_EMAILS || "",
    AUCTION_ADMIN_PASSWORD: auctionEnv.AUCTION_ADMIN_PASSWORD || "",
    BETTER_AUTH_URL: baseUrl.replace(/\/$/, ""),
    BETTER_AUTH_SECRET: authSecret,
    VAPID_PUBLIC_KEY: auctionEnv.VAPID_PUBLIC_KEY || "",
    VAPID_PRIVATE_KEY: auctionEnv.VAPID_PRIVATE_KEY || "",
    VAPID_SUBJECT: auctionEnv.VAPID_SUBJECT || "",
  };
}
