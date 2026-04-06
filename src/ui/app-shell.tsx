import * as React from "react";

import { ThemeToggle } from "./components/theme-toggle";

type LiveToast = {
  id: number;
  title: string;
  message: string;
};

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

export function AppShell({ children }: { children: React.ReactNode }) {
  const [bannerMessage, setBannerMessage] = React.useState<string | null>(null);
  const [toasts, setToasts] = React.useState<LiveToast[]>([]);
  const nextToastId = React.useRef(1);

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
      <ThemeToggle />
    </>
  );
}
