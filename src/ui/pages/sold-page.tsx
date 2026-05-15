import * as React from "react";
import {
  ArrowUpDown,
  CalendarDays,
  DollarSign,
  ExternalLink,
  FileText,
  MapPin,
  Search,
} from "lucide-react";

import type { SoldPriceExplorerData, SoldPriceExplorerItem } from "../../lib/types";
import { Badge } from "../components/badge";
import { Button } from "../components/button";
import { Input } from "../components/input";
import { LotImagePreview } from "../components/lot-image-preview";
import { Select } from "../components/select";
import { LocalizedDateText } from "../date-render";
import { cn } from "../lib";
import {
  extractLotColor,
  formatPercent,
  formatSignedUsd,
  formatUsd,
  stripTeslaPrefix,
} from "../format";

export type SoldPageProps = SoldPriceExplorerData;

function saleDateLabel(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return value;
  }
  return new Date(parsed).toISOString().slice(0, 10);
}

function outlierVariant(outlier: SoldPriceExplorerItem["stats"]["outlier"]): "warning" | "success" | "muted" {
  if (outlier === "high") {
    return "warning";
  }
  if (outlier === "low") {
    return "success";
  }
  return "muted";
}

function outlierLabel(outlier: SoldPriceExplorerItem["stats"]["outlier"]): string {
  if (outlier === "high") {
    return "High outlier";
  }
  if (outlier === "low") {
    return "Low outlier";
  }
  return "Normal";
}

function outlierToneClass(outlier: SoldPriceExplorerItem["stats"]["outlier"]): string {
  if (outlier === "high") {
    return "bg-amber-500/10 ring-amber-500/20";
  }
  if (outlier === "low") {
    return "bg-emerald-500/10 ring-emerald-500/20";
  }
  return "bg-card/70 ring-border/70";
}

function lotTitle(item: SoldPriceExplorerItem): string {
  const title = stripTeslaPrefix(item.carType);
  return item.modelYear ? `${item.modelYear} ${title}` : title;
}

function lotHref(item: SoldPriceExplorerItem): string {
  return `/lots/${item.sourceKey}/${item.lotNumber}`;
}

function lotDetails(item: SoldPriceExplorerItem): string {
  const color = item.soldPrice.color || item.color || extractLotColor(item.evidence);
  return [
    color,
    item.soldPrice.condition,
    item.soldPrice.damage || item.soldPrice.secondaryDamage,
    item.soldPrice.mileage,
    item.soldPrice.documents,
  ]
    .filter(Boolean)
    .join(" · ") || "—";
}

function lotLocation(item: SoldPriceExplorerItem): string {
  return item.soldPrice.location || item.location || "—";
}

function absoluteDelta(item: SoldPriceExplorerItem): number {
  return Math.abs(item.stats.deltaUsd ?? 0);
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function SoldLotActions({
  className,
  fullWidth = false,
  item,
}: {
  className?: string;
  fullWidth?: boolean;
  item: SoldPriceExplorerItem;
}) {
  const actionClassName = cn("h-7 gap-1.5 rounded-xl px-2 text-[11px]", fullWidth && "min-w-0 flex-1");

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <Button asChild className={actionClassName} size="sm" type="button" variant="outline">
        <a href={lotHref(item)}>
          <FileText className="size-3.5" />
          Lot
        </a>
      </Button>
      <Button asChild className={actionClassName} size="sm" type="button" variant="outline">
        <a href={item.url} rel="noopener noreferrer" target="_blank">
          {item.sourceLabel}
          <ExternalLink className="size-3.5" />
        </a>
      </Button>
    </div>
  );
}

function activeFilterCount(filters: SoldPageProps["filters"]): number {
  return [
    filters.q,
    filters.model !== "all",
    filters.source !== "all",
    filters.year !== "all",
    filters.minPrice,
    filters.maxPrice,
    filters.highlightedOnly,
    filters.sort !== "sale-desc",
  ].filter(Boolean).length;
}

function selectedOptionLabel(
  options: Array<{ key: string; label: string }>,
  key: string,
  fallback: string,
): string {
  if (key === "all") {
    return fallback;
  }
  return options.find((option) => option.key === key)?.label ?? key;
}

function selectedYearLabel(year: string): string {
  return year === "all" ? "All years" : year;
}

