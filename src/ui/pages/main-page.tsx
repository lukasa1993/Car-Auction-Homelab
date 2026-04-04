import * as React from "react";
import { ArrowUpRight, CheckCircle2, Copy, ExternalLink, Filter, ImageIcon, ShieldCheck, Trash2 } from "lucide-react";

import type { LotListItem } from "../../lib/types";
import { Badge } from "../components/badge";
import { Button } from "../components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/card";
import { Select } from "../components/select";
import { Separator } from "../components/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/table";
import { cn } from "../lib";

function statusVariant(status: string): "success" | "muted" | "warning" | "outline" {
  switch (status) {
    case "upcoming":
      return "success";
    case "done":
      return "muted";
    case "missing":
    case "canceled":
      return "warning";
    default:
      return "outline";
  }
}

function workflowVariant(state: string): "success" | "destructive" | "outline" {
  switch (state) {
    case "approved":
      return "success";
    case "removed":
      return "destructive";
    default:
      return "outline";
  }
}

function formatAuctionDateDisplay(lot: LotListItem) {
  if (lot.auctionDateRaw && lot.auctionDateRaw !== "future") {
    return lot.auctionDateRaw;
  }
  if (lot.auctionDate === "future") {
    return "Future / upcoming";
  }
  return lot.auctionDate || "Pending";
}

function filterLots(lots: LotListItem[], filters: { model: string; source: string; workflow: string; removed: boolean }) {
  return lots.filter((lot) => {
    if (!filters.removed && lot.workflowState === "removed") {
      return false;
    }
    if (filters.model !== "all" && !lot.carType.toLowerCase().includes(filters.model.toLowerCase())) {
      return false;
    }
    if (filters.source !== "all" && lot.sourceKey !== filters.source) {
      return false;
    }
    if (filters.workflow !== "all" && lot.workflowState !== filters.workflow) {
      return false;
    }
    return true;
  });
}

