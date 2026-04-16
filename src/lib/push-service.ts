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
    const lots12h = this.store.getLotsToNotify12h();
    const lots30m = this.store.getLotsToNotify30m();
    if (lots12h.length === 0 && lots30m.length === 0) return;

    const subs = this.store.getPushSubscriptions();

    const sendBatch = async (
      lots: Array<{ id: string; lot_number: string; source_key: string; marker: string }>,
      eventType: string,
      label: string,
    ): Promise<void> => {
      if (lots.length === 0) return;

      if (subs.length === 0) {
        // Still mark as notified so we don't re-check forever when nobody is subscribed
        for (const lot of lots) this.store.recordLotNotification(lot.id, eventType);
        return;
      }

      const payload =
        lots.length === 1
          ? JSON.stringify({
              title: `Auction ${label}: ${lots[0].marker}`,
              body: `${lots[0].source_key.toUpperCase()} · lot ${lots[0].lot_number}`,
              url: "/",
            })
          : JSON.stringify({
              title: `${lots.length} lots entering ${label} window`,
              body: lots.map((l) => l.marker).join(", "),
              url: "/",
            });

      const sendPromises = subs.map((sub) =>
        webpush
          .sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload)
          .catch((err: unknown) => {
            const status = (err as { statusCode?: number }).statusCode;
            if (status === 410 || status === 404) {
              this.store.removePushSubscription(sub.endpoint);
            } else {
              console.error(
                JSON.stringify({ message: "push send error", endpoint: sub.endpoint.slice(0, 40), status }),
              );
            }
          }),
      );

      await Promise.allSettled(sendPromises);

      for (const lot of lots) this.store.recordLotNotification(lot.id, eventType);

      console.log(JSON.stringify({ message: "push notifications sent", label, lots: lots.length, subscribers: subs.length }));
    };

    await sendBatch(lots12h, "threshold_12h", "<12h");
    await sendBatch(lots30m, "threshold_30m", "<30m");
  }
}
