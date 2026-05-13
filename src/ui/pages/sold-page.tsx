import * as React from "react";
import { ExternalLink } from "lucide-react";

import type { SoldPriceExplorerData, SoldPriceExplorerItem } from "../../lib/types";
import { Badge } from "../components/badge";
import { Button } from "../components/button";
import { Input } from "../components/input";
import { LotImagePreview } from "../components/lot-image-preview";
import { Select } from "../components/select";
import { LocalizedDateText } from "../date-render";
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

function outlierRowClass(outlier: SoldPriceExplorerItem["stats"]["outlier"]): string {
  if (outlier === "high") {
    return "bg-amber-500/5";
  }
  if (outlier === "low") {
    return "bg-emerald-500/5";
  }
  return "";
}

function buildFilterAction(filters: SoldPageProps["filters"], overrides: Partial<SoldPageProps["filters"]>): string {
  const next = { ...filters, ...overrides };
  const params = new URLSearchParams();
  if (next.model && next.model !== "all") params.set("model", next.model);
  if (next.source && next.source !== "all") params.set("source", next.source);
  if (next.year && next.year !== "all") params.set("year", next.year);
  if (next.minPrice) params.set("minPrice", next.minPrice);
  if (next.maxPrice) params.set("maxPrice", next.maxPrice);
  if (next.q) params.set("q", next.q);
  if (next.highlightedOnly) params.set("highlighted", "1");
  if (next.sort && next.sort !== "sale-desc") params.set("sort", next.sort);
  const query = params.toString();
  return query ? `/sold?${query}` : "/sold";
}

