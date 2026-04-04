import type { AuthState, ServerServices } from "./context";
import { renderPage } from "./responses";
import { MainPage } from "../ui/pages/main-page";

type Tab = "model3" | "modely" | "all";

const TAB_FILTER: Record<Tab, string | null> = {
  model3: "Tesla Model 3",
  modely: "Tesla Model Y",
  all: null,
};

function resolveTab(raw: string | null): Tab {
  if (raw === "modely") return "modely";
  if (raw === "all") return "all";
  return "model3";
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

  const activeTab = resolveTab(url.searchParams.get("tab"));
  const carTypeFilter = TAB_FILTER[activeTab];

  const allLots = services.store.getLotList(false).filter((lot) => lot.workflowState !== "removed");
  const filteredLots = carTypeFilter ? allLots.filter((lot) => lot.carType === carTypeFilter) : allLots;

  return renderPage(
    "Tesla Auctions",
    <MainPage
      activeTab={activeTab}
      allLots={allLots}
      generatedAt={new Date().toISOString()}
      lots={filteredLots}
    />,
  );
}
