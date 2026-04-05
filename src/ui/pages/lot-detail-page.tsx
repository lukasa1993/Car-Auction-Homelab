import * as React from "react";
import { ArrowLeft, ExternalLink, ImageIcon } from "lucide-react";

import type { LotDetail } from "../../lib/types";
import { Badge } from "../components/badge";
import { Button } from "../components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/card";
import { Separator } from "../components/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/table";

function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(ms));
}

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${i === 0 ? v.toFixed(0) : v.toFixed(1)} ${units[i]}`;
}

function formatStatus(s: string | null | undefined): string {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function safeParseJson<T = unknown>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

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

export function LotDetailPage({
  detail,
  auth,
}: LotDetailPageProps) {
  const lot = detail.lot;
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex max-w-[1280px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-3">
          <a href="/">
            <Button variant="outline">
              <ArrowLeft className="size-4" />
              Back
            </Button>
          </a>
          <a href={lot.url} rel="noopener noreferrer" target="_blank">
            <Button variant="outline">
              View on {lot.sourceLabel}
              <ExternalLink className="size-4" />
            </Button>
          </a>
        </div>

        <header className="grid gap-6 lg:grid-cols-[1.25fr_0.95fr]">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
              <span>{lot.sourceLabel}</span>
              <span>Lot {lot.lotNumber}</span>
              {lot.sourceDetailId ? <span>Detail {lot.sourceDetailId}</span> : null}
            </div>
            <div className="space-y-2">
              <h1 className="font-display text-4xl tracking-[-0.04em] sm:text-5xl">
                {lot.modelYear ? `${lot.modelYear} ${lot.carType}` : lot.carType}
              </h1>
              <p className="max-w-3xl text-base leading-7 text-muted-foreground">
                {lot.vin || lot.vinPattern || lot.lotNumber}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant={statusVariant(lot.status)}>{formatStatus(lot.status)}</Badge>
              <Badge variant={workflowVariant(lot.workflowState)}>{formatStatus(lot.workflowState)}</Badge>
              {lot.location ? <Badge variant="muted">{lot.location}</Badge> : null}
              {lot.auctionDateRaw ? <Badge variant="outline">{lot.auctionDateRaw}</Badge> : null}
            </div>
            {lot.workflowState === "removed" ? (
              <p className="text-sm text-muted-foreground">
                This listing is hidden from the public feed. Admins can restore it from the <a className="font-medium text-foreground underline-offset-2 hover:underline" href="/admin/history">history page</a>.
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {lot.workflowState !== "removed" ? (
                <form action={`/lots/${lot.id}/reject`} method="post">
                  <input name="redirect" type="hidden" value="/" />
                  <Button type="submit" variant="outline">Reject listing</Button>
                </form>
              ) : null}
              {auth.admin ? (
                <>
                  {lot.workflowState !== "approved" ? (
                    <form action={`/admin/lots/${lot.id}/approve`} method="post">
                      <input name="redirect" type="hidden" value={`/lots/${lot.sourceKey}/${lot.lotNumber}`} />
                      <Button type="submit">Approve</Button>
                    </form>
                  ) : null}
                  {lot.workflowState !== "removed" ? (
                    <form action={`/admin/lots/${lot.id}/remove`} method="post">
                      <input name="redirect" type="hidden" value={`/lots/${lot.sourceKey}/${lot.lotNumber}`} />
                      <Button type="submit" variant="outline">Remove</Button>
                    </form>
                  ) : (
                    <form action={`/admin/lots/${lot.id}/restore`} method="post">
                      <input name="redirect" type="hidden" value={`/lots/${lot.sourceKey}/${lot.lotNumber}`} />
                      <Button type="submit" variant="outline">Restore</Button>
                    </form>
                  )}
                </>
              ) : null}
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="font-display text-2xl tracking-[-0.03em]">Source identifiers</CardTitle>
              <CardDescription>Last-seen values from the source listing.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">VIN pattern</div>
                  <div className="mt-1 font-medium">{lot.vinPattern || "Unknown"}</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">VIN</div>
                  <div className="mt-1 font-medium">{lot.vin || "Unknown"}</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">First seen</div>
                  <div className="mt-1 font-medium">{formatTimestamp(lot.firstSeenAt)}</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Last seen</div>
                  <div className="mt-1 font-medium">{formatTimestamp(lot.lastSeenAt)}</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Missing since</div>
                  <div className="mt-1 font-medium">{lot.missingSince ? formatTimestamp(lot.missingSince) : "Active"}</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Canceled at</div>
                  <div className="mt-1 font-medium">{lot.canceledAt ? formatTimestamp(lot.canceledAt) : "Not canceled"}</div>
                </div>
              </div>
              <Separator />
              <p className="text-sm text-muted-foreground">
                {lot.evidence || "No evidence snippet stored for this lot."}
              </p>
            </CardContent>
          </Card>
        </header>

        <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <Card>
            <CardHeader>
              <CardTitle className="font-display text-2xl tracking-[-0.03em]">Images</CardTitle>
              <CardDescription>Images from auction listing.</CardDescription>
            </CardHeader>
            <CardContent>
              {detail.images.length > 0 ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-2 xl:grid-cols-3">
                  {detail.images.map((image) => (
                    <a
                      className="group overflow-hidden rounded-4xl border border-border/70 bg-background/70"
                      href={`/images/${image.id}`}
                      key={image.id}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      <img alt={`${lot.carType} — lot ${lot.lotNumber}`} className="aspect-[4/3] w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" src={`/images/${image.id}`} />
                      <div className="space-y-1 p-4 text-sm">
                        <div className="font-medium">{image.mimeType || "image"}</div>
                        <div className="text-xs text-muted-foreground">{formatBytes(image.byteSize)}</div>
                      </div>
                    </a>
                  ))}
                </div>
              ) : (
                <div className="flex min-h-52 flex-col items-center justify-center gap-3 rounded-4xl border border-dashed border-border bg-muted/40 text-center">
                  <ImageIcon className="size-6 text-muted-foreground" />
                  <div>
                    <p className="font-medium">No images stored yet.</p>
                    <p className="text-sm text-muted-foreground">Images are fetched in the background and will appear here once the scraper captures them.</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-display text-2xl tracking-[-0.03em]">Moderation log</CardTitle>
              <CardDescription>Manual workflow transitions.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>At</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Note</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.actions.length ? (
                    detail.actions.map((action) => (
                      <TableRow key={action.id}>
                        <TableCell>{formatTimestamp(action.createdAt)}</TableCell>
                        <TableCell>{action.actor}</TableCell>
                        <TableCell>{formatStatus(action.action)}</TableCell>
                        <TableCell>{action.note || "—"}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell className="text-muted-foreground" colSpan={4}>
                        No manual actions yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="font-display text-2xl tracking-[-0.03em]">Scrape history</CardTitle>
            <CardDescription>Observation log from each scrape run.</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Observed at</TableHead>
                    <TableHead>Presence</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Schedule</TableHead>
                    <TableHead>Location</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.snapshots.length ? (
                    detail.snapshots.map((snapshot) => {
                      const payload = safeParseJson<{ status?: string; auctionDateRaw?: string; auctionDate?: string; location?: string }>(snapshot.snapshotJson);
                      return (
                        <TableRow key={snapshot.id}>
                          <TableCell>{formatTimestamp(snapshot.observedAt)}</TableCell>
                          <TableCell>{snapshot.isPresent ? "Present" : "Missing"}</TableCell>
                          <TableCell>{payload?.status ? formatStatus(payload.status) : "—"}</TableCell>
                          <TableCell>{payload?.auctionDateRaw || payload?.auctionDate || "—"}</TableCell>
                          <TableCell>{payload?.location || "—"}</TableCell>
                        </TableRow>
                      );
                    })
                  ) : (
                    <TableRow>
                      <TableCell className="text-muted-foreground" colSpan={5}>
                        No snapshots yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

export interface LotDetailPageProps {
  detail: LotDetail;
  auth: { signedIn: boolean; admin: boolean };
}
