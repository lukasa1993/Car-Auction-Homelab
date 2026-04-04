import * as React from "react";

import type { AppPage } from "./page-registry";

function serializePage(page: AppPage): string {
  return JSON.stringify(page)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
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
