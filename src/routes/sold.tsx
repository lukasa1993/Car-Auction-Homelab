import { createFileRoute } from "@tanstack/react-router";
import type { SoldPriceExplorerFilters } from "@/lib/types";
import { getSoldPageData } from "@/lib/auction-pages";
import { SoldPage } from "@/ui/pages/sold-page";

function normalizeFilters(search: Record<string, unknown>): SoldPriceExplorerFilters {
  return {
    model: typeof search.model === "string" ? search.model : "all",
    source: typeof search.source === "string" ? search.source : "all",
    year: typeof search.year === "string" ? search.year : "all",
    minPrice: typeof search.minPrice === "string" ? search.minPrice : "",
    maxPrice: typeof search.maxPrice === "string" ? search.maxPrice : "",
    q: typeof search.q === "string" ? search.q : "",
    highlightedOnly: search.highlighted === "1",
    sort: typeof search.sort === "string" ? search.sort : "sale-desc",
  };
}

export const Route = createFileRoute("/sold")({
  validateSearch: normalizeFilters,
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => await getSoldPageData({ data: deps }),
  component: Sold,
});

function Sold() {
  const props = Route.useLoaderData();
  return <SoldPage {...props} />;
}
