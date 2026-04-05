import * as React from "react";

import type { UserDateHints } from "../lib/date-render";
import type { AppPage } from "./page-registry";

function serializePage(page: AppPage): string {
  return JSON.stringify(page)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function serializeInlineJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function buildDateBootstrapScript(initialHints: UserDateHints): string {
  return `(() => {
  const initialHints = ${serializeInlineJson(initialHints)};
  const normalizeLocale = (value) => {
    const input = String(value || "").trim();
    if (!input) return null;
    try {
      return Intl.getCanonicalLocales(input)[0] || null;
    } catch {
      return null;
    }
  };
  const normalizeTimeZone = (value) => {
    const input = String(value || "").trim();
    if (!input) return null;
    try {
      return new Intl.DateTimeFormat("en-US", { timeZone: input }).resolvedOptions().timeZone || null;
    } catch {
      return null;
    }
  };
  const locale = normalizeLocale((navigator.languages && navigator.languages[0]) || navigator.language) || initialHints.locale || null;
  let resolvedTimeZone = null;
  try {
    resolvedTimeZone = normalizeTimeZone(new Intl.DateTimeFormat().resolvedOptions().timeZone);
  } catch {
    resolvedTimeZone = null;
  }
  const timeZone = resolvedTimeZone || initialHints.timeZone || null;
  const hints = { locale, timeZone };
  window.__AUCTION_USER_HINTS__ = hints;
  const cookieSuffix = "; Path=/; Max-Age=31536000; SameSite=Lax" + (window.location.protocol === "https:" ? "; Secure" : "");
  if (hints.locale) {
    document.cookie = "auction_locale=" + encodeURIComponent(hints.locale) + cookieSuffix;
  }
  if (hints.timeZone) {
    document.cookie = "auction_time_zone=" + encodeURIComponent(hints.timeZone) + cookieSuffix;
  }
  const formatTimestamp = (iso, fallback) => {
    const parsed = Date.parse(iso || "");
    if (Number.isNaN(parsed) || !hints.timeZone) return fallback;
    try {
      return new Intl.DateTimeFormat(hints.locale || undefined, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: hints.timeZone,
      }).format(new Date(parsed));
    } catch {
      return fallback;
    }
  };
  const formatAuctionLocalTime = (iso, fallback) => {
    const parsed = Date.parse(iso || "");
    if (Number.isNaN(parsed) || !hints.timeZone) return fallback;
    try {
      return new Intl.DateTimeFormat(hints.locale || undefined, {
        hour: "numeric",
        minute: "2-digit",
        timeZone: hints.timeZone,
        timeZoneName: "short",
      }).format(new Date(parsed)) + " local";
    } catch {
      return fallback;
    }
  };
  document.querySelectorAll("[data-auction-date-format]").forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    const iso = node.dataset.auctionDate || "";
    const fallback = node.textContent || node.dataset.auctionEmptyLabel || "";
    const format = node.dataset.auctionDateFormat;
    const nextText = format === "timestamp"
      ? formatTimestamp(iso, fallback)
      : format === "auction-local-time"
        ? formatAuctionLocalTime(iso, fallback)
        : fallback;
    if (node.textContent !== nextText) {
      node.textContent = nextText;
    }
  });
})();`;
}

export function AppDocument({
  page,
  title,
  children,
}: {
  page: AppPage;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Instrument+Sans:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
        <link rel="stylesheet" href="/app.css" />
      </head>
      <body className="min-h-full bg-background text-foreground antialiased">
        <div id="app-root">{children}</div>
        <script
          dangerouslySetInnerHTML={{
            __html: buildDateBootstrapScript(page.dateRender.userDateHints),
          }}
        />
        <script
          id="app-page-data"
          type="application/json"
          dangerouslySetInnerHTML={{
            __html: serializePage(page),
          }}
        />
        <script src="/app.js" type="module" />
      </body>
    </html>
  );
}
