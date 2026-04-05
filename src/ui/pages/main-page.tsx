import * as React from "react";

import type { LotListItem } from "../../lib/types";
import { Button } from "../components/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/card";
import { LotImagePreview } from "../components/lot-image-preview";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/table";
import { LocalizedDateText, useDateNowMs } from "../date-render";
import {
  formatAuctionCountdown,
  formatAuctionDateDisplay,
  formatRelativeTimestamp,
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

function countdownUrgency(
  auctionDate: string | null | undefined,
  nowMs: number,
): "live" | "imminent" | null {
  if (!auctionDate || !hasExactAuctionTime(auctionDate)) {
    return null;
  }
  const target = Date.parse(auctionDate);
  if (Number.isNaN(target)) {
    return null;
  }
  const diff = target - nowMs;
  if (diff <= 0) {
    return "live";
  }
  if (diff <= 60 * 60 * 1000) {
    return "imminent";
  }
  return null;
}

function ImageCell({ lot }: { lot: LotListItem }) {
  return (
    <LotImagePreview
      lot={lot}
      thumbClassName="h-20 w-28 rounded-2xl sm:h-11 sm:w-16 sm:rounded-xl"
      placeholderClassName="h-20 w-28 rounded-2xl text-[11px] sm:h-11 sm:w-16 sm:rounded-xl sm:text-[10px]"
    />
  );
}

function LotSourceCell({ lot }: { lot: LotListItem }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-1.5 text-[11px] text-muted-foreground sm:flex-col sm:gap-1">
      <span className="font-medium text-foreground">Lot {lot.lotNumber}</span>
      <span aria-hidden className="sm:hidden">·</span>
      <span>{lot.sourceLabel}</span>
      {lot.location ? (
        <>
          <span aria-hidden className="sm:hidden">·</span>
          <span>{lot.location}</span>
        </>
      ) : null}
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
    <form
      action={`/lots/${lot.id}/reject`}
      className="flex-1 sm:contents"
      method="post"
      onSubmit={handleSubmit}
    >
      <input name="redirect" type="hidden" value={redirectTo} />
      <Button
        aria-label={isPending ? "Rejecting" : "Reject listing"}
        className="h-10 w-full min-w-0 rounded-2xl px-3 text-muted-foreground hover:text-destructive sm:h-8 sm:w-auto sm:rounded-4xl sm:px-3"
        disabled={isPending}
        size="sm"
        title={error ?? "Reject"}
        type="submit"
        variant="outline"
      >
        {isPending ? "Rejecting..." : "Reject"}
      </Button>
    </form>
  );
}

function CopyLotButton({ lot }: { lot: LotListItem }) {
  const [copied, setCopied] = React.useState(false);
  const resetTimer = React.useRef<number | null>(null);

  React.useEffect(() => {
    return () => {
      if (resetTimer.current) {
        window.clearTimeout(resetTimer.current);
      }
    };
  }, []);

  const handleCopy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(lot.lotNumber);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = lot.lotNumber;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        textarea.remove();
      }
      setCopied(true);
    } catch {
      return;
    }

    if (resetTimer.current) {
      window.clearTimeout(resetTimer.current);
    }
    resetTimer.current = window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <Button
      aria-label={copied ? "Copied lot number" : "Copy lot number"}
      className="h-10 w-full min-w-0 flex-1 rounded-2xl px-3 sm:h-8 sm:w-auto sm:flex-none sm:rounded-4xl sm:px-3"
      onClick={handleCopy}
      size="sm"
      title={`Copy ${lot.lotNumber}`}
      type="button"
      variant="outline"
    >
      {copied ? "Copied" : "Copy"}
    </Button>
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
    <div className="flex w-full items-center justify-end gap-2">
      <a
        className="flex-1 sm:flex-initial"
        href={lot.url}
        rel="noreferrer"
        target="_blank"
      >
        <Button
          className="h-10 w-full min-w-0 rounded-2xl bg-foreground px-3 text-background shadow-sm hover:bg-foreground/90 sm:h-8 sm:w-auto sm:rounded-4xl sm:border sm:border-border sm:bg-background sm:text-foreground sm:shadow-none sm:hover:bg-accent sm:hover:text-accent-foreground"
          size="sm"
          variant="default"
        >
          Open
        </Button>
      </a>
      <CopyLotButton lot={lot} />
      <RejectListingButton lot={lot} onRejected={onRejected} redirectTo={redirectTo} />
    </div>
  );
}

