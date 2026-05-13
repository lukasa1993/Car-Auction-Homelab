import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import type {
  LotDetail,
  SoldPriceExplorerAnalytics,
  SoldPriceExplorerData,
  SoldPriceExplorerFilters,
  SoldPriceExplorerItem,
  SoldPriceExplorerSummary,
  VinTarget,
} from "@/lib/types";

function stripTeslaPrefix(value: string): string {
  return value.replace(/^Tesla\s+/, "");
}

function buildModelTabs(targets: VinTarget[]) {
  const grouped = new Map<
    string,
    { key: string; label: string; targetKeys: Set<string>; carTypes: Set<string> }
  >();
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

function resolveTab(raw: string | null | undefined, availableTabs: Array<{ key: string }>): string {
  if (raw === "all") {
    return "all";
  }
  return availableTabs.some((tab) => tab.key === raw) ? String(raw) : "all";
}

function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase();
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function priceValues(items: SoldPriceExplorerItem[]): number[] {
  return items
    .map((item) => item.soldPrice.finalBidUsd)
    .filter((value): value is number => value != null && Number.isFinite(value));
}

function latestSaleDate(items: SoldPriceExplorerItem[]): string | null {
  let latestMs = Number.NEGATIVE_INFINITY;
  let latestValue: string | null = null;
  for (const item of items) {
    const value = item.soldPrice.saleDate || item.soldPrice.foundAt || item.updatedAt;
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed) && parsed > latestMs) {
      latestMs = parsed;
      latestValue = value;
    }
  }
  return latestValue;
}

function buildPriceSummary(items: SoldPriceExplorerItem[]): SoldPriceExplorerSummary {
  const values = priceValues(items);
  const totalUsd = values.reduce((total, value) => total + value, 0);
  return {
    lotCount: items.length,
    averageUsd: values.length ? totalUsd / values.length : null,
    medianUsd: median(values),
    minUsd: values.length ? Math.min(...values) : null,
    maxUsd: values.length ? Math.max(...values) : null,
    totalUsd,
    outlierCount: items.filter((item) => item.stats.outlier).length,
    modelCount: new Set(items.map((item) => item.carType)).size,
    sourceCount: new Set(items.map((item) => item.sourceKey)).size,
    latestSaleDate: latestSaleDate(items),
  };
}

function buildSoldExplorerAnalytics(items: SoldPriceExplorerItem[]): SoldPriceExplorerAnalytics {
  const modelGroups = new Map<string, SoldPriceExplorerItem[]>();
  const sourceGroups = new Map<string, SoldPriceExplorerItem[]>();
  for (const item of items) {
    modelGroups.set(item.carType, [...(modelGroups.get(item.carType) ?? []), item]);
    sourceGroups.set(item.sourceKey, [...(sourceGroups.get(item.sourceKey) ?? []), item]);
  }

  const modelAverages = [...modelGroups.entries()]
    .map(([key, group]) => {
      const summary = buildPriceSummary(group);
      return {
        key,
        label: stripTeslaPrefix(key),
        lotCount: summary.lotCount,
        averageUsd: summary.averageUsd,
        medianUsd: summary.medianUsd,
        minUsd: summary.minUsd,
        maxUsd: summary.maxUsd,
        totalUsd: summary.totalUsd,
        outlierCount: summary.outlierCount,
        sourceCount: summary.sourceCount,
        latestSaleDate: summary.latestSaleDate,
      };
    })
    .sort(
      (left, right) =>
        (right.averageUsd ?? 0) - (left.averageUsd ?? 0) ||
        right.lotCount - left.lotCount ||
        left.label.localeCompare(right.label),
    );

  const sourceBreakdown = [...sourceGroups.entries()]
    .map(([key, group]) => {
      const summary = buildPriceSummary(group);
      return {
        key,
        label: group[0]?.sourceLabel ?? key,
        lotCount: summary.lotCount,
        averageUsd: summary.averageUsd,
        medianUsd: summary.medianUsd,
        minUsd: summary.minUsd,
        maxUsd: summary.maxUsd,
        totalUsd: summary.totalUsd,
        modelCount: summary.modelCount,
        outlierCount: summary.outlierCount,
      };
    })
    .sort(
      (left, right) =>
        right.lotCount - left.lotCount ||
        (right.averageUsd ?? 0) - (left.averageUsd ?? 0) ||
        left.label.localeCompare(right.label),
    );

  return {
    summary: buildPriceSummary(items),
    modelAverages,
    sourceBreakdown,
  };
}

