import * as React from "react";
import { ExternalLink, Search } from "lucide-react";

import type { LotListItem } from "../../lib/types";
import { AdminHeader } from "../components/admin-header";
import { Badge } from "../components/badge";
import { Button } from "../components/button";
import { CopyTextButton } from "../components/copy-text-button";
import { LotImagePreview } from "../components/lot-image-preview";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/table";
import { LocalizedDateText, useDateNowMs } from "../date-render";
import { stripTeslaPrefix } from "../format";

type FilterKey = "all" | "removed" | "approved";

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

function titleCase(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s;
}

function historyTimestamp(lot: LotListItem): string | null {
  return lot.removedAt || lot.approvedAt || lot.updatedAt || null;
}

function relativeFromNow(iso: string | null, nowMs: number): string {
  if (!iso) return "";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "";
  const diffMin = Math.floor((nowMs - ms) / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffMin < 1440) return `${Math.floor(diffMin / 60)}h ago`;
  const days = Math.floor(diffMin / 1440);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function sortHistory(lots: LotListItem[]): LotListItem[] {
  return [...lots].sort((a, b) => {
    const bMs = Date.parse(historyTimestamp(b) || "") || 0;
    const aMs = Date.parse(historyTimestamp(a) || "") || 0;
    return bMs - aMs;
  });
}

function FilterChip({
  active,
  count,
  children,
  onClick,
}: {
  active: boolean;
  count: number;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      className={`inline-flex items-center gap-1.5 rounded-3xl px-3 py-1.5 text-xs font-medium transition ${
        active
          ? "bg-background text-foreground shadow-sm ring-1 ring-foreground/10"
          : "text-muted-foreground hover:text-foreground"
      }`}
      onClick={onClick}
      type="button"
    >
      {children}
      <span
        className={`tabular-nums ${active ? "text-muted-foreground" : "text-muted-foreground/70"}`}
      >
        {count}
      </span>
    </button>
  );
}

function HistoryImageCell({ lot }: { lot: LotListItem }) {
  return (
    <LotImagePreview
      hoverSide="right"
      lot={lot}
      placeholderClassName="h-12 w-16 rounded-xl"
      thumbClassName="h-12 w-16 rounded-xl"
    />
  );
}

function RowActions({ lot }: { lot: LotListItem }) {
  return (
    <div className="flex items-center justify-end gap-1.5">
      <a href={lot.url} rel="noopener noreferrer" target="_blank" title="Open on source site">
        <Button size="sm" variant="outline">
          <ExternalLink className="size-3.5" />
        </Button>
      </a>
      <CopyTextButton idleLabel="Lot" value={lot.lotNumber} />
      {lot.workflowState === "removed" ? (
        <form action={`/admin/lots/${lot.id}/restore`} method="post">
          <input name="redirect" type="hidden" value="/admin/history" />
          <Button size="sm" type="submit">
            Restore
          </Button>
        </form>
      ) : lot.workflowState === "approved" ? (
        <form action={`/admin/lots/${lot.id}/remove`} method="post">
          <input name="redirect" type="hidden" value="/admin/history" />
          <Button size="sm" type="submit" variant="outline">
            Remove
          </Button>
        </form>
      ) : null}
      <form
        action={`/admin/lots/${lot.id}/delete`}
        method="post"
        onSubmit={(event) => {
          if (!window.confirm(`Permanently delete lot ${lot.lotNumber}? This removes the row and its images.`)) {
            event.preventDefault();
          }
        }}
      >
        <input name="redirect" type="hidden" value="/admin/history" />
        <Button
          className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
          size="sm"
          type="submit"
          variant="outline"
        >
          Delete
        </Button>
      </form>
    </div>
  );
}

export function AdminHistoryPage({ email, lots }: AdminHistoryPageProps) {
  const [filter, setFilter] = React.useState<FilterKey>("all");
  const [query, setQuery] = React.useState("");
  const nowMs = useDateNowMs(60000);

  const sorted = React.useMemo(() => sortHistory(lots), [lots]);

  const counts = React.useMemo(
    () => ({
      all: sorted.length,
      removed: sorted.filter((lot) => lot.workflowState === "removed").length,
      approved: sorted.filter((lot) => lot.workflowState === "approved").length,
    }),
    [sorted],
  );

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return sorted.filter((lot) => {
      if (filter === "removed" && lot.workflowState !== "removed") return false;
      if (filter === "approved" && lot.workflowState !== "approved") return false;
      if (!q) return true;
      const haystack = [
        lot.carType,
        lot.lotNumber,
        lot.vin,
        lot.vinPattern,
        lot.location,
        lot.workflowNote,
        lot.sourceLabel,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [sorted, filter, query]);

  return (
    <main className="min-h-screen bg-background px-3 py-3 text-foreground sm:px-5 sm:py-5">
      <div className="mx-auto flex max-w-[1120px] flex-col gap-4">
        <AdminHeader active="history" email={email} historyCount={counts.all} />

        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Moderation history</h1>
          <p className="text-sm text-muted-foreground">
            {counts.all} moderated · {counts.removed} hidden · {counts.approved} approved
          </p>
        </div>

        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-0.5 rounded-3xl bg-muted p-0.5">
            <FilterChip
              active={filter === "all"}
              count={counts.all}
              onClick={() => setFilter("all")}
            >
              All
            </FilterChip>
            <FilterChip
              active={filter === "removed"}
              count={counts.removed}
              onClick={() => setFilter("removed")}
            >
              Hidden
            </FilterChip>
            <FilterChip
              active={filter === "approved"}
              count={counts.approved}
              onClick={() => setFilter("approved")}
            >
              Approved
            </FilterChip>
          </div>
          <div className="relative sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              className="h-8 w-full rounded-3xl border border-border bg-background pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search lot, VIN, note, location…"
              type="search"
              value={query}
            />
          </div>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[80px]">Image</TableHead>
                <TableHead>Listing</TableHead>
                <TableHead className="hidden md:table-cell">Status</TableHead>
                <TableHead className="hidden lg:table-cell">Note</TableHead>
                <TableHead className="hidden md:table-cell">When</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length ? (
                filtered.map((lot) => {
                  const ts = historyTimestamp(lot);
                  return (
                    <TableRow key={lot.id}>
                      <TableCell>
                        <HistoryImageCell lot={lot} />
                      </TableCell>
                      <TableCell>
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <a
                            className="truncate text-sm font-medium text-foreground hover:underline"
                            href={`/lots/${lot.sourceKey}/${lot.lotNumber}`}
                          >
                            {lot.modelYear
                              ? `${lot.modelYear} ${stripTeslaPrefix(lot.carType)}`
                              : stripTeslaPrefix(lot.carType)}
                          </a>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                            <span className="font-mono">Lot {lot.lotNumber}</span>
                            <span>·</span>
                            <span>{lot.sourceLabel}</span>
                            {lot.location ? (
                              <>
                                <span>·</span>
                                <span className="truncate">{lot.location}</span>
                              </>
                            ) : null}
                          </div>
                          <div className="mt-1 flex items-center gap-1.5 md:hidden">
                            <Badge variant={workflowVariant(lot.workflowState)}>
                              {titleCase(lot.workflowState)}
                            </Badge>
                            {ts ? (
                              <span className="text-[11px] text-muted-foreground">
                                {relativeFromNow(ts, nowMs)}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <Badge variant={workflowVariant(lot.workflowState)}>
                          {titleCase(lot.workflowState)}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {lot.workflowNote ? (
                          <span className="line-clamp-2 max-w-[240px] text-xs text-muted-foreground">
                            {lot.workflowNote}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground/50">—</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {ts ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs text-foreground"><LocalizedDateText format="timestamp" iso={ts} /></span>
                            <span className="text-[11px] text-muted-foreground">
                              {relativeFromNow(ts, nowMs)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground/50">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <RowActions lot={lot} />
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell className="py-12 text-center text-sm text-muted-foreground" colSpan={6}>
                    {query || filter !== "all"
                      ? "No listings match your filter."
                      : "No moderated listings yet."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </main>
  );
}

export interface AdminHistoryPageProps {
  email: string;
  lots: LotListItem[];
}