export function MainPage({
  lots,
  allLots,
  lastCollectorIngestAt,
  activeTab,
  tabs,
  auth,
}: MainPageProps) {
  const [allLotsState, setAllLotsState] = React.useState(allLots);
  const [visibleLotsState, setVisibleLotsState] = React.useState(lots);
  const nowMs = useDateNowMs(1000);

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
              <Table className="block sm:table">
                <TableHeader className="hidden sm:table-header-group">
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Image</TableHead>
                    <TableHead>Model</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="block sm:table-row-group">
                  {soonLots.map((lot) => (
                    <TableRow
                      className="grid grid-cols-[auto_1fr] items-start gap-x-3 gap-y-0.5 px-3 py-4 hover:bg-transparent sm:table-row sm:gap-0 sm:p-0 sm:hover:bg-muted/50"
                      key={`${lot.sourceKey}:${lot.lotNumber}`}
                    >
                      <TableCell className="col-start-2 row-start-1 p-0 sm:p-3">
                        <span
                          className={`whitespace-nowrap text-base font-semibold leading-tight tabular-nums sm:text-sm sm:font-normal ${
                            countdownUrgency(lot.auctionDate, nowMs)
                              ? "text-destructive"
                              : "text-foreground"
                          }`}
                        >
                          {formatAuctionCountdown(lot.auctionDate, nowMs) || "Time TBD"}
                        </span>
                        {lot.modelYear ? <span className="ml-1.5 inline text-[11px] text-muted-foreground sm:ml-0 sm:mt-0.5 sm:block">· MY {lot.modelYear}</span> : null}
                      </TableCell>
                      <TableCell className="col-start-1 row-span-3 row-start-1 self-start p-0 sm:p-3"><ImageCell lot={lot} /></TableCell>
                      <TableCell className="col-start-2 row-start-2 p-0 text-[15px] font-semibold leading-snug sm:p-3 sm:text-sm sm:font-normal">{stripTeslaPrefix(lot.carType)}</TableCell>
                      <TableCell className="col-start-2 row-start-3 p-0 sm:p-3"><LotSourceCell lot={lot} /></TableCell>
                      <TableCell className="col-span-2 row-start-4 p-0 pt-3 text-right sm:col-span-1 sm:row-start-auto sm:p-3 sm:pt-3">
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
            <Table className="block sm:table">
              <TableHeader className="hidden sm:table-header-group">
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Image</TableHead>
                  <TableHead className="hidden sm:table-cell">Auction Date</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="block sm:table-row-group">
                {remainingLots.map((lot) => (
                  <TableRow
                    key={`${lot.sourceKey}:${lot.lotNumber}`}
                    className={`grid grid-cols-[auto_1fr] items-start gap-x-3 gap-y-0.5 px-3 py-4 hover:bg-transparent sm:table-row sm:gap-0 sm:p-0 sm:hover:bg-muted/50${
                      lot.status === "done" ? " opacity-35" : ""
                    }`}
                  >
                    <TableCell className="col-start-2 row-start-1 p-0 sm:p-3">
                      <span
                        className={`whitespace-nowrap text-base font-semibold leading-tight tabular-nums sm:text-sm sm:font-normal ${
                          countdownUrgency(lot.auctionDate, nowMs)
                            ? "text-destructive"
                            : "text-foreground"
                        }`}
                      >
                        {formatAuctionCountdown(lot.auctionDate, nowMs) || (lot.auctionDate ? "Time TBD" : "Date pending")}
                      </span>
                      {lot.modelYear ? <span className="ml-1.5 inline text-[11px] text-muted-foreground sm:ml-0 sm:mt-0.5 sm:block">· MY {lot.modelYear}</span> : null}
                    </TableCell>
                    <TableCell className="col-start-1 row-span-3 row-start-1 self-start p-0 sm:p-3"><ImageCell lot={lot} /></TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <div className="text-sm">{formatAuctionDateDisplay(lot)}</div>
                      {hasExactAuctionTime(lot.auctionDate) ? (
                        <LocalizedDateText
                          className="mt-0.5 block text-[11px] text-muted-foreground empty:hidden"
                          emptyLabel=""
                          format="auction-local-time"
                          iso={lot.auctionDate}
                        />
                      ) : null}
                    </TableCell>
                    <TableCell className="col-start-2 row-start-2 p-0 text-[15px] font-semibold leading-snug sm:p-3 sm:text-sm sm:font-normal">{stripTeslaPrefix(lot.carType)}</TableCell>
                    <TableCell className="col-start-2 row-start-3 p-0 sm:p-3"><LotSourceCell lot={lot} /></TableCell>
                    <TableCell className="col-span-2 row-start-4 p-0 pt-3 text-right sm:col-span-1 sm:row-start-auto sm:p-3 sm:pt-3">
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
