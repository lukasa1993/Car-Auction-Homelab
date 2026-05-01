import "@tanstack/react-start/server-only";
import { AuctionD1Store } from "@/models/auction-store-d1";
import { getAuctionConfig } from "@/lib/config";
import { getD1, getImageBucket } from "@/utils/env";

let seedPromise: Promise<void> | null = null;

export async function getAuctionStore(): Promise<AuctionD1Store> {
  const store = new AuctionD1Store(getD1(), getImageBucket());
  seedPromise ??= store.ensureSeeded();
  await seedPromise;
  return store;
}

export function getRuntimeConfig(request?: Request) {
  return getAuctionConfig(request);
}