function sortLabel(sort: string): string {
  switch (sort) {
    case "price-desc":
      return "Price high";
    case "price-asc":
      return "Price low";
    case "delta-desc":
      return "Delta high";
    case "delta-asc":
      return "Delta low";
    default:
      return "Newest sale";
  }
}

function topOutliers(items: SoldPriceExplorerItem[]): SoldPriceExplorerItem[] {
  return items
    .filter((item) => item.stats.outlier)
    .sort((left, right) => absoluteDelta(right) - absoluteDelta(left));
}

function PageHeader({ props }: { props: SoldPageProps }) {
  const filtersApplied = activeFilterCount(props.filters);
  const cohortCount = new Set(props.items.map((item) => item.stats.groupLabel)).size;

  return (
    <header className="grid gap-5 border-b border-border/70 pb-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">
            {formatCount(props.items.length)} shown
          </Badge>
          <Badge variant="muted">
            {formatCount(cohortCount)} model cohort{cohortCount === 1 ? "" : "s"}
          </Badge>
          {filtersApplied ? (
            <Badge variant="muted">
              {filtersApplied} filter{filtersApplied === 1 ? "" : "s"}
            </Badge>
          ) : null}
        </div>
        <div className="grid gap-2">
          <h1 className="max-w-[12ch] text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            Sold lots
          </h1>
          <p className="max-w-[68ch] text-base text-muted-foreground text-pretty sm:text-sm">
            Cleared auction prices, cohort medians, and outliers for the vehicles already matched by the collector.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
        <Button asChild size="sm" type="button" variant="outline">
          <a href="#sold-results">
            Results
          </a>
        </Button>
      </div>
    </header>
  );
}

function FilterField({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-base text-muted-foreground sm:text-sm">{label}</span>
      {children}
    </label>
  );
}

function AppliedFilters({ props }: { props: SoldPageProps }) {
  const { filters, options } = props;
  const filtersApplied = activeFilterCount(filters);

  if (!filtersApplied) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="muted">
        {selectedOptionLabel(options.models, filters.model, "All models")}
      </Badge>
      <Badge variant="muted">
        {selectedOptionLabel(options.sources, filters.source, "All sources")}
      </Badge>
      <Badge variant="muted">{selectedYearLabel(filters.year)}</Badge>
      {filters.minPrice || filters.maxPrice ? (
        <Badge variant="muted">
          {filters.minPrice ? `$${filters.minPrice}+` : "No minimum"} · {filters.maxPrice ? `up to $${filters.maxPrice}` : "No maximum"}
        </Badge>
      ) : null}
      {filters.q ? <Badge variant="muted">Search {filters.q}</Badge> : null}
      {filters.highlightedOnly ? <Badge variant="warning">Outliers only</Badge> : null}
      {filters.sort !== "sale-desc" ? <Badge variant="muted">{sortLabel(filters.sort)}</Badge> : null}
    </div>
  );
}

