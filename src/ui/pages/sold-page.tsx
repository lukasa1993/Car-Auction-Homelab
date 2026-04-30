import * as React from "react";

import type { SoldPriceExplorerData, SoldPriceExplorerItem, SoldPriceSummary } from "../../lib/types";
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
    return "High";
  }
  if (outlier === "low") {
    return "Low";
  }
  return "Normal";
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0 border-t border-border/70 py-3 first:border-t-0 sm:border-l sm:border-t-0 sm:px-4 sm:first:border-l-0 sm:first:pl-0 sm:last:pr-0">
      <div className="truncate text-base text-muted-foreground sm:text-sm">{label}</div>
      <div className="font-display text-2xl font-semibold tabular-nums tracking-normal sm:text-xl">{value}</div>
    </div>
  );
}

function PriceSpread({ summary }: { summary: SoldPriceSummary }) {
  return (
    <div className="border-t border-border/70 py-4">
      <div className="flex items-center justify-between gap-3 text-base text-muted-foreground sm:text-sm">
        <div>Price spread</div>
        <div className="tabular-nums">{formatUsd(summary.minUsd)} to {formatUsd(summary.maxUsd)}</div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-0 border-y border-border/60 sm:grid-cols-5">
        {[
          ["Min", summary.minUsd],
          ["Q1", summary.q1Usd],
          ["Median", summary.medianUsd],
          ["Q3", summary.q3Usd],
          ["Max", summary.maxUsd],
        ].map(([label, value]) => (
          <div className="border-t border-border/60 py-2 first:border-t-0 sm:border-l sm:border-t-0 sm:px-3 sm:first:border-l-0" key={String(label)}>
            <div className="truncate text-base text-muted-foreground sm:text-sm">{label}</div>
            <div className="font-medium tabular-nums">{formatUsd(value as number | null)}</div>
          </div>
        ))}
      </div>
    </div>
  );
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

function SoldFilters({ props }: { props: SoldPageProps }) {
  const { filters, options } = props;
  return (
    <form action="/sold" className="grid gap-2 rounded-2xl border border-border/70 p-3 @container" method="get">
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
          Highlighted only
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

function RowMeta({ item }: { item: SoldPriceExplorerItem }) {
  const color = item.soldPrice.color || item.color || extractLotColor(item.evidence);
  return (
    <div className="min-w-64">
      <a className="font-medium text-foreground underline-offset-2 hover:underline" href={`/lots/${item.sourceKey}/${item.lotNumber}`}>
        {item.modelYear ? `${item.modelYear} ` : ""}{stripTeslaPrefix(item.carType)}
      </a>
      <div className="text-base text-muted-foreground sm:text-sm">
        {[color, item.soldPrice.condition, item.soldPrice.damage || item.soldPrice.secondaryDamage].filter(Boolean).join(" · ") || "—"}
      </div>
    </div>
  );
}

function SoldTable({ items, filters }: { items: SoldPriceExplorerItem[]; filters: SoldPageProps["filters"] }) {
  return (
    <div className="-mx-3 -my-2 overflow-x-auto whitespace-nowrap sm:-mx-5">
      <div className="inline-block min-w-full px-3 py-2 align-middle sm:px-5">
        <table className="w-full text-left text-base sm:text-sm">
          <thead>
            <tr className="border-b border-border/70 text-muted-foreground">
              <th className="whitespace-nowrap py-3 pr-3 font-medium">Lot</th>
              <th className="whitespace-nowrap px-3 py-3 font-medium">Vehicle</th>
              <th className="whitespace-nowrap px-3 py-3 text-right font-medium">Final bid</th>
              <th className="whitespace-nowrap px-3 py-3 text-right font-medium">Delta</th>
              <th className="whitespace-nowrap px-3 py-3 font-medium">Sale date</th>
              <th className="whitespace-nowrap px-3 py-3 font-medium">Location</th>
              <th className="whitespace-nowrap py-3 pl-3 text-right font-medium">Evidence</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr
                className={`border-b border-border/70 ${
                  item.stats.outlier === "high"
                    ? "bg-amber-500/5"
                    : item.stats.outlier === "low"
                      ? "bg-emerald-500/5"
                      : ""
                }`}
                key={item.soldPrice.id}
              >
                <td className="py-3 pr-3 align-middle">
                  <div className="flex items-center gap-3">
                    <LotImagePreview
                      lot={item}
                      placeholderClassName="size-14 rounded-xl"
                      thumbClassName="size-14 rounded-xl"
                    />
                    <div>
                      <div className="font-medium text-foreground">Lot {item.lotNumber}</div>
                      <div className="text-base text-muted-foreground sm:text-sm">{item.sourceLabel}</div>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3 align-middle">
                  <RowMeta item={item} />
                </td>
                <td className="px-3 py-3 text-right align-middle">
                  <div className="font-semibold tabular-nums">{formatUsd(item.soldPrice.finalBidUsd)}</div>
                  <div className="text-base text-muted-foreground sm:text-sm">Median {formatUsd(item.stats.medianUsd)}</div>
                </td>
                <td className="px-3 py-3 text-right align-middle">
                  <div className="flex justify-end">
                    <Badge variant={outlierVariant(item.stats.outlier)}>{outlierLabel(item.stats.outlier)}</Badge>
                  </div>
                  <div className="text-base tabular-nums text-muted-foreground sm:text-sm">
                    {formatSignedUsd(item.stats.deltaUsd)} · {formatPercent(item.stats.deltaPercent)}
                  </div>
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
                  <div className="text-base text-muted-foreground sm:text-sm">{item.soldPrice.mileage || item.soldPrice.documents || ""}</div>
                </td>
                <td className="py-3 pl-3 text-right align-middle">
                  {item.soldPrice.externalUrl ? (
                    <a href={item.soldPrice.externalUrl} rel="noopener noreferrer" target="_blank">
                      <Button size="sm" type="button" variant="outline">bid.cars</Button>
                    </a>
                  ) : null}
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
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-normal">Sold Explorer</h1>
            <div className="text-base text-muted-foreground sm:text-sm">
              {props.summary.count} sold result{props.summary.count === 1 ? "" : "s"}
            </div>
          </div>
          <nav className="hidden items-center gap-3 sm:flex" aria-label="Primary">
            <a className="text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline" href="/">Live lots</a>
            <a className="text-sm text-foreground underline-offset-2 hover:underline" href="/sold">Sold</a>
          </nav>
          <details className="sm:hidden">
            <summary className="cursor-pointer rounded-3xl border border-border px-3 py-2 text-base text-foreground">Menu</summary>
            <div className="mt-2 flex flex-col gap-2 rounded-2xl border border-border bg-card p-2">
              <a className="rounded-xl px-3 py-2 text-base text-muted-foreground" href="/">Live lots</a>
              <a className="rounded-xl bg-muted px-3 py-2 text-base text-foreground" href="/sold">Sold</a>
            </div>
          </details>
        </header>

        <section className="@container">
          <div className="grid grid-cols-2 gap-0 border-y border-border/70 @4xl:grid-cols-5">
            <Metric label="Count" value={props.summary.count.toLocaleString()} />
            <Metric label="Median" value={formatUsd(props.summary.medianUsd)} />
            <Metric label="Q1 / Q3" value={`${formatUsd(props.summary.q1Usd)} / ${formatUsd(props.summary.q3Usd)}`} />
            <Metric label="Range" value={`${formatUsd(props.summary.minUsd)} - ${formatUsd(props.summary.maxUsd)}`} />
            <Metric label="Highlighted" value={props.summary.outlierCount.toLocaleString()} />
          </div>
          <PriceSpread summary={props.summary} />
        </section>

        <SoldFilters props={props} />

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-base text-muted-foreground sm:text-sm">
            Showing {props.items.length.toLocaleString()} row{props.items.length === 1 ? "" : "s"}
          </div>
          <a href={activeHighlightedHref}>
            <Button size="sm" type="button" variant="outline">
              {props.filters.highlightedOnly ? "Show all" : "Highlighted"}
            </Button>
          </a>
        </div>

        <SoldTable filters={props.filters} items={props.items} />
      </div>
    </main>
  );
}
