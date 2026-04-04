import * as React from "react";
import { hydrateRoot } from "react-dom/client";

import { AppShell } from "./app-shell";
import { renderAppPage, type AppPage } from "./page-registry";

const rootElement = document.getElementById("app-root");
const pageDataElement = document.getElementById("app-page-data");

if (rootElement && pageDataElement?.textContent) {
  const page = JSON.parse(pageDataElement.textContent) as AppPage;
  hydrateRoot(rootElement, <AppShell>{renderAppPage(page)}</AppShell>);
}