function lotTitle(item: SoldPriceExplorerItem): string {
  const title = stripTeslaPrefix(item.carType);
  return item.modelYear ? `${item.modelYear} ${title}` : title;
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

function absoluteDelta(item: SoldPriceExplorerItem): number {
  return Math.abs(item.stats.deltaUsd ?? 0);
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatPriceRange(minUsd: number | null, maxUsd: number | null): string {
  if (minUsd == null || maxUsd == null) {
    return "—";
  }
  if (minUsd === maxUsd) {
    return formatUsd(minUsd);
  }
  return `${formatUsd(minUsd)}–${formatUsd(maxUsd)}`;
}

function MetricTile({
  detail,
  label,
  value,
}: {
  detail: string;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-border/70 p-3">
      <div className="truncate text-sm text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      <div className="mt-1 truncate text-sm text-muted-foreground">{detail}</div>
    </div>
  );
}

function AnalyticsSummary({ props }: { props: SoldPageProps }) {
  const { summary } = props.analytics;
  return (
    <div className="grid gap-2 @2xl:grid-cols-4">
      <MetricTile
        detail={`${formatCount(summary.lotCount)} sold · ${formatCount(summary.modelCount)} model${summary.modelCount === 1 ? "" : "s"}`}
        label="Average sale"
        value={formatUsd(summary.averageUsd)}
      />
      <MetricTile
        detail={`Range ${formatPriceRange(summary.minUsd, summary.maxUsd)}`}
        label="Median sale"
        value={formatUsd(summary.medianUsd)}
      />
      <MetricTile
        detail={`${formatCount(summary.sourceCount)} source${summary.sourceCount === 1 ? "" : "s"} · latest ${saleDateLabel(summary.latestSaleDate)}`}
        label="Sales volume"
        value={formatUsd(summary.totalUsd)}
      />
      <MetricTile
        detail={`${formatCount(summary.outlierCount)} outside cohort range`}
        label="Outliers"
        value={formatCount(summary.outlierCount)}
      />
    </div>
  );
}

function ModelAveragesTable({ props }: { props: SoldPageProps }) {
  const rows = props.analytics.modelAverages;

  return (
    <section className="grid gap-2">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">Per model averages</h2>
          <p className="text-base text-muted-foreground sm:text-sm">
            Average, median, range, and sale depth for the current sold view.
          </p>
        </div>
      </div>
      <div className="-mx-3 -my-2 overflow-x-auto whitespace-nowrap sm:-mx-5">
        <div className="inline-block min-w-full px-3 py-2 align-middle sm:px-5">
          <table className="w-full text-left text-base sm:text-sm">
            <thead>
              <tr className="border-b border-border/70 text-muted-foreground">
                <th className="whitespace-nowrap py-3 pr-3 font-medium">Model</th>
                <th className="whitespace-nowrap px-3 py-3 text-right font-medium">Lots</th>
                <th className="whitespace-nowrap px-3 py-3 text-right font-medium">Average</th>
                <th className="whitespace-nowrap px-3 py-3 text-right font-medium">Median</th>
                <th className="whitespace-nowrap px-3 py-3 text-right font-medium">Range</th>
                <th className="whitespace-nowrap px-3 py-3 text-right font-medium">Volume</th>
                <th className="whitespace-nowrap py-3 pl-3 text-right font-medium">Latest</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr className="border-b border-border/70" key={row.key}>
                  <td className="py-3 pr-3 align-middle">
                    <div className="font-medium text-foreground">{row.label}</div>
                    <div className="text-base text-muted-foreground sm:text-sm">
                      {formatCount(row.sourceCount)} source{row.sourceCount === 1 ? "" : "s"} · {formatCount(row.outlierCount)} outlier{row.outlierCount === 1 ? "" : "s"}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right align-middle tabular-nums">{formatCount(row.lotCount)}</td>
                  <td className="px-3 py-3 text-right align-middle font-medium tabular-nums">{formatUsd(row.averageUsd)}</td>
                  <td className="px-3 py-3 text-right align-middle tabular-nums">{formatUsd(row.medianUsd)}</td>
                  <td className="px-3 py-3 text-right align-middle tabular-nums">{formatPriceRange(row.minUsd, row.maxUsd)}</td>
                  <td className="px-3 py-3 text-right align-middle tabular-nums">{formatUsd(row.totalUsd)}</td>
                  <td className="py-3 pl-3 text-right align-middle tabular-nums">{saleDateLabel(row.latestSaleDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 ? (
            <div className="border-b border-border/70 py-8 text-center text-base text-muted-foreground sm:text-sm">
              No model averages for these filters.
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function SourceBreakdownTable({ props }: { props: SoldPageProps }) {
  const rows = props.analytics.sourceBreakdown;

  return (
    <section className="grid gap-2">
      <div>
        <h2 className="text-base font-semibold">Source breakdown</h2>
        <p className="text-base text-muted-foreground sm:text-sm">
          Compare average price and model coverage by auction source.
        </p>
      </div>
      <div className="-mx-3 -my-2 overflow-x-auto whitespace-nowrap sm:-mx-5">
        <div className="inline-block min-w-full px-3 py-2 align-middle sm:px-5">
          <table className="w-full text-left text-base sm:text-sm">
            <thead>
              <tr className="border-b border-border/70 text-muted-foreground">
                <th className="whitespace-nowrap py-3 pr-3 font-medium">Source</th>
                <th className="whitespace-nowrap px-3 py-3 text-right font-medium">Lots</th>
                <th className="whitespace-nowrap px-3 py-3 text-right font-medium">Average</th>
                <th className="whitespace-nowrap px-3 py-3 text-right font-medium">Median</th>
                <th className="whitespace-nowrap px-3 py-3 text-right font-medium">Range</th>
                <th className="whitespace-nowrap py-3 pl-3 text-right font-medium">Models</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr className="border-b border-border/70" key={row.key}>
                  <td className="py-3 pr-3 align-middle font-medium text-foreground">{row.label}</td>
                  <td className="px-3 py-3 text-right align-middle tabular-nums">{formatCount(row.lotCount)}</td>
                  <td className="px-3 py-3 text-right align-middle font-medium tabular-nums">{formatUsd(row.averageUsd)}</td>
                  <td className="px-3 py-3 text-right align-middle tabular-nums">{formatUsd(row.medianUsd)}</td>
                  <td className="px-3 py-3 text-right align-middle tabular-nums">{formatPriceRange(row.minUsd, row.maxUsd)}</td>
                  <td className="py-3 pl-3 text-right align-middle tabular-nums">
                    {formatCount(row.modelCount)}
                    {row.outlierCount ? ` · ${formatCount(row.outlierCount)} outlier${row.outlierCount === 1 ? "" : "s"}` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 ? (
            <div className="border-b border-border/70 py-8 text-center text-base text-muted-foreground sm:text-sm">
              No source breakdown for these filters.
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function SoldAnalytics({ props }: { props: SoldPageProps }) {
  return (
    <section className="grid gap-4 border-y border-border/70 py-4 @container">
      <AnalyticsSummary props={props} />
      <ModelAveragesTable props={props} />
      <SourceBreakdownTable props={props} />
    </section>
  );
}

function SoldFilters({ props }: { props: SoldPageProps }) {
  const { filters, options } = props;
  return (
    <form action="/sold" className="grid gap-2 rounded-lg border border-border/70 p-3 @container" method="get">
      <div className="grid gap-2 @3xl:grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_auto]">
        <Input
          aria-label="Search sold results"
          defaultValue={filters.q}
          name="q"
          placeholder="Damage, location, lot, VIN"
        />
        <Select aria-label="Model" defaultValue={filters.model} name="model">
          <option value="all">All models</option>
          {options.models.map((model) => (
            <option key={model.key} value={model.key}>{model.label}</option>
          ))}
        </Select>
        <Select aria-label="Source" defaultValue={filters.source} name="source">
          <option value="all">All sources</option>
          {options.sources.map((source) => (
            <option key={source.key} value={source.key}>{source.label}</option>
          ))}
        </Select>
        <Select aria-label="Year" defaultValue={filters.year} name="year">
          <option value="all">All years</option>
          {options.years.map((year) => (
            <option key={year} value={year}>{year}</option>
          ))}
        </Select>
        <Input aria-label="Minimum price" defaultValue={filters.minPrice} inputMode="numeric" name="minPrice" placeholder="Min $" />
        <Input aria-label="Maximum price" defaultValue={filters.maxPrice} inputMode="numeric" name="maxPrice" placeholder="Max $" />
        <Select aria-label="Sort" defaultValue={filters.sort} name="sort">
          <option value="sale-desc">Newest sale</option>
          <option value="price-desc">Price high</option>
          <option value="price-asc">Price low</option>
          <option value="delta-desc">Delta high</option>
          <option value="delta-asc">Delta low</option>
        </Select>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-base text-muted-foreground sm:text-sm">
          <input
            className="size-4 rounded border-border text-foreground"
            defaultChecked={filters.highlightedOnly}
            name="highlighted"
            type="checkbox"
            value="1"
          />
          Outliers only
        </label>
        <div className="flex items-center gap-2">
          <a href="/sold">
            <Button size="sm" type="button" variant="outline">Clear</Button>
          </a>
          <Button size="sm" type="submit">Apply</Button>
        </div>
      </div>
    </form>
  );
}

function LotPriceDelta({ item }: { item: SoldPriceExplorerItem }) {
  return (
    <div className="grid gap-1">
      <div className="font-semibold tabular-nums">{formatUsd(item.soldPrice.finalBidUsd)}</div>
      <div className="flex flex-wrap items-center justify-end gap-1.5 text-sm text-muted-foreground">
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
  const outliers = items
    .filter((item) => item.stats.outlier)
    .sort((left, right) => absoluteDelta(right) - absoluteDelta(left));

  return (
    <section className="grid gap-3 border-y border-border/70 py-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">Outlier lots</h2>
          <p className="text-base text-muted-foreground sm:text-sm">
            {outliers.length ? `${outliers.length} lot${outliers.length === 1 ? "" : "s"} outside the cohort range` : "No outliers in this view"}
          </p>
        </div>
      </div>
      {outliers.length ? (
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {outliers.slice(0, 12).map((item) => (
            <a
              className={`grid grid-cols-[auto_1fr] gap-3 rounded-lg border border-border/70 p-3 transition-colors hover:bg-accent/60 ${outlierRowClass(item.stats.outlier)}`}
              href={`/lots/${item.sourceKey}/${item.lotNumber}`}
              key={item.soldPrice.id}
            >
              <LotImagePreview
                lot={item}
                placeholderClassName="size-16 rounded-lg"
                thumbClassName="size-16 rounded-lg"
              />
              <div className="min-w-0">
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <div className="truncate font-medium text-foreground">Lot {item.lotNumber}</div>
                  <Badge variant={outlierVariant(item.stats.outlier)}>{outlierLabel(item.stats.outlier)}</Badge>
                </div>
                <div className="mt-1 truncate text-sm text-muted-foreground">{lotTitle(item)}</div>
                <div className="mt-2 flex items-baseline justify-between gap-2">
                  <div className="font-semibold tabular-nums">{formatUsd(item.soldPrice.finalBidUsd)}</div>
                  <div className="text-sm tabular-nums text-muted-foreground">
                    {formatSignedUsd(item.stats.deltaUsd)}
                  </div>
                </div>
              </div>
            </a>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function SoldTable({ items }: { items: SoldPriceExplorerItem[] }) {
  return (
    <div className="-mx-3 -my-2 overflow-x-auto whitespace-nowrap sm:-mx-5">
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
              <tr className={`border-b border-border/70 ${outlierRowClass(item.stats.outlier)}`} key={item.soldPrice.id}>
                <td className="py-3 pr-3 align-middle">
                  <div className="flex items-center gap-3">
                    <LotImagePreview
                      lot={item}
                      placeholderClassName="size-14 rounded-lg"
                      thumbClassName="size-14 rounded-lg"
                    />
                    <div>
                      <a className="font-medium text-foreground underline-offset-2 hover:underline" href={`/lots/${item.sourceKey}/${item.lotNumber}`}>
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
                  <LotPriceDelta item={item} />
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
                  <div>{item.soldPrice.location || item.location || "—"}</div>
                  <div className="text-base text-muted-foreground sm:text-sm">{item.stats.groupLabel}</div>
                </td>
                <td className="py-3 pl-3 text-right align-middle">
                  <div className="flex justify-end gap-2">
                    <a href={item.url} rel="noopener noreferrer" target="_blank">
                      <Button size="sm" type="button" variant="outline">
                        Source
                        <ExternalLink className="size-3.5" />
                      </Button>
                    </a>
                    {item.soldPrice.externalUrl ? (
                      <a href={item.soldPrice.externalUrl} rel="noopener noreferrer" target="_blank">
                        <Button size="sm" type="button" variant="outline">bid.cars</Button>
                      </a>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 ? (
          <div className="border-b border-border/70 py-10 text-center text-base text-muted-foreground sm:text-sm">
            No sold results match these filters.
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function SoldPage(props: SoldPageProps) {
  const activeHighlightedHref = buildFilterAction(props.filters, {
    highlightedOnly: !props.filters.highlightedOnly,
  });

  return (
    <main className="min-h-dvh bg-background px-3 py-3 text-foreground sm:px-5 sm:py-5">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Sold lots</h1>
            <p className="text-base text-muted-foreground sm:text-sm">
              Showing {props.items.length.toLocaleString()} lot{props.items.length === 1 ? "" : "s"}
            </p>
          </div>
          <a href={activeHighlightedHref}>
            <Button size="sm" type="button" variant="outline">
              {props.filters.highlightedOnly ? "Show all" : "Outliers"}
            </Button>
          </a>
        </div>

        <SoldFilters props={props} />
        <SoldAnalytics props={props} />
        <OutlierLots items={props.items} />
        <SoldTable items={props.items} />
      </div>
    </main>
  );
}