function SoldFilters({ props }: { props: SoldPageProps }) {
  const { filters, options } = props;

  return (
    <section className="rounded-3xl border border-border/70 bg-card/70 p-3 shadow-[0_18px_70px_-58px_rgba(18,18,18,0.45)] @container">
      <form action="/sold" className="grid gap-3" method="get">
        <div className="grid gap-3 @5xl:grid-cols-[minmax(16rem,2.1fr)_repeat(6,minmax(0,1fr))]">
          <label className="grid gap-1.5">
            <span className="text-base text-muted-foreground sm:text-sm">Search</span>
            <span className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground sm:size-4" />
              <Input
                aria-label="Search sold results"
                className="h-11 pl-10 text-base sm:h-9 sm:text-sm"
                defaultValue={filters.q}
                name="q"
                placeholder="Damage, location, lot, VIN"
              />
            </span>
          </label>
          <FilterField label="Model">
            <Select aria-label="Model" className="h-11 rounded-3xl bg-input/50 px-3 text-base sm:h-9 sm:text-sm" defaultValue={filters.model} name="model">
              <option value="all">All models</option>
              {options.models.map((model) => (
                <option key={model.key} value={model.key}>{model.label}</option>
              ))}
            </Select>
          </FilterField>
          <FilterField label="Source">
            <Select aria-label="Source" className="h-11 rounded-3xl bg-input/50 px-3 text-base sm:h-9 sm:text-sm" defaultValue={filters.source} name="source">
              <option value="all">All sources</option>
              {options.sources.map((source) => (
                <option key={source.key} value={source.key}>{source.label}</option>
              ))}
            </Select>
          </FilterField>
          <FilterField label="Year">
            <Select aria-label="Year" className="h-11 rounded-3xl bg-input/50 px-3 text-base sm:h-9 sm:text-sm" defaultValue={filters.year} name="year">
              <option value="all">All years</option>
              {options.years.map((year) => (
                <option key={year} value={year}>{year}</option>
              ))}
            </Select>
          </FilterField>
          <FilterField label="Minimum">
            <Input aria-label="Minimum price" className="h-11 text-base sm:h-9 sm:text-sm" defaultValue={filters.minPrice} inputMode="numeric" name="minPrice" placeholder="$ min" />
          </FilterField>
          <FilterField label="Maximum">
            <Input aria-label="Maximum price" className="h-11 text-base sm:h-9 sm:text-sm" defaultValue={filters.maxPrice} inputMode="numeric" name="maxPrice" placeholder="$ max" />
          </FilterField>
          <FilterField label="Sort">
            <Select aria-label="Sort" className="h-11 rounded-3xl bg-input/50 px-3 text-base sm:h-9 sm:text-sm" defaultValue={filters.sort} name="sort">
              <option value="sale-desc">Newest sale</option>
              <option value="price-desc">Price high</option>
              <option value="price-asc">Price low</option>
              <option value="delta-desc">Delta high</option>
              <option value="delta-asc">Delta low</option>
            </Select>
          </FilterField>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-3">
          <label className="inline-flex items-center gap-2 text-base text-muted-foreground sm:text-sm">
            <input
              className="size-5 rounded border-border bg-background text-foreground sm:size-4"
              defaultChecked={filters.highlightedOnly}
              name="highlighted"
              type="checkbox"
              value="1"
            />
            Outliers only
          </label>
          <div className="flex items-center gap-2">
            <Button asChild size="sm" type="button" variant="outline">
              <a href="/sold">Clear</a>
            </Button>
            <Button size="sm" type="submit">
              Apply
            </Button>
          </div>
        </div>
        <AppliedFilters props={props} />
      </form>
    </section>
  );
}

function PriceDelta({ item, align = "right" }: { item: SoldPriceExplorerItem; align?: "left" | "right" }) {
  return (
    <div className={cn("grid gap-1", align === "right" && "text-right")}>
      <div className="font-semibold tabular-nums">{formatUsd(item.soldPrice.finalBidUsd)}</div>
      <div className={cn("flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground", align === "right" ? "justify-end" : "justify-start")}>
        <Badge variant={outlierVariant(item.stats.outlier)}>{outlierLabel(item.stats.outlier)}</Badge>
        <span className="tabular-nums">
          {formatSignedUsd(item.stats.deltaUsd)} · {formatPercent(item.stats.deltaPercent)}
        </span>
      </div>
      <div className="text-sm tabular-nums text-muted-foreground">
        Median {formatUsd(item.stats.medianUsd)} · {item.stats.groupCount} lot{item.stats.groupCount === 1 ? "" : "s"}
      </div>
    </div>
  );
}

