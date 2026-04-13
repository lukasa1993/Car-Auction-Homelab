import webpush from "web-push";

import type { AuctionStore } from "../models/auction-store";

export class PushService {
  private readonly vapidPublicKey: string;

  constructor(
    vapidPublicKey: string,
    vapidPrivateKey: string,
    vapidSubject: string,
    private readonly store: AuctionStore,
  ) {
    this.vapidPublicKey = vapidPublicKey;

    if (vapidPublicKey && vapidPrivateKey) {
      webpush.setVapidDetails(
        vapidSubject || "mailto:admin@example.com",
        vapidPublicKey,
        vapidPrivateKey,
      );
    }
  }

  getVapidPublicKey(): string {
    return this.vapidPublicKey;
  }

  isConfigured(): boolean {
    return Boolean(this.vapidPublicKey);
  }

  startScheduler(): void {
    if (!this.isConfigured()) {
      console.log(JSON.stringify({ message: "push notifications disabled — VAPID keys not configured" }));
      return;
    }
    void this.checkAndNotify();
    setInterval(() => void this.checkAndNotify(), 2 * 60 * 1000);
  }

  async checkAndNotify(): Promise<void> {
    const lots = this.store.getLotsToNotify12h();
    if (lots.length === 0) return;

    const subs = this.store.getPushSubscriptions();
    if (subs.length === 0) {
      // Still mark as notified so we don't re-check forever when nobody is subscribed
      for (const lot of lots) {
        this.store.recordLotNotification(lot.id, "threshold_12h");
      }
      return;
    }

    const payload =
      lots.length === 1
        ? JSON.stringify({
            title: `Auction <12h: ${lots[0].marker}`,
            body: `${lots[0].source_key.toUpperCase()} · lot ${lots[0].lot_number}`,
            url: "/",
          })
        : JSON.stringify({
            title: `${lots.length} lots entering <12h window`,
            body: lots.map((l) => l.marker).join(", "),
            url: "/",
          });

    const sendPromises = subs.map((sub) =>
      webpush
        .sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload)
        .catch((err: unknown) => {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 410 || status === 404) {
            // Subscription expired or unregistered — clean it up
            this.store.removePushSubscription(sub.endpoint);
          } else {
            console.error(
              JSON.stringify({ message: "push send error", endpoint: sub.endpoint.slice(0, 40), status }),
            );
          }
        }),
    );

    await Promise.allSettled(sendPromises);

    for (const lot of lots) {
      this.store.recordLotNotification(lot.id, "threshold_12h");
    }

    console.log(
      JSON.stringify({
        message: "push notifications sent",
        lots: lots.length,
        subscribers: subs.length,
      }),
    );
  }
}
