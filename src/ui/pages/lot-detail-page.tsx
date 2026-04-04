import * as React from "react";
import { ArrowLeft, ExternalLink, ImageIcon } from "lucide-react";

import type { LotDetail } from "../../lib/types";
import { Badge } from "../components/badge";
import { Button } from "../components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/card";
import { Separator } from "../components/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/table";

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
}: {
  detail: LotDetail;
  auth: { signedIn: boolean; admin: boolean };
}) {
  const lot = detail.lot;
  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,rgba(253,250,244,0.96),rgba(246,240,230,0.94))]">
      <div className="mx-auto flex max-w-[1280px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-3">
          <a href="/">
            <Button variant="outline">
              <ArrowLeft className="size-4" />
              Back
            </Button>
          </a>
          <a href={lot.url} rel="noreferrer" target="_blank">
            <Button variant="outline">
              Open source
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
              <h1 className="font-display text-4xl tracking-[-0.04em] sm:text-5xl">{lot.carType}</h1>
              <p className="max-w-3xl text-base leading-7 text-muted-foreground">
                Historical snapshots, moderation actions, source identifiers, and stored media stay
                together on one row so the lot can change without losing its trail.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant={statusVariant(lot.status)}>{lot.status}</Badge>
              <Badge variant={workflowVariant(lot.workflowState)}>{lot.workflowState}</Badge>
              {lot.location ? <Badge variant="muted">{lot.location}</Badge> : null}
              {lot.auctionDateRaw ? <Badge variant="outline">{lot.auctionDateRaw}</Badge> : null}
            </div>
            {auth.admin ? (
              <div className="flex flex-wrap gap-2">
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
              </div>
            ) : null}
          </div>

          <Card className="bg-card/90">
            <CardHeader>
              <CardTitle className="font-display text-2xl tracking-[-0.03em]">Current registry row</CardTitle>
              <CardDescription>Canonical identifiers and last-seen source values.</CardDescription>
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
                  <div className="mt-1 font-medium">{lot.firstSeenAt}</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Last seen</div>
                  <div className="mt-1 font-medium">{lot.lastSeenAt}</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Missing since</div>
                  <div className="mt-1 font-medium">{lot.missingSince || "Active"}</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Canceled at</div>
                  <div className="mt-1 font-medium">{lot.canceledAt || "Not canceled"}</div>
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
          <Card className="bg-card/90">
            <CardHeader>
              <CardTitle className="font-display text-2xl tracking-[-0.03em]">Stored images</CardTitle>
              <CardDescription>Server-owned media files mounted from the Mac mini volume.</CardDescription>
            </CardHeader>
            <CardContent>
              {detail.images.length > 0 ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {detail.images.map((image) => (
                    <a
                      className="group overflow-hidden rounded-[28px] border border-border/70 bg-background/70"
                      href={`/images/${image.id}`}
                      key={image.id}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <img alt={lot.lotNumber} className="aspect-[4/3] w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" src={`/images/${image.id}`} />
                      <div className="space-y-1 p-4 text-sm">
                        <div className="font-medium">{image.mimeType || "image"}</div>
                        <div className="text-xs text-muted-foreground">{image.byteSize} bytes</div>
                      </div>
                    </a>
                  ))}
                </div>
              ) : (
                <div className="flex min-h-52 flex-col items-center justify-center gap-3 rounded-[28px] border border-dashed border-border bg-muted/40 text-center">
                  <ImageIcon className="size-6 text-muted-foreground" />
                  <div>
                    <p className="font-medium">No images stored yet.</p>
                    <p className="text-sm text-muted-foreground">The runner will attach them after ingest when it can fetch them through the browser session.</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-card/90">
            <CardHeader>
              <CardTitle className="font-display text-2xl tracking-[-0.03em]">Manual actions</CardTitle>
              <CardDescription>Moderation and workflow transitions are logged separately from scraper state.</CardDescription>
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
                        <TableCell>{action.createdAt}</TableCell>
                        <TableCell>{action.actor}</TableCell>
                        <TableCell>{action.action}</TableCell>
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

        <Card className="bg-card/90">
          <CardHeader>
            <CardTitle className="font-display text-2xl tracking-[-0.03em]">Snapshot history</CardTitle>
            <CardDescription>Each scrape observation is appended so missing/canceled transitions stay attributable.</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <Table className="min-w-[840px]">
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
                    const payload = snapshot.snapshotJson ? JSON.parse(snapshot.snapshotJson) : null;
                    return (
                      <TableRow key={snapshot.id}>
                        <TableCell>{snapshot.observedAt}</TableCell>
                        <TableCell>{snapshot.isPresent ? "present" : "missing"}</TableCell>
                        <TableCell>{payload?.status || "—"}</TableCell>
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
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