function OutlierLots({ items }: { items: SoldPriceExplorerItem[] }) {
  const outliers = topOutliers(items);

  if (!outliers.length) {
    return null;
  }

  return (
    <section className="grid gap-3 border-y border-border/70 py-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-balance">Outliers</h2>
          <p className="text-base text-muted-foreground sm:text-sm">
            {formatCount(outliers.length)} outside the same-source, same-model, same-year range.
          </p>
        </div>
        <Badge variant="muted">Sorted by delta</Badge>
      </div>

      <div className="-mx-3 -my-2 overflow-x-auto whitespace-nowrap sm:-mx-5">
        <div className="inline-block min-w-full px-3 py-2 align-middle sm:px-5">
          <table className="w-full text-left text-base sm:text-sm">
            <thead>
              <tr className="border-b border-border/70 text-muted-foreground">
                <th className="whitespace-nowrap py-3 pr-3 font-medium">Lot</th>
                <th className="whitespace-nowrap px-3 py-3 font-medium">Vehicle</th>
                <th className="whitespace-nowrap px-3 py-3 text-right font-medium">Price check</th>
                <th className="whitespace-nowrap px-3 py-3 font-medium">Cohort</th>
                <th className="whitespace-nowrap px-3 py-3 font-medium">Sale</th>
                <th className="whitespace-nowrap px-3 py-3 font-medium">Location</th>
                <th className="whitespace-nowrap py-3 pl-3 text-right font-medium">Links</th>
              </tr>
            </thead>
            <tbody>
              {outliers.map((item) => (
                <tr
                  className={cn("border-b border-border/70", outlierToneClass(item.stats.outlier))}
                  key={item.soldPrice.id}
                >
                  <td className="py-3 pr-3 align-middle">
                    <div className="flex items-center gap-3">
                      <LotImagePreview
                        lot={item}
                        placeholderClassName="h-16 w-28 rounded-2xl text-[11px]"
                        thumbClassName="h-16 w-28 rounded-2xl bg-muted/30"
                      />
                      <div>
                        <a className="font-medium text-foreground underline-offset-2 hover:underline" href={lotHref(item)}>
                          Lot {item.lotNumber}
                        </a>
                        <div className="text-base text-muted-foreground sm:text-sm">{item.sourceLabel}</div>
                      </div>
                    </div>
                  </td>
                  <td className="min-w-72 px-3 py-3 align-middle">
                    <div className="font-medium text-foreground">{lotTitle(item)}</div>
                    <div className="text-base text-muted-foreground sm:text-sm">{lotDetails(item)}</div>
                    {item.vin ? <div className="text-sm text-muted-foreground">{item.vin}</div> : null}
                  </td>
                  <td className="px-3 py-3 text-right align-middle">
                    <PriceDelta item={item} />
                  </td>
                  <td className="px-3 py-3 align-middle">
                    <Badge variant={outlierVariant(item.stats.outlier)}>{outlierLabel(item.stats.outlier)}</Badge>
                    <div className="mt-1 text-base text-muted-foreground sm:text-sm">{item.stats.groupLabel}</div>
                  </td>
                  <td className="px-3 py-3 align-middle">
                    <div className="tabular-nums">{saleDateLabel(item.soldPrice.saleDate)}</div>
                    {item.soldPrice.foundAt ? (
                      <LocalizedDateText
                        className="text-base text-muted-foreground sm:text-sm"
                        emptyLabel=""
                        format="timestamp"
                        iso={item.soldPrice.foundAt}
                      />
                    ) : null}
                  </td>
                  <td className="px-3 py-3 align-middle">{lotLocation(item)}</td>
                  <td className="py-3 pl-3 text-right align-middle">
                    <SoldLotActions className="justify-end" item={item} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function MobileResultCard({ item }: { item: SoldPriceExplorerItem }) {
  return (
    <article className={cn("grid gap-4 rounded-3xl p-3 ring-1", outlierToneClass(item.stats.outlier))}>
      <div className="grid grid-cols-[auto_1fr] gap-3">
        <LotImagePreview
          lot={item}
          placeholderClassName="h-24 w-32 rounded-2xl text-[11px]"
          thumbClassName="h-24 w-32 rounded-2xl bg-muted/30"
        />
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <a className="font-medium text-foreground underline-offset-2 hover:underline" href={lotHref(item)}>
                Lot {item.lotNumber}
              </a>
              <p className="text-base text-muted-foreground sm:text-sm">{item.sourceLabel}</p>
            </div>
            <Badge variant={outlierVariant(item.stats.outlier)}>{outlierLabel(item.stats.outlier)}</Badge>
          </div>
          <div className="grid gap-1 pt-3">
            <h3 className="text-lg font-semibold tracking-tight">{lotTitle(item)}</h3>
            <p className="text-base text-muted-foreground">{lotDetails(item)}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 border-t border-border/70 pt-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="flex items-center gap-1.5 text-base text-muted-foreground sm:text-sm">
              <DollarSign className="size-5 sm:size-4" />
              Price
            </div>
            <PriceDelta align="left" item={item} />
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-base text-muted-foreground sm:text-sm">
              <CalendarDays className="size-5 sm:size-4" />
              Sale
            </div>
            <div className="font-medium tabular-nums">{saleDateLabel(item.soldPrice.saleDate)}</div>
            {item.soldPrice.foundAt ? (
              <LocalizedDateText
                className="text-base text-muted-foreground sm:text-sm"
                emptyLabel=""
                format="timestamp"
                iso={item.soldPrice.foundAt}
              />
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-base text-muted-foreground sm:text-sm">
          <MapPin className="size-5 sm:size-4" />
          <span className="truncate">{lotLocation(item)}</span>
        </div>
        <SoldLotActions fullWidth item={item} />
      </div>
    </article>
  );
}

function ResultsTable({ items }: { items: SoldPriceExplorerItem[] }) {
  return (
    <div className="-mx-3 -my-2 hidden overflow-x-auto whitespace-nowrap sm:-mx-5 lg:block">
      <div className="inline-block min-w-full px-3 py-2 align-middle sm:px-5">
        <table className="w-full text-left text-base sm:text-sm">
          <thead>
            <tr className="border-b border-border/70 text-muted-foreground">
              <th className="whitespace-nowrap py-3 pr-3 font-medium">Lot</th>
              <th className="whitespace-nowrap px-3 py-3 font-medium">Vehicle</th>
              <th className="whitespace-nowrap px-3 py-3 text-right font-medium">Price check</th>
              <th className="whitespace-nowrap px-3 py-3 font-medium">Sale</th>
              <th className="whitespace-nowrap px-3 py-3 font-medium">Location</th>
              <th className="whitespace-nowrap py-3 pl-3 text-right font-medium">Links</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr className={cn("border-b border-border/70", item.stats.outlier && outlierToneClass(item.stats.outlier))} key={item.soldPrice.id}>
                <td className="py-3 pr-3 align-middle">
                  <div className="flex items-center gap-3">
                    <LotImagePreview
                      lot={item}
                      placeholderClassName="h-16 w-28 rounded-2xl text-[11px]"
                      thumbClassName="h-16 w-28 rounded-2xl bg-muted/30"
                    />
                    <div>
                      <a className="font-medium text-foreground underline-offset-2 hover:underline" href={lotHref(item)}>
                        Lot {item.lotNumber}
                      </a>
                      <div className="text-base text-muted-foreground sm:text-sm">{item.sourceLabel}</div>
                    </div>
                  </div>
                </td>
                <td className="min-w-72 px-3 py-3 align-middle">
                  <div className="font-medium text-foreground">{lotTitle(item)}</div>
                  <div className="text-base text-muted-foreground sm:text-sm">{lotDetails(item)}</div>
                  {item.vin ? <div className="text-sm text-muted-foreground">{item.vin}</div> : null}
                </td>
                <td className="px-3 py-3 text-right align-middle">
                  <PriceDelta item={item} />
                </td>
                <td className="px-3 py-3 align-middle">
                  <div className="tabular-nums">{saleDateLabel(item.soldPrice.saleDate)}</div>
                  {item.soldPrice.foundAt ? (
                    <LocalizedDateText
                      className="text-base text-muted-foreground sm:text-sm"
                      emptyLabel=""
                      format="timestamp"
                      iso={item.soldPrice.foundAt}
                    />
                  ) : null}
                </td>
                <td className="px-3 py-3 align-middle">
                  <div>{lotLocation(item)}</div>
                  <div className="text-base text-muted-foreground sm:text-sm">{item.stats.groupLabel}</div>
                </td>
                <td className="py-3 pl-3 text-right align-middle">
                  <SoldLotActions className="justify-end" item={item} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SoldResults({ items }: { items: SoldPriceExplorerItem[] }) {
  return (
    <section className="grid gap-3" id="sold-results">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-balance">Results</h2>
          <p className="text-base text-muted-foreground sm:text-sm">
            {formatCount(items.length)} sold lot{items.length === 1 ? "" : "s"} in this view.
          </p>
        </div>
        <div className="flex items-center gap-2 text-base text-muted-foreground sm:text-sm">
          <ArrowUpDown className="size-5 sm:size-4" />
          Sorted by current filter
        </div>
      </div>

      {items.length ? (
        <>
          <div className="grid gap-3 lg:hidden">
            {items.map((item) => (
              <MobileResultCard item={item} key={item.soldPrice.id} />
            ))}
          </div>
          <ResultsTable items={items} />
        </>
      ) : (
        <div className="rounded-3xl border border-border/70 bg-card/65 px-4 py-12 text-center text-base text-muted-foreground sm:text-sm">
          No sold results match these filters.
        </div>
      )}
    </section>
  );
}

export function SoldPage(props: SoldPageProps) {
  return (
    <main className="isolate min-h-dvh bg-background px-3 py-5 text-foreground antialiased sm:px-5 sm:py-7">
      <div className="mx-auto flex max-w-[1320px] flex-col gap-6">
        <PageHeader props={props} />
        <SoldFilters props={props} />

        <div className="grid gap-6">
          <OutlierLots items={props.items} />
          <SoldResults items={props.items} />
        </div>
      </div>
    </main>
  );
}
