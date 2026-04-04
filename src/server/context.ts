import type { LiveEventBus } from "../lib/live-events";
import { AuctionStore } from "../models/auction-store";
import type { ServerConfig } from "./config";

export interface ServerServices {
  config: ServerConfig;
  store: AuctionStore;
  liveEvents: LiveEventBus;
}

export interface AuthState {
  signedIn: boolean;
  admin: boolean;
  email: string | null;
  session: { session: Record<string, unknown>; user: { email: string } } | null;
}