export function MainPage({
  lots,
  generatedAt,
  auth,
  filters,
}: {
  lots: LotListItem[];
  generatedAt: string;
  auth: { signedIn: boolean; admin: boolean; email: string | null };
  filters: { model: string; source: string; workflow: string; removed: boolean };
}) {
  const filtered = filterLots(lots, filters);
  const soonLots = filtered.filter((lot) => {
    if (!lot.auctionDate || !lot.auctionDate.includes("T")) {
      return false;
    }
    const target = Date.parse(lot.auctionDate);
    const diff = target - Date.now();
    return diff > 0 && diff <= 12 * 60 * 60 * 1000;
  });
  const upcomingCount = filtered.filter((lot) => lot.status === "upcoming").length;
  const approvedCount = filtered.filter((lot) => lot.workflowState === "approved").length;
  const imageCount = filtered.reduce((sum, lot) => sum + lot.imageCount, 0);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(190,166,120,0.18),transparent_32%),linear-gradient(180deg,rgba(253,250,244,0.96),rgba(248,242,232,0.92))]">
      <div className="mx-auto flex max-w-[1320px] flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
        <header className="grid gap-6 lg:grid-cols-[1.4fr_0.9fr]">
          <div className="space-y-5">
            <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
              <span className="inline-flex size-2 rounded-full bg-emerald-500/70" />
              Central auction registry
            </div>
            <div className="space-y-3">
              <h1 className="max-w-4xl font-display text-4xl leading-[0.94] tracking-[-0.04em] text-foreground sm:text-5xl lg:text-6xl">
                Table-first review for live lots, approvals, removals, history, and images.
              </h1>
              <p className="max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg">
                The public surface stays operationally dense. The state now lives in SQLite on the
                Mac mini, runners fetch VIN scope from the service, and moderation never gets
                overwritten by scrape noise.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {auth.signedIn ? (
                <>
                  <Badge variant={auth.admin ? "success" : "outline"}>
                    {auth.admin ? "Admin session" : "Signed in"}
                  </Badge>
                  {auth.email ? <span className="text-sm text-muted-foreground">{auth.email}</span> : null}
                  <form action="/logout" method="post">
                    <Button variant="outline" size="sm" type="submit">
                      Sign out
                    </Button>
                  </form>
                </>
              ) : (
                <a href="/login">
                  <Button size="sm">Sign in</Button>
                </a>
              )}
              {auth.admin ? (
                <a href="/admin">
                  <Button variant="outline" size="sm">
                    Admin console
                    <ArrowUpRight className="size-4" />
                  </Button>
                </a>
              ) : null}
            </div>
          </div>

          <Card className="overflow-hidden border-border/70 bg-card/90">
            <CardHeader className="pb-4">
              <CardTitle className="font-display text-2xl tracking-[-0.03em]">Current readout</CardTitle>
              <CardDescription>
                Warm, dense, audit-focused. The page keeps the lot table central instead of falling
                back to generic cards.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Upcoming</div>
                  <div className="mt-2 text-3xl font-semibold tracking-[-0.04em]">{upcomingCount}</div>
                </div>
                <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Approved</div>
                  <div className="mt-2 text-3xl font-semibold tracking-[-0.04em]">{approvedCount}</div>
                </div>
                <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Images</div>
                  <div className="mt-2 text-3xl font-semibold tracking-[-0.04em]">{imageCount}</div>
                </div>
              </div>
              <Separator />
              <div className="flex items-center justify-between gap-4 text-sm text-muted-foreground">
                <span>
                  Generated <span data-generated-at={generatedAt}>just now</span>
                </span>
                <span>{filtered.length} visible rows</span>
              </div>
            </CardContent>
          </Card>
        </header>

        <Card className="border-border/70 bg-card/90">
          <CardHeader className="gap-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                  <Filter className="size-3.5" />
                  Main table
                </div>
                <CardTitle className="font-display text-3xl tracking-[-0.03em]">Live auction matrix</CardTitle>
                <CardDescription>
                  Same operational model as before: one dense table, now backed by stateful
                  history and proper auth.
                </CardDescription>
              </div>
              <form action="/" className="grid w-full gap-3 sm:grid-cols-2 xl:w-auto xl:grid-cols-4">
                <Select defaultValue={filters.model} name="model">
                  <option value="all">All models</option>
                  <option value="model 3">Model 3</option>
                  <option value="model y">Model Y</option>
                </Select>
                <Select defaultValue={filters.source} name="source">
                  <option value="all">All sources</option>
                  <option value="copart">Copart</option>
                  <option value="iaai">IAAI</option>
                </Select>
                <Select defaultValue={filters.workflow} name="workflow">
                  <option value="all">All workflow</option>
                  <option value="new">New</option>
                  <option value="approved">Approved</option>
                  <option value="removed">Removed</option>
                </Select>
                <div className="flex items-center gap-2">
                  {auth.admin ? (
                    <label className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-border bg-background/80 px-4 text-sm text-muted-foreground">
                      <input defaultChecked={filters.removed} name="removed" type="checkbox" value="1" />
                      Show removed
                    </label>
                  ) : null}
                  <Button className={cn(auth.admin ? "flex-1" : "w-full")} type="submit" variant="outline">
                    Apply
                  </Button>
                </div>
              </form>
            </div>

            {soonLots.length > 0 ? (
              <div className="rounded-[28px] border border-amber-300/60 bg-amber-100/60 p-4 text-sm text-amber-950">
                <div className="mb-2 flex items-center gap-2 font-medium uppercase tracking-[0.18em]">
                  <ShieldCheck className="size-4" />
                  Starting within 12h
                </div>
                <div className="flex flex-wrap gap-2">
                  {soonLots.slice(0, 8).map((lot) => (
                    <a
                      key={`${lot.sourceKey}:${lot.lotNumber}`}
                      className="inline-flex items-center gap-2 rounded-full border border-amber-400/40 bg-background/70 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-background"
                      href={`/lots/${lot.sourceKey}/${lot.lotNumber}`}
                    >
                      <span>{lot.lotNumber}</span>
                      <span className="text-muted-foreground">{formatAuctionDateDisplay(lot)}</span>
                    </a>
                  ))}
                </div>
              </div>
            ) : null}
          </CardHeader>
          <CardContent className="pt-0">
            <Table className="min-w-[1100px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[140px]">Countdown</TableHead>
                  <TableHead className="w-[220px]">Schedule</TableHead>
                  <TableHead className="w-[180px]">Vehicle</TableHead>
                  <TableHead className="w-[320px]">Lot</TableHead>
                  <TableHead className="w-[160px]">State</TableHead>
                  <TableHead className="w-[120px] text-right">Images</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((lot) => (
                  <TableRow key={`${lot.sourceKey}:${lot.lotNumber}`} className="group">
                    <TableCell>
                      <div className="space-y-1">
                        <div className="text-sm font-medium" data-auction-date={lot.auctionDate || ""}>
                          {lot.auctionDate?.includes("T") ? "Loading" : lot.auctionDate ? "Time TBD" : "Pending"}
                        </div>
                        {lot.modelYear ? (
                          <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">MY {lot.modelYear}</div>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="font-medium">{formatAuctionDateDisplay(lot)}</div>
                        <div className="text-xs text-muted-foreground">{lot.location || "Location pending"}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="font-medium">{lot.carType.replace("Tesla ", "")}</div>
                        <div className="text-xs text-muted-foreground">{lot.marker}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-start gap-4">
                        <a
                          className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-[22px] border border-border/70 bg-muted/50"
                          href={`/lots/${lot.sourceKey}/${lot.lotNumber}`}
                        >
                          {lot.primaryImageId ? (
                            <img
                              alt={lot.lotNumber}
                              className="h-full w-full object-cover"
                              src={`/images/${lot.primaryImageId}`}
                            />
                          ) : (
                            <ImageIcon className="size-5 text-muted-foreground" />
                          )}
                        </a>
                        <div className="min-w-0 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <a
                              className="truncate text-base font-semibold tracking-[-0.02em] text-foreground transition-colors hover:text-primary"
                              href={`/lots/${lot.sourceKey}/${lot.lotNumber}`}
                            >
                              {lot.lotNumber}
                            </a>
                            <Badge variant="muted">{lot.sourceLabel}</Badge>
                            <a href={lot.url} rel="noreferrer" target="_blank">
                              <Button size="sm" variant="ghost">
                                <ExternalLink className="size-3.5" />
                                Source
                              </Button>
                            </a>
                            <Button data-copy-lot={lot.lotNumber} size="sm" variant="ghost">
                              <Copy className="size-3.5" />
                              Copy
                            </Button>
                          </div>
                          <p className="line-clamp-2 max-w-[520px] text-sm text-muted-foreground">{lot.evidence || "No evidence snippet yet."}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant={statusVariant(lot.status)}>{lot.status}</Badge>
                        <Badge variant={workflowVariant(lot.workflowState)}>{lot.workflowState}</Badge>
                      </div>
                      {auth.admin ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {lot.workflowState !== "approved" ? (
                            <form action={`/admin/lots/${lot.id}/approve`} method="post">
                              <input name="redirect" type="hidden" value="/" />
                              <Button size="sm" variant="outline" type="submit">
                                <CheckCircle2 className="size-3.5" />
                                Approve
                              </Button>
                            </form>
                          ) : null}
                          {lot.workflowState !== "removed" ? (
                            <form action={`/admin/lots/${lot.id}/remove`} method="post">
                              <input name="redirect" type="hidden" value="/" />
                              <Button size="sm" variant="outline" type="submit">
                                <Trash2 className="size-3.5" />
                                Remove
                              </Button>
                            </form>
                          ) : (
                            <form action={`/admin/lots/${lot.id}/restore`} method="post">
                              <input name="redirect" type="hidden" value="/" />
                              <Button size="sm" variant="outline" type="submit">
                                Restore
                              </Button>
                            </form>
                          )}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="space-y-1">
                        <div className="text-xl font-semibold tracking-[-0.04em]">{lot.imageCount}</div>
                        <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">stored</div>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                <div className="rounded-full border border-dashed border-border bg-muted/40 px-4 py-1 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  Empty state
                </div>
                <div className="max-w-md space-y-1">
                  <p className="font-display text-2xl tracking-[-0.03em]">No lots match these filters.</p>
                  <p className="text-sm text-muted-foreground">
                    Clear the workflow or source filter to widen the table again.
                  </p>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
