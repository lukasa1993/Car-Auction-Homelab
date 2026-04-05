import * as React from "react";

import type { LotListItem } from "../../lib/types";
import { Button } from "../components/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/card";
import { CopyTextButton } from "../components/copy-text-button";
import { LotImagePreview } from "../components/lot-image-preview";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/table";
import {
  formatAuctionCountdown,
  formatAuctionDateDisplay,
  formatRelativeTimestamp,
  formatLocalAuctionTime,
  hasExactAuctionTime,
  stripTeslaPrefix,
} from "../format";

export interface MainPageTab {
  key: string;
  label: string;
}

export interface MainPageProps {
  lots: LotListItem[];
  allLots: LotListItem[];
  lastCollectorIngestAt: string | null;
  renderedAt: string;
  activeTab: string;
  tabs: MainPageTab[];
  auth: { signedIn: boolean; admin: boolean; email: string | null };
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

function buildTabHref(tab: string): string {
  const params = new URLSearchParams({ tab });
  return `/?${params.toString()}`;
}

function RejectListingButton({
  lot,
  onRejected,
  redirectTo,
}: {
  lot: LotListItem;
  onRejected: (lotId: string) => void;
  redirectTo: string;
}) {
  const [isPending, setIsPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleSubmit = React.useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isPending) {
      return;
    }

    const form = event.currentTarget;
    setIsPending(true);
    setError(null);

    try {
      const response = await fetch(form.action, {
        method: form.method,
        body: new FormData(form),
        headers: {
          "x-auction-request": "async",
        },
      });

      if (!response.ok) {
        throw new Error(`Reject failed with status ${response.status}`);
      }

      onRejected(lot.id);
    } catch {
      setError("Failed");
    } finally {
      setIsPending(false);
    }
  }, [isPending, lot.id, onRejected]);

  return (
    <form action={`/lots/${lot.id}/reject`} method="post" onSubmit={handleSubmit}>
      <input name="redirect" type="hidden" value={redirectTo} />
      <div className="flex flex-col items-end gap-1">
        <Button disabled={isPending} size="sm" type="submit" variant="outline">
          {isPending ? "Rejecting..." : "Reject"}
        </Button>
        {error ? <span className="text-[11px] text-destructive">{error}</span> : null}
      </div>
    </form>
  );
}

function LotRowActions({
  lot,
  onRejected,
  redirectTo,
}: {
  lot: LotListItem;
  onRejected: (lotId: string) => void;
  redirectTo: string;
}) {
  return (
    <div className="flex flex-wrap justify-end gap-2">
      <a href={lot.url} rel="noreferrer" target="_blank">
        <Button size="sm" variant="outline">Open</Button>
      </a>
      <CopyTextButton value={lot.lotNumber} />
      <RejectListingButton lot={lot} onRejected={onRejected} redirectTo={redirectTo} />
    </div>
  );
}

export function MainPage({
  lots,
  allLots,
  lastCollectorIngestAt,
  renderedAt,
  activeTab,
  tabs,
  auth,
}: MainPageProps) {
  const [allLotsState, setAllLotsState] = React.useState(allLots);
  const [visibleLotsState, setVisibleLotsState] = React.useState(lots);
  const [nowMs, setNowMs] = React.useState(() => Date.parse(renderedAt) || Date.now());

  React.useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const handleRejected = React.useCallback((lotId: string) => {
    setAllLotsState((current) => current.filter((lot) => lot.id !== lotId));
    setVisibleLotsState((current) => current.filter((lot) => lot.id !== lotId));
  }, []);

  const soonLots = allLotsState.filter((lot) => isStartingSoon(lot, nowMs));
  const remainingLots = visibleLotsState.filter((lot) => !isStartingSoon(lot, nowMs));
  const redirectTo = buildTabHref(activeTab);

  return (
    <main className="min-h-screen bg-background px-3 py-3 text-foreground sm:px-5 sm:py-5">
      <div className="mx-auto flex max-w-[1040px] flex-col gap-4">
        <header className="flex items-baseline justify-between gap-3">
          <div className="flex items-baseline gap-2">
            <h1 className="text-base font-semibold">Auction Monitor</h1>
            <span className="text-[12px] text-muted-foreground">{formatRelativeTimestamp(lastCollectorIngestAt, nowMs)}</span>
          </div>
          {auth.admin ? (
            <a
              className="text-[12px] font-medium text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
              href="/admin"
            >
              Admin →
            </a>
          ) : null}
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
                      <TableCell className="text-sm">{stripTeslaPrefix(lot.carType)}</TableCell>
                      <TableCell><LotSourceCell lot={lot} /></TableCell>
                      <TableCell className="text-right">
                        <LotRowActions lot={lot} onRejected={handleRejected} redirectTo={redirectTo} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader className="flex-col items-start gap-3 pb-0 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-sm">Lots</CardTitle>
            <div className="flex flex-wrap items-center gap-0.5 rounded-3xl bg-muted p-0.5">
              {tabs.map((tab) => (
                <TabLink href={buildTabHref(tab.key)} active={activeTab === tab.key} key={tab.key}>
                  {tab.label}
                </TabLink>
              ))}
              <TabLink href={buildTabHref("all")} active={activeTab === "all"}>All</TabLink>
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
                    <TableCell className="text-sm">{stripTeslaPrefix(lot.carType)}</TableCell>
                    <TableCell><LotSourceCell lot={lot} /></TableCell>
                    <TableCell className="text-right">
                      <LotRowActions lot={lot} onRejected={handleRejected} redirectTo={redirectTo} />
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
