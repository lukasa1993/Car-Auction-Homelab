import * as React from "react";

import type { LotListItem } from "../../lib/types";
import { Button } from "../components/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/card";
import { CopyTextButton } from "../components/copy-text-button";
import { LotImagePreview } from "../components/lot-image-preview";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/table";

type Tab = "model3" | "modely" | "all";

export interface MainPageProps {
  lots: LotListItem[];
  allLots: LotListItem[];
  generatedAt: string;
  activeTab: Tab;
}

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

function formatAuctionCountdown(auctionDate: string | null | undefined, nowMs: number): string | null {
  if (typeof auctionDate !== "string" || !auctionDate.includes("T")) {
    return null;
  }

  const target = Date.parse(auctionDate);
  if (Number.isNaN(target)) {
    return null;
  }

  const diff = target - nowMs;
  if (diff <= 0) {
    return "Live now";
  }

  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  return `${minutes}m ${seconds}s`;
}

function formatLocalAuctionTime(auctionDate: string | null | undefined): string | null {
  if (typeof auctionDate !== "string" || !auctionDate.includes("T")) {
    return null;
  }

  const target = new Date(auctionDate);
  if (Number.isNaN(target.getTime())) {
    return null;
  }

  return `${new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(target)} local`;
}

function formatGeneratedAt(generatedAt: string, nowMs: number): string {
  const generatedMs = Date.parse(generatedAt);
  if (Number.isNaN(generatedMs)) {
    return generatedAt;
  }

  const minutes = Math.floor((nowMs - generatedMs) / 60000);
  if (minutes < 1) {
    return "just now";
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  if (minutes < 1440) {
    return `${Math.floor(minutes / 60)}h ago`;
  }
  return `${Math.floor(minutes / 1440)}d ago`;
}

function ImageCell({ lot }: { lot: LotListItem }) {
  return <LotImagePreview lot={lot} />;
}

function LotSourceCell({ lot }: { lot: LotListItem }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="font-medium text-foreground">Lot {lot.lotNumber}</div>
      <div className="text-[11px] text-muted-foreground">{lot.sourceLabel}</div>
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

function RejectListingButton({ lot, redirectTo }: { lot: LotListItem; redirectTo: string }) {
  return (
    <form action={`/lots/${lot.id}/reject`} method="post">
      <input name="redirect" type="hidden" value={redirectTo} />
      <Button size="sm" type="submit" variant="outline">Reject</Button>
    </form>
  );
}

function LotRowActions({ lot, redirectTo }: { lot: LotListItem; redirectTo: string }) {
  return (
    <div className="flex flex-wrap justify-end gap-2">
      <a href={lot.url} rel="noreferrer" target="_blank">
        <Button size="sm" variant="outline">Open</Button>
      </a>
      <CopyTextButton value={lot.lotNumber} />
      <RejectListingButton lot={lot} redirectTo={redirectTo} />
    </div>
  );
}

export function MainPage({
  lots,
  allLots,
  generatedAt,
  activeTab,
}: MainPageProps) {
  const [nowMs, setNowMs] = React.useState(() => Date.parse(generatedAt) || Date.now());

  React.useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const soonLots = allLots.filter((lot) => isStartingSoon(lot, nowMs));
  const remainingLots = lots.filter((lot) => !isStartingSoon(lot, nowMs));
  const redirectTo = `/?tab=${activeTab}`;

  return (
    <main className="min-h-screen bg-background px-3 py-3 text-foreground sm:px-5 sm:py-5">
      <div className="mx-auto flex max-w-[1040px] flex-col gap-4">
        <header className="flex items-baseline gap-2">
          <h1 className="text-base font-semibold">Tesla Auctions</h1>
          <span className="text-[12px] text-muted-foreground">{formatGeneratedAt(generatedAt, nowMs)}</span>
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
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {soonLots.map((lot) => (
                    <TableRow key={`${lot.sourceKey}:${lot.lotNumber}`}>
                      <TableCell>
                        <span className="whitespace-nowrap text-sm">{formatAuctionCountdown(lot.auctionDate, nowMs) || "Time TBD"}</span>
                        {lot.modelYear ? <span className="mt-0.5 block text-[11px] text-muted-foreground">MY {lot.modelYear}</span> : null}
                      </TableCell>
                      <TableCell><ImageCell lot={lot} /></TableCell>
                      <TableCell className="text-sm">{lot.carType.replace("Tesla ", "")}</TableCell>
                      <TableCell><LotSourceCell lot={lot} /></TableCell>
                      <TableCell className="text-right">
                        <LotRowActions lot={lot} redirectTo={redirectTo} />
                      </TableCell>
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
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {remainingLots.map((lot) => (
                  <TableRow
                    key={`${lot.sourceKey}:${lot.lotNumber}`}
                    className={lot.status === "done" ? "opacity-35" : ""}
                  >
                    <TableCell>
                      <span className="whitespace-nowrap text-sm">{formatAuctionCountdown(lot.auctionDate, nowMs) || (lot.auctionDate ? "Time TBD" : "Date pending")}</span>
                      {lot.modelYear ? <span className="mt-0.5 block text-[11px] text-muted-foreground">MY {lot.modelYear}</span> : null}
                    </TableCell>
                    <TableCell><ImageCell lot={lot} /></TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <div className="text-sm">{formatAuctionDateDisplay(lot)}</div>
                      {hasExactAuctionTime(lot.auctionDate) ? <div className="mt-0.5 text-[11px] text-muted-foreground">{formatLocalAuctionTime(lot.auctionDate)}</div> : null}
                    </TableCell>
                    <TableCell className="text-sm">{lot.carType.replace("Tesla ", "")}</TableCell>
                    <TableCell><LotSourceCell lot={lot} /></TableCell>
                    <TableCell className="text-right">
                      <LotRowActions lot={lot} redirectTo={redirectTo} />
                    </TableCell>
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
