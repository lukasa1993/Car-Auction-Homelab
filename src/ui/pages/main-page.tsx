import * as React from "react";

import type { LotListItem } from "../../lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "../components/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/table";

type Tab = "model3" | "modely" | "all";

function formatAuctionDateDisplay(lot: LotListItem) {
  if (lot.auctionDateRaw && lot.auctionDateRaw !== "future") {
    return lot.auctionDateRaw;
  }
  if (lot.auctionDate === "future") {
    return "Future / upcoming";
  }
  return lot.auctionDate || "";
}

function hasExactAuctionTime(auctionDate: string | null | undefined): boolean {
  return typeof auctionDate === "string" && auctionDate.includes("T");
}

function isStartingSoon(lot: LotListItem, nowMs: number): boolean {
  if (!lot.auctionDate || !hasExactAuctionTime(lot.auctionDate)) {
    return false;
  }
  const target = Date.parse(lot.auctionDate);
  if (Number.isNaN(target)) {
    return false;
  }
  const diff = target - nowMs;
  return diff > 0 && diff <= 12 * 60 * 60 * 1000;
}

function renderLotLink(lot: LotListItem) {
  return lot.sourceKey === "copart" ? lot.lotNumber : "open";
}

function ImageCell({ lot }: { lot: LotListItem }) {
  if (!lot.primaryImageId) {
    return (
      <div className="flex h-11 w-16 items-center justify-center rounded-xl border border-dashed border-border text-[10px] text-muted-foreground">
        none
      </div>
    );
  }
  const src = `/images/${lot.primaryImageId}`;
  const detailUrl = `/lots/${lot.sourceKey}/${lot.lotNumber}`;
  return (
    <div className="group/img relative">
      <a href={detailUrl}>
        <img
          alt={lot.lotNumber}
          className="h-11 w-16 rounded-xl object-cover ring-1 ring-foreground/10"
          src={src}
        />
      </a>
      <div className="pointer-events-none absolute bottom-full left-0 z-20 mb-2 hidden overflow-hidden rounded-3xl bg-card shadow-lg ring-1 ring-foreground/10 group-hover/img:block">
        <img
          alt={lot.lotNumber}
          className="h-auto w-60 object-cover"
          src={src}
        />
      </div>
    </div>
  );
}

function LotSourceCell({ lot }: { lot: LotListItem }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <a href={lot.url} rel="noreferrer" target="_blank">{renderLotLink(lot)}</a>
        {lot.sourceKey === "copart" ? (
          <button
            className="copy-lot rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground"
            data-copy-lot={lot.lotNumber}
            type="button"
          >
            copy
          </button>
        ) : null}
      </div>
      {lot.location ? <span className="text-[11px] text-muted-foreground">{lot.location}</span> : null}
    </div>
  );
}

function TabLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <a
      className={`inline-flex items-center justify-center rounded-3xl px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "bg-background text-foreground shadow-sm ring-1 ring-foreground/5"
          : "text-muted-foreground hover:text-foreground"
      }`}
      href={href}
    >
      {children}
    </a>
  );
}

export function MainPage({
  lots,
  allLots,
  generatedAt,
  activeTab,
}: {
  lots: LotListItem[];
  allLots: LotListItem[];
  generatedAt: string;
  activeTab: Tab;
}) {
  const nowMs = Date.now();
  const soonLots = allLots.filter((lot) => isStartingSoon(lot, nowMs));
  const remainingLots = lots.filter((lot) => !isStartingSoon(lot, nowMs));

  return (
    <main className="min-h-screen bg-background px-3 py-3 text-foreground sm:px-5 sm:py-5">
      <div className="mx-auto flex max-w-[1040px] flex-col gap-4">
        <header className="flex items-baseline gap-2">
          <h1 className="text-base font-semibold">Tesla Auctions</h1>
          <span className="text-[12px] text-muted-foreground" data-generated-at={generatedAt}>{generatedAt}</span>
        </header>

        {soonLots.length > 0 ? (
          <Card className="bg-[color:var(--soon-bg)] ring-[color:var(--soon-border)]">
            <CardHeader className="pb-0">
              <CardTitle className="text-sm">Upcoming &lt; 12h</CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Image</TableHead>
                    <TableHead>Model</TableHead>
                    <TableHead>Source</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {soonLots.map((lot) => (
                    <TableRow key={`${lot.sourceKey}:${lot.lotNumber}`}>
                      <TableCell>
                        <span className="whitespace-nowrap text-sm" data-auction-date={lot.auctionDate || ""}>{hasExactAuctionTime(lot.auctionDate) ? "Loading" : "Time TBD"}</span>
                        {lot.modelYear ? <span className="mt-0.5 block text-[11px] text-muted-foreground">MY {lot.modelYear}</span> : null}
                      </TableCell>
                      <TableCell><ImageCell lot={lot} /></TableCell>
                      <TableCell className="text-sm">{lot.carType.replace("Tesla ", "")}</TableCell>
                      <TableCell><LotSourceCell lot={lot} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader className="flex-row items-center justify-between gap-4 pb-0">
            <CardTitle className="text-sm">Lots</CardTitle>
            <div className="flex items-center gap-0.5 rounded-3xl bg-muted p-0.5">
              <TabLink href="/?tab=model3" active={activeTab === "model3"}>Model 3</TabLink>
              <TabLink href="/?tab=modely" active={activeTab === "modely"}>Model Y</TabLink>
              <TabLink href="/?tab=all" active={activeTab === "all"}>All</TabLink>
            </div>
          </CardHeader>
          <CardContent className="pt-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Image</TableHead>
                  <TableHead className="hidden sm:table-cell">Auction Date</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {remainingLots.map((lot) => (
                  <TableRow
                    key={`${lot.sourceKey}:${lot.lotNumber}`}
                    className={lot.status === "done" ? "opacity-35" : ""}
                  >
                    <TableCell>
                      <span className="whitespace-nowrap text-sm" data-auction-date={lot.auctionDate || ""}>{hasExactAuctionTime(lot.auctionDate) ? "Loading" : lot.auctionDate ? "Time TBD" : "Date pending"}</span>
                      {lot.modelYear ? <span className="mt-0.5 block text-[11px] text-muted-foreground">MY {lot.modelYear}</span> : null}
                    </TableCell>
                    <TableCell><ImageCell lot={lot} /></TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <div className="text-sm">{formatAuctionDateDisplay(lot)}</div>
                      {hasExactAuctionTime(lot.auctionDate) ? <div className="mt-0.5 text-[11px] text-muted-foreground" data-local-auction-date={lot.auctionDate || ""} /> : null}
                    </TableCell>
                    <TableCell className="text-sm">{lot.carType.replace("Tesla ", "")}</TableCell>
                    <TableCell><LotSourceCell lot={lot} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
