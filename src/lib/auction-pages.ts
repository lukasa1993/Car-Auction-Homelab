import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import type {
  LotDetail,
  SoldPriceExplorerData,
  SoldPriceExplorerFilters,
  SoldPriceExplorerItem,
  SoldPriceSummary,
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
  return values.length % 2 === 1 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
}

function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase();
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
    const allLots = await store.getPublicLotList();
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
  .inputValidator((data: { error?: string | null } | undefined) => data ?? {})
  .handler(async ({ data }) => {
    const request = getRequest();
    const { ensureBootstrapAdminUser, getAuthState } = await import("@/lib/auth");
    await ensureBootstrapAdminUser();
    const auth = await getAuthState(request);
    return {
      redirectTo: auth.admin && auth.email ? "/admin" : null,
      error: data?.error ?? null,
    };
  });
