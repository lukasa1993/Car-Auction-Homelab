import type { AuthState, ServerServices } from "./context";
import { renderPage } from "./responses";
import { MainPage } from "../ui/pages/main-page";
import type { VinTarget } from "../lib/types";

function stripTeslaPrefix(value: string): string {
  return value.replace(/^Tesla\s+/, "");
}

function buildModelTabs(targets: VinTarget[]) {
  const grouped = new Map<string, { key: string; label: string; targetKeys: Set<string>; carTypes: Set<string> }>();
  for (const target of targets.filter((item) => item.active)) {
    const key = target.carType;
    const existing = grouped.get(key);
    if (existing) {
      existing.targetKeys.add(target.key);
      existing.carTypes.add(target.carType);
      continue;
    }
    grouped.set(key, {
      key,
      label: stripTeslaPrefix(target.carType),
      targetKeys: new Set([target.key]),
      carTypes: new Set([target.carType]),
    });
  }
  return [...grouped.values()];
}

function resolveTab(raw: string | null, availableTabs: Array<{ key: string }>): string {
  if (raw === "all") {
    return "all";
  }
  return availableTabs.some((tab) => tab.key === raw) ? String(raw) : "all";
}

export function handlePublicPages(
  pathname: string,
  url: URL,
  _authState: AuthState,
  services: ServerServices,
): Response | null {
  if (pathname !== "/") {
    return null;
  }

  const modelTabs = buildModelTabs(services.store.getVinTargets(true));
  const activeTab = resolveTab(url.searchParams.get("tab"), modelTabs);
  const activeModelTab = activeTab === "all" ? null : modelTabs.find((tab) => tab.key === activeTab) || null;

  const allLots = services.store.getLotList(false).filter((lot) => lot.workflowState !== "removed");
  const filteredLots = activeModelTab
    ? allLots.filter(
        (lot) =>
          (!!lot.targetKey && activeModelTab.targetKeys.has(lot.targetKey)) ||
          activeModelTab.carTypes.has(lot.carType),
      )
    : allLots;

  return renderPage(
    "Auction Monitor",
    {
      kind: "main",
      props: {
        activeTab,
        allLots,
        generatedAt: new Date().toISOString(),
        lots: filteredLots,
        tabs: modelTabs.map((tab) => ({
          key: tab.key,
          label: tab.label,
        })),
      },
    },
  );
}
