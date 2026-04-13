import * as React from "react";

type LiveToast = {
  id: number;
  title: string;
  message: string;
};

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0))).buffer as ArrayBuffer;
}

function usePushNotifications() {
  const [permission, setPermission] = React.useState<NotificationPermission | null>(null);
  const [subscribed, setSubscribed] = React.useState(false);
  const [vapidKey, setVapidKey] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    if ("Notification" in window) setPermission(Notification.permission);

    fetch("/api/push/vapid-key")
      .then((r) => r.json())
      .then((data: { publicKey: string }) => {
        if (data.publicKey) setVapidKey(data.publicKey);
      })
      .catch(() => {});
  }, []);

  const subscribe = React.useCallback(async () => {
    if (!vapidKey) return;

    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      alert("To enable push notifications, add this app to your Home Screen first.");
      return;
    }

    const perm = await Notification.requestPermission();
    setPermission(perm);
    if (perm !== "granted") return;

    const reg = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    });

    await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(sub.toJSON()),
    });

    setSubscribed(true);
  }, [vapidKey]);

  const supported = typeof window !== "undefined" && Boolean(vapidKey);

  return { permission, subscribed, supported, subscribe };
}

function ToastCard({
  toast,
  onExpire,
}: {
  toast: LiveToast;
  onExpire: (id: number) => void;
}) {
  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      onExpire(toast.id);
    }, 5200);

    return () => {
      window.clearTimeout(timer);
    };
  }, [onExpire, toast.id]);

  return (
    <div className="pointer-events-auto rounded-[1.5rem] border border-border bg-card/95 px-4 py-3 text-card-foreground shadow-[0_20px_60px_-32px_rgba(18,18,18,0.42)] backdrop-blur-xl">
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{toast.title}</div>
      <div className="text-sm font-medium leading-6">{toast.message}</div>
    </div>
  );
}

export function AppShell({ children, isAdmin }: { children: React.ReactNode; isAdmin?: boolean }) {
  const [bannerMessage, setBannerMessage] = React.useState<string | null>(null);
  const [toasts, setToasts] = React.useState<LiveToast[]>([]);
  const nextToastId = React.useRef(1);
  const { permission, subscribed, supported, subscribe } = usePushNotifications();
  const showNotifyButton = isAdmin && supported && !subscribed && permission !== "granted";

  const expireToast = React.useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  React.useEffect(() => {
    if (typeof window === "undefined" || !("EventSource" in window)) {
      return;
    }

    const source = new EventSource("/events");
    const handleCollectorSync = (event: Event) => {
      try {
        const payload = JSON.parse((event as MessageEvent<string>).data) as {
          title?: string;
          message?: string;
        };
        setToasts((current) => [
          {
            id: nextToastId.current++,
            title: payload.title || "Live update",
            message: payload.message || "Collector activity detected.",
          },
          ...current,
        ].slice(0, 4));
        setBannerMessage(payload.message || "New collector sync available. Refresh to load it.");
      } catch {
        // Ignore malformed event payloads.
      }
    };

    source.addEventListener("collector_sync", handleCollectorSync as EventListener);

    return () => {
      source.removeEventListener("collector_sync", handleCollectorSync as EventListener);
      source.close();
    };
  }, []);

  return (
    <>
      {showNotifyButton ? (
        <div className="pointer-events-none fixed bottom-4 right-4 z-50 sm:bottom-auto sm:top-4">
          <button
            className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-card/95 px-3 py-1.5 text-xs font-medium text-foreground shadow-sm backdrop-blur-xl transition-colors hover:bg-accent"
            onClick={() => void subscribe()}
            type="button"
          >
            Enable notifications
          </button>
        </div>
      ) : null}
      <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
        {bannerMessage ? (
          <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-border/80 bg-card/95 px-4 py-3 text-sm text-card-foreground shadow-[0_18px_60px_-28px_rgba(18,18,18,0.42)] backdrop-blur-xl">
            <div className="space-y-0.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Live update</p>
              <p className="font-medium">{bannerMessage}</p>
            </div>
            <button
              className="inline-flex items-center justify-center rounded-full bg-foreground px-3 py-1.5 text-xs font-medium text-background transition-opacity hover:opacity-90"
              onClick={() => window.location.reload()}
              type="button"
            >
              Refresh
            </button>
            <button
              className="inline-flex items-center justify-center rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
              onClick={() => setBannerMessage(null)}
              type="button"
            >
              Dismiss
            </button>
          </div>
        ) : null}
      </div>

      <div className="pointer-events-none fixed right-4 top-20 z-50 flex w-full max-w-sm flex-col gap-3 px-4 sm:px-0">
        {toasts.map((toast) => (
          <ToastCard key={toast.id} onExpire={expireToast} toast={toast} />
        ))}
      </div>

      {children}
    </>
  );
}
