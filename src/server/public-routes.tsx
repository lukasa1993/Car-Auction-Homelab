import type { AuthState, ServerServices } from "./context";
import { renderPage } from "./responses";
import { MainPage } from "../ui/pages/main-page";
import type {
  SoldPriceExplorerData,
  SoldPriceExplorerFilters,
  SoldPriceExplorerItem,
  SoldPriceSummary,
  VinTarget,
} from "../lib/types";

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

function parseSoldFilters(url: URL): SoldPriceExplorerFilters {
  return {
    model: url.searchParams.get("model") || "all",
    source: url.searchParams.get("source") || "all",
    year: url.searchParams.get("year") || "all",
    minPrice: url.searchParams.get("minPrice") || "",
    maxPrice: url.searchParams.get("maxPrice") || "",
    q: url.searchParams.get("q") || "",
    highlightedOnly: url.searchParams.get("highlighted") === "1",
    sort: url.searchParams.get("sort") || "sale-desc",
  };
}

function summarizeSoldItems(items: SoldPriceExplorerItem[]): SoldPriceSummary {
  const values = items
    .map((item) => item.soldPrice.finalBidUsd)
    .filter((value): value is number => value != null && Number.isFinite(value))
    .sort((left, right) => left - right);
  const medianValue = median(values);
  const middle = Math.floor(values.length / 2);
  const lower = values.length % 2 === 0 ? values.slice(0, middle) : values.slice(0, middle);
  const upper = values.length % 2 === 0 ? values.slice(middle) : values.slice(middle + 1);
  return {
    count: items.length,
    medianUsd: medianValue,
    q1Usd: median(lower.length ? lower : values),
    q3Usd: median(upper.length ? upper : values),
    minUsd: values[0] ?? null,
    maxUsd: values[values.length - 1] ?? null,
    outlierCount: items.filter((item) => item.stats.outlier).length,
  };
}

function median(values: number[]): number | null {
  if (!values.length) {
    return null;
  }
  const middle = Math.floor(values.length / 2);
  if (values.length % 2 === 1) {
    return values[middle];
  }
  return (values[middle - 1] + values[middle]) / 2;
}

function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase();
}

function buildSoldExplorerData(services: ServerServices, filters: SoldPriceExplorerFilters): SoldPriceExplorerData {
  const allItems = services.store.getSoldPriceExplorerItems();
  const modelMap = new Map<string, string>();
  const sourceMap = new Map<string, string>();
  const years = new Set<number>();
  for (const item of allItems) {
    modelMap.set(item.carType, stripTeslaPrefix(item.carType));
    sourceMap.set(item.sourceKey, item.sourceLabel);
    if (item.modelYear) {
      years.add(item.modelYear);
    }
  }

  const minPrice = Number(filters.minPrice);
  const maxPrice = Number(filters.maxPrice);
  const query = normalizeSearchText(filters.q);

  const filtered = allItems
    .filter((item) => {
      if (filters.model !== "all" && item.carType !== filters.model) {
        return false;
      }
      if (filters.source !== "all" && item.sourceKey !== filters.source) {
        return false;
      }
      if (filters.year !== "all" && String(item.modelYear || "") !== filters.year) {
        return false;
      }
      const price = item.soldPrice.finalBidUsd ?? 0;
      if (Number.isFinite(minPrice) && minPrice > 0 && price < minPrice) {
        return false;
      }
      if (Number.isFinite(maxPrice) && maxPrice > 0 && price > maxPrice) {
        return false;
      }
      if (filters.highlightedOnly && !item.stats.outlier) {
        return false;
      }
      if (query) {
        const haystack = normalizeSearchText([
          item.carType,
          item.marker,
          item.lotNumber,
          item.vin,
          item.location,
          item.soldPrice.location,
          item.soldPrice.damage,
          item.soldPrice.secondaryDamage,
          item.soldPrice.condition,
          item.soldPrice.documents,
          item.soldPrice.seller,
        ].filter(Boolean).join(" "));
        if (!haystack.includes(query)) {
          return false;
        }
      }
      return true;
    })
    .sort((left, right) => {
      switch (filters.sort) {
        case "price-asc":
          return (left.soldPrice.finalBidUsd ?? 0) - (right.soldPrice.finalBidUsd ?? 0);
        case "price-desc":
          return (right.soldPrice.finalBidUsd ?? 0) - (left.soldPrice.finalBidUsd ?? 0);
        case "delta-asc":
          return (left.stats.deltaUsd ?? 0) - (right.stats.deltaUsd ?? 0);
        case "delta-desc":
          return (right.stats.deltaUsd ?? 0) - (left.stats.deltaUsd ?? 0);
        default: {
          const rightSaleMs = Date.parse(right.soldPrice.saleDate || right.soldPrice.foundAt || right.updatedAt);
          const leftSaleMs = Date.parse(left.soldPrice.saleDate || left.soldPrice.foundAt || left.updatedAt);
          return rightSaleMs - leftSaleMs;
        }
      }
    });

  return {
    items: filtered,
    summary: summarizeSoldItems(filtered),
    filters,
    options: {
      models: [...modelMap.entries()]
        .map(([key, label]) => ({ key, label }))
        .sort((left, right) => left.label.localeCompare(right.label)),
      sources: [...sourceMap.entries()]
        .map(([key, label]) => ({ key, label }))
        .sort((left, right) => left.label.localeCompare(right.label)),
      years: [...years].sort((left, right) => right - left),
    },
  };
}

export function handlePublicPages(
  request: Request,
  pathname: string,
  url: URL,
  authState: AuthState,
  services: ServerServices,
): Response | null {
  if (pathname === "/sold" && request.method === "GET") {
    return renderPage(
      "Sold Explorer",
      {
        kind: "sold",
        props: buildSoldExplorerData(services, parseSoldFilters(url)),
      },
      request,
      authState.admin,
    );
  }

  if (pathname !== "/") {
    return null;
  }

  const modelTabs = buildModelTabs(services.store.getVinTargets(true));
  const activeTab = resolveTab(url.searchParams.get("tab"), modelTabs);
  const activeModelTab = activeTab === "all" ? null : modelTabs.find((tab) => tab.key === activeTab) || null;

  const allLots = services.store.getPublicLotList();
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
        auth: {
          signedIn: authState.signedIn,
          admin: authState.admin,
          email: authState.email,
        },
        lastCollectorIngestAt: services.store.getLatestCollectorIngestAt(),
        lots: filteredLots,
        tabs: modelTabs.map((tab) => ({
          key: tab.key,
          label: tab.label,
        })),
      },
    },
    request,
    authState.admin,
  );
}
