import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import type { ErrorComponentProps } from "@tanstack/react-router";
import type { ReactNode } from "react";
import appCss from "../styles/app.css?url";
import { AppShell } from "@/ui/app-shell";
import { DateRenderProvider } from "@/ui/date-render";
import { getRootData } from "@/lib/root-data";
import { buildDateBootstrapScript, buildThemeBootstrapScript } from "@/ui/bootstrap-scripts";
import { Button } from "@/ui/components/button";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Auction Monitor" },
      { name: "description", content: "Live auction monitor for tracked vehicle VIN families." },
      { name: "theme-color", content: "#f8f4e8" },
      { name: "color-scheme", content: "light dark" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.json" },
    ],
  }),
  loader: async () => await getRootData(),
  shellComponent: RootDocument,
  component: RootLayout,
  errorComponent: RootErrorBoundary,
  notFoundComponent: NotFound,
});

function RootLayout() {
  const rootData = Route.useLoaderData();

  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: buildThemeBootstrapScript(rootData.initialThemePreference),
        }}
      />
      <script
        dangerouslySetInnerHTML={{
          __html: buildDateBootstrapScript(rootData.dateRender.userDateHints),
        }}
      />
      <DateRenderProvider value={rootData.dateRender}>
        <AppShell auth={rootData.auth}>
          <Outlet />
        </AppShell>
      </DateRenderProvider>
    </>
  );
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <head>
        <HeadContent />
      </head>
      <body className="min-h-full bg-background text-foreground antialiased transition-colors duration-200">
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootErrorBoundary({ error, reset }: ErrorComponentProps) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-sm font-medium text-muted-foreground">Unexpected error</p>
      <h1 className="text-2xl font-semibold tracking-tight">Something did not load right</h1>
      <p className="max-w-md text-muted-foreground">
        Reload the page or return to the live lots list.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button onClick={reset}>Try again</Button>
        <Button onClick={() => window.location.reload()} variant="outline">
          Reload
        </Button>
        <Button asChild variant="outline">
          <a href="/">Live lots</a>
        </Button>
      </div>
      {import.meta.env.DEV && error ? (
        <pre className="mt-4 max-w-xl overflow-auto rounded-2xl bg-muted p-3 text-left text-xs text-muted-foreground">
          {error instanceof Error ? error.message : String(error)}
        </pre>
      ) : null}
    </main>
  );
}

function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-sm font-medium text-muted-foreground">404</p>
      <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="max-w-md text-muted-foreground">The page does not exist or has moved.</p>
      <a
        href="/"
        className="rounded-3xl bg-foreground px-4 py-2 text-sm font-medium text-background"
      >
        Live lots
      </a>
    </main>
  );
}
