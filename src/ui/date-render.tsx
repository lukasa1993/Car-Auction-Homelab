import * as React from "react";

import type { DateRenderConfig, UserDateHints } from "../lib/date-render";
import { normalizeLocale, normalizeTimeZone } from "../lib/date-render";
import { formatLocalAuctionTime, formatTimestamp, formatTimestampFallback } from "./format";

declare global {
  interface Window {
    __AUCTION_USER_HINTS__?: UserDateHints;
  }
}

const DateRenderContext = React.createContext<DateRenderConfig | null>(null);

function readBrowserDateHints(): UserDateHints | null {
  if (typeof window === "undefined") {
    return null;
  }

  const seededHints = window.__AUCTION_USER_HINTS__;
  const locale =
    seededHints?.locale ||
    normalizeLocale(window.navigator.languages?.[0] || window.navigator.language);
  let timeZone = seededHints?.timeZone || null;
  if (!timeZone) {
    try {
      timeZone = normalizeTimeZone(new Intl.DateTimeFormat().resolvedOptions().timeZone);
    } catch {
      timeZone = null;
    }
  }

  return {
    locale,
    timeZone,
  };
}

function resolveDateRenderConfig(value: DateRenderConfig): DateRenderConfig {
  const browserHints = readBrowserDateHints();
  if (!browserHints) {
    return value;
  }

  return {
    ...value,
    userDateHints: {
      locale: browserHints.locale || value.userDateHints.locale,
      timeZone: browserHints.timeZone || value.userDateHints.timeZone,
    },
  };
}

export function DateRenderProvider({
  children,
  value,
}: {
  children: React.ReactNode;
  value: DateRenderConfig;
}) {
  const resolvedValue = React.useMemo(
    () => resolveDateRenderConfig(value),
    [value.renderedAt, value.userDateHints.locale, value.userDateHints.timeZone],
  );

  return <DateRenderContext.Provider value={resolvedValue}>{children}</DateRenderContext.Provider>;
}

export function useDateRenderConfig(): DateRenderConfig {
  const value = React.useContext(DateRenderContext);
  if (!value) {
    throw new Error("DateRenderProvider is missing");
  }
  return value;
}

export function useDateNowMs(refreshMs: number): number {
  const { renderedAt } = useDateRenderConfig();
  const [nowMs, setNowMs] = React.useState(() => Date.parse(renderedAt) || Date.now());

  React.useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, refreshMs);
    return () => {
      window.clearInterval(timer);
    };
  }, [refreshMs]);

  return nowMs;
}

export function useUserDateHints(): UserDateHints {
  return useDateRenderConfig().userDateHints;
}

export function LocalizedDateText({
  className,
  emptyLabel = "—",
  format,
  iso,
}: {
  className?: string;
  emptyLabel?: string;
  format: "timestamp" | "auction-local-time";
  iso: string | null | undefined;
}) {
  const hints = useUserDateHints();
  const fallbackText =
    format === "timestamp"
      ? formatTimestampFallback(iso, emptyLabel)
      : emptyLabel;
  const text =
    format === "timestamp"
      ? formatTimestamp(iso, hints, fallbackText)
      : formatLocalAuctionTime(iso, hints);

  return (
    <time
      className={className}
      data-auction-date={iso || ""}
      data-auction-date-format={format}
      data-auction-empty-label={emptyLabel}
      dateTime={iso || undefined}
      suppressHydrationWarning
    >
      {text ?? fallbackText}
    </time>
  );
}