async function buildSoldExplorerData(
  filters: SoldPriceExplorerFilters,
): Promise<SoldPriceExplorerData> {
  const { getAuctionStore } = await import("@/lib/auction-services");
  const store = await getAuctionStore();
  const allItems = await store.getSoldPriceExplorerItems();
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
      if (filters.model !== "all" && item.carType !== filters.model) return false;
      if (filters.source !== "all" && item.sourceKey !== filters.source) return false;
      if (filters.year !== "all" && String(item.modelYear || "") !== filters.year) return false;
      const price = item.soldPrice.finalBidUsd ?? 0;
      if (Number.isFinite(minPrice) && minPrice > 0 && price < minPrice) return false;
      if (Number.isFinite(maxPrice) && maxPrice > 0 && price > maxPrice) return false;
      if (filters.highlightedOnly && !item.stats.outlier) return false;
      if (query) {
        const haystack = normalizeSearchText(
          [
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
          ]
            .filter(Boolean)
            .join(" "),
        );
        if (!haystack.includes(query)) return false;
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
          const rightSaleMs = Date.parse(
            right.soldPrice.saleDate || right.soldPrice.foundAt || right.updatedAt,
          );
          const leftSaleMs = Date.parse(
            left.soldPrice.saleDate || left.soldPrice.foundAt || left.updatedAt,
          );
          return rightSaleMs - leftSaleMs;
        }
      }
    });

  return {
    analytics: buildSoldExplorerAnalytics(filtered),
    items: filtered,
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

export const getMainPageData = createServerFn()
  .inputValidator((data: { tab?: string | null }) => data)
  .handler(async ({ data }) => {
    const request = getRequest();
    const [{ getAuthState }, { getAuctionStore }] = await Promise.all([
      import("@/lib/auth"),
      import("@/lib/auction-services"),
    ]);
    const auth = await getAuthState(request);
    const store = await getAuctionStore();
    const modelTabs = buildModelTabs(await store.getVinTargets(true));
    const activeTab = resolveTab(data.tab, modelTabs);
    const activeModelTab =
      activeTab === "all" ? null : modelTabs.find((tab) => tab.key === activeTab) || null;
    const allLots = (await store.getPublicLotList()).filter((lot) => lot.status !== "done");
    const lots = activeModelTab
      ? allLots.filter(
          (lot) =>
            (!!lot.targetKey && activeModelTab.targetKeys.has(lot.targetKey)) ||
            activeModelTab.carTypes.has(lot.carType),
        )
      : allLots;
    return {
      activeTab,
      allLots,
      auth: {
        signedIn: auth.signedIn,
        admin: auth.admin,
        email: auth.email,
      },
      lastCollectorIngestAt: await store.getLatestCollectorIngestAt(),
      lots,
      tabs: modelTabs.map((tab) => ({ key: tab.key, label: tab.label })),
    };
  });

export const getSoldPageData = createServerFn()
  .inputValidator((data: SoldPriceExplorerFilters) => data)
  .handler(async ({ data }) => buildSoldExplorerData(data));

export const getAdminPageData = createServerFn()
  .inputValidator((data: { error?: string | null } | undefined) => data ?? {})
  .handler(async ({ data }) => {
    const request = getRequest();
    const [{ getAuthState }, { getAuctionStore }] = await Promise.all([
      import("@/lib/auth"),
      import("@/lib/auction-services"),
    ]);
    const auth = await getAuthState(request);
    if (!auth.signedIn || !auth.admin || !auth.email) {
      return {
        redirectTo: !auth.signedIn
          ? "/admin/login"
          : "/admin/login?error=Admin%20access%20required",
      } as const;
    }
    const store = await getAuctionStore();
    const historyCount = (await store.getLotList(true)).filter(
      (lot) => lot.workflowState !== "new",
    ).length;
    return {
      redirectTo: null,
      email: auth.email,
      error: data?.error ?? null,
      historyCount,
      targets: await store.getVinTargets(),
    };
  });

export const getAdminHistoryPageData = createServerFn().handler(async () => {
  const request = getRequest();
  const [{ getAuthState }, { getAuctionStore }] = await Promise.all([
    import("@/lib/auth"),
    import("@/lib/auction-services"),
  ]);
  const auth = await getAuthState(request);
  if (!auth.signedIn || !auth.admin || !auth.email) {
    return {
      redirectTo: !auth.signedIn ? "/admin/login" : "/admin/login?error=Admin%20access%20required",
    } as const;
  }
  const store = await getAuctionStore();
  return {
    redirectTo: null,
    email: auth.email,
    lots: (await store.getLotList(true)).filter((lot) => lot.workflowState !== "new"),
  };
});

export const getLotDetailPageData = createServerFn()
  .inputValidator((data: { sourceKey: "copart" | "iaai"; lotNumber: string }) => data)
  .handler(async ({ data }) => {
    const request = getRequest();
    const [{ getAuthState }, { getAuctionStore }] = await Promise.all([
      import("@/lib/auth"),
      import("@/lib/auction-services"),
    ]);
    const auth = await getAuthState(request);
    const store = await getAuctionStore();
    const detail = await store.getLotDetail(data.sourceKey, data.lotNumber);
    return {
      auth: {
        signedIn: auth.signedIn,
        admin: auth.admin,
        email: auth.email,
      },
      detail,
    };
  });

export type LotDetailPageData = {
  auth: {
    signedIn: boolean;
    admin: boolean;
    email: string | null;
  };
  detail: LotDetail | null;
};

export const getLoginPageData = createServerFn()
  .inputValidator(
    (data: { error?: string | null; message?: string | null } | undefined) => data ?? {},
  )
  .handler(async ({ data }) => {
    const request = getRequest();
    const { ensureBootstrapAdminUser, getAuthState } = await import("@/lib/auth");
    await ensureBootstrapAdminUser();
    const auth = await getAuthState(request);
    return {
      redirectTo: auth.admin && auth.email ? "/admin" : null,
      error: data?.error ?? null,
      message: data?.message ?? null,
    };
  });
