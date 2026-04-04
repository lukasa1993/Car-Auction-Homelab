import * as React from "react";
import { ArrowLeft } from "lucide-react";

import type { LotListItem } from "../../lib/types";
import { Badge } from "../components/badge";
import { Button } from "../components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/card";
import { CopyTextButton } from "../components/copy-text-button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/table";

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

function sortHistory(lots: LotListItem[]): LotListItem[] {
  return [...lots].sort((left, right) => {
    const rightMs = Date.parse(right.removedAt || right.updatedAt);
    const leftMs = Date.parse(left.removedAt || left.updatedAt);
    return rightMs - leftMs;
  });
}

function formatSourceLink(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname.replace(/^www\./, "")}${parsed.pathname}`;
  } catch {
    return url;
  }
}

function HistoryRowActions({ lot }: { lot: LotListItem }) {
  return (
    <div className="flex flex-wrap justify-end gap-2">
      <a href={lot.url} rel="noreferrer" target="_blank">
        <Button size="sm" variant="outline">Open</Button>
      </a>
      <CopyTextButton value={lot.lotNumber} />
      {lot.workflowState === "removed" ? (
        <form action={`/admin/lots/${lot.id}/restore`} method="post">
          <input name="redirect" type="hidden" value="/admin/history" />
          <Button size="sm" type="submit" variant="outline">Restore</Button>
        </form>
      ) : null}
    </div>
  );
}

export function AdminHistoryPage({
  email,
  lots,
}: AdminHistoryPageProps) {
  const removedLots = lots.filter((lot) => lot.workflowState === "removed");
  const visibleLots = sortHistory(lots);

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex max-w-[1120px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <a href="/admin">
              <Button size="sm" variant="outline"><ArrowLeft className="size-3.5" /> Targets</Button>
            </a>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Admin history</div>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">Moderation history</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="success">Admin</Badge>
            <span className="text-sm text-muted-foreground">{email}</span>
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>{visibleLots.length}</CardTitle>
              <CardDescription>Moderated listings</CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{removedLots.length}</CardTitle>
              <CardDescription>Currently hidden from the public feed</CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Restore from here</CardTitle>
              <CardDescription>Removed rows stay available to admin and can be returned to the feed.</CardDescription>
            </CardHeader>
          </Card>
        </section>

        <Card>
          <CardHeader>
            <CardTitle>Removed and moderated listings</CardTitle>
            <CardDescription>Public rejects land here immediately. Restore returns a row to the live feed.</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <Table className="min-w-[1040px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Listing</TableHead>
                  <TableHead>Source link</TableHead>
                  <TableHead>Workflow</TableHead>
                  <TableHead>Removed at</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleLots.length ? (
                  visibleLots.map((lot) => (
                    <TableRow key={lot.id}>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <a className="font-medium text-foreground" href={`/lots/${lot.sourceKey}/${lot.lotNumber}`}>
                            {lot.carType}
                          </a>
                          <div className="text-xs text-muted-foreground">Lot {lot.lotNumber}</div>
                          <div className="text-xs text-muted-foreground">{lot.sourceLabel}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <a
                          className="break-all text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                          href={lot.url}
                          rel="noreferrer"
                          target="_blank"
                          title={lot.url}
                        >
                          {formatSourceLink(lot.url)}
                        </a>
                      </TableCell>
                      <TableCell>
                        <Badge variant={workflowVariant(lot.workflowState)}>{lot.workflowState}</Badge>
                      </TableCell>
                      <TableCell>{lot.removedAt || "—"}</TableCell>
                      <TableCell>{lot.location || "—"}</TableCell>
                      <TableCell>{lot.workflowNote || "—"}</TableCell>
                      <TableCell className="text-right">
                        <HistoryRowActions lot={lot} />
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell className="text-muted-foreground" colSpan={7}>
                      No moderated listings yet.
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

export interface AdminHistoryPageProps {
  email: string;
  lots: LotListItem[];
}
