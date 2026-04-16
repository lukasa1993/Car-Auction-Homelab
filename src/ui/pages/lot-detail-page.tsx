import * as React from "react";
import { ArrowLeft, ExternalLink, ImageIcon } from "lucide-react";

import type { LotDetail, LotImageRow } from "../../lib/types";
import { Badge } from "../components/badge";
import { Button } from "../components/button";
import { CopyTextButton } from "../components/copy-text-button";
import { LocalizedDateText, useDateNowMs } from "../date-render";
import {
  extractLotColor,
  formatAuctionCountdown,
  formatBytes,
  hasExactAuctionTime,
  stripTeslaPrefix,
} from "../format";

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

function titleCase(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s;
}

function ImageGallery({ images, title }: { images: LotImageRow[]; title: string }) {
  const [activeIndex, setActiveIndex] = React.useState(0);
  const active = images[activeIndex];

  if (!images.length) {
    return (
      <div className="flex min-h-52 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-muted/40 text-center">
        <ImageIcon className="size-5 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">No images yet.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <a
        className="block overflow-hidden rounded-2xl border border-border/70 bg-muted/30"
        href={`/images/${active.id}`}
        rel="noopener noreferrer"
        target="_blank"
      >
        <img
          alt={`${title} — image ${activeIndex + 1}`}
          className="aspect-[4/3] w-full object-cover"
          src={`/images/${active.id}`}
        />
      </a>
      {images.length > 1 ? (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {images.map((image, idx) => (
            <button
              className={`h-16 w-24 shrink-0 overflow-hidden rounded-xl transition ${
                idx === activeIndex
                  ? "ring-2 ring-foreground"
                  : "ring-1 ring-border/70 hover:ring-foreground/40"
              }`}
              key={image.id}
              onClick={() => setActiveIndex(idx)}
              type="button"
            >
              <img
                alt=""
                className="h-full w-full object-cover"
                src={`/images/${image.id}`}
              />
            </button>
          ))}
        </div>
      ) : null}
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>
          {activeIndex + 1} / {images.length}
          {active.mimeType ? ` · ${active.mimeType}` : ""}
        </span>
        <span>{formatBytes(active.byteSize)}</span>
      </div>
    </div>
  );
}

function FactRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <dt className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </dt>
      <dd className="min-w-0 text-sm font-medium text-foreground">{children}</dd>
    </>
  );
}

function Mono({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-[13px] tracking-tight">{children}</span>;
}

function Countdown({ auctionDate }: { auctionDate: string }) {
  const nowMs = useDateNowMs(1000);

  const countdown = formatAuctionCountdown(auctionDate, nowMs);
  if (!countdown) return null;

  return (
    <div className="rounded-2xl bg-[color:var(--soon-bg)] px-4 py-3 ring-1 ring-[color:var(--soon-border)]">
      <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
        Auction in
      </div>
      <div className="mt-1 font-display text-2xl font-semibold tabular-nums tracking-tight">
        {countdown}
      </div>
      <LocalizedDateText
        className="mt-0.5 block text-[11px] text-muted-foreground empty:hidden"
        emptyLabel=""
        format="auction-local-time"
        iso={auctionDate}
      />
    </div>
  );
}

export function LotDetailPage({ detail, auth }: LotDetailPageProps) {
  const lot = detail.lot;
  const title = stripTeslaPrefix(lot.carType);
  const heading = lot.modelYear ? `${lot.modelYear} ${title}` : title;
  const color = lot.color || extractLotColor(lot.evidence);
  const redirectTo = `/lots/${lot.sourceKey}/${lot.lotNumber}`;
  const showCountdown = hasExactAuctionTime(lot.auctionDate);

  return (
    <main className="min-h-screen bg-background px-3 py-3 text-foreground sm:px-5 sm:py-5">
      <div className="mx-auto flex max-w-[1040px] flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <a href="/">
              <Button size="sm" variant="outline">
                <ArrowLeft className="size-3.5" />
                Back
              </Button>
            </a>
            <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              {lot.sourceLabel} · Lot {lot.lotNumber}
              {lot.sourceDetailId ? ` · Detail ${lot.sourceDetailId}` : ""}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a href={lot.url} rel="noopener noreferrer" target="_blank">
              <Button size="sm" variant="outline">
                View on {lot.sourceLabel}
                <ExternalLink className="size-3.5" />
              </Button>
            </a>
            {lot.workflowState !== "removed" ? (
              <form action={`/lots/${lot.id}/reject`} method="post">
                <input name="redirect" type="hidden" value="/" />
                <Button size="sm" type="submit" variant="outline">
                  Reject
                </Button>
              </form>
            ) : null}
            {auth.admin ? (
              <>
                {lot.workflowState !== "approved" ? (
                  <form action={`/admin/lots/${lot.id}/approve`} method="post">
                    <input name="redirect" type="hidden" value={redirectTo} />
                    <Button size="sm" type="submit">
                      Approve
                    </Button>
                  </form>
                ) : null}
                {lot.workflowState !== "removed" ? (
                  <form action={`/admin/lots/${lot.id}/remove`} method="post">
                    <input name="redirect" type="hidden" value={redirectTo} />
                    <Button size="sm" type="submit" variant="outline">
                      Remove
                    </Button>
                  </form>
                ) : (
                  <form action={`/admin/lots/${lot.id}/restore`} method="post">
                    <input name="redirect" type="hidden" value={redirectTo} />
                    <Button size="sm" type="submit" variant="outline">
                      Restore
                    </Button>
                  </form>
                )}
                <form
                  action={`/admin/lots/${lot.id}/delete`}
                  method="post"
                  onSubmit={(event) => {
                    if (!window.confirm(`Permanently delete lot ${lot.lotNumber}? This removes the row and its images.`)) {
                      event.preventDefault();
                    }
                  }}
                >
                  <input name="redirect" type="hidden" value="/" />
                  <Button
                    className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
                    size="sm"
                    type="submit"
                    variant="outline"
                  >
                    Delete
                  </Button>
                </form>
              </>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{heading}</h1>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant={statusVariant(lot.status)}>{titleCase(lot.status)}</Badge>
            <Badge variant={workflowVariant(lot.workflowState)}>
              {titleCase(lot.workflowState)}
            </Badge>
            {lot.location ? <Badge variant="muted">{lot.location}</Badge> : null}
            {lot.auctionDateRaw ? <Badge variant="outline">{lot.auctionDateRaw}</Badge> : null}
          </div>
          {lot.workflowState === "removed" ? (
            <p className="text-xs text-muted-foreground">
              Hidden from the public feed.
              {auth.admin ? " Use Restore to bring it back." : " An admin can restore it."}
            </p>
          ) : null}
        </div>

        <div className="grid gap-4 md:grid-cols-[1.4fr_1fr]">
          <ImageGallery images={detail.images} title={heading} />

          <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
            {showCountdown && lot.auctionDate ? <Countdown auctionDate={lot.auctionDate} /> : null}

            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5">
              {lot.vin ? (
                <FactRow label="VIN">
                  <div className="flex items-center gap-2">
                    <Mono>{lot.vin}</Mono>
                    <CopyTextButton value={lot.vin} />
                  </div>
                </FactRow>
              ) : null}
              {lot.vinPattern ? (
                <FactRow label="Pattern">
                  <Mono>{lot.vinPattern}</Mono>
                </FactRow>
              ) : null}
              <FactRow label="Lot #">
                <div className="flex items-center gap-2">
                  <Mono>{lot.lotNumber}</Mono>
                  <CopyTextButton value={lot.lotNumber} />
                </div>
              </FactRow>
              {lot.sourceDetailId ? (
                <FactRow label="Detail">
                  <Mono>{lot.sourceDetailId}</Mono>
                </FactRow>
              ) : null}
              {lot.modelYear ? (
                <FactRow label="Model year">{lot.modelYear}</FactRow>
              ) : null}
              {color ? <FactRow label="Color">{color}</FactRow> : null}
              {lot.location ? <FactRow label="Location">{lot.location}</FactRow> : null}
              {lot.auctionDateRaw ? (
                <FactRow label="Auction">{lot.auctionDateRaw}</FactRow>
              ) : null}
              <FactRow label="First seen"><LocalizedDateText format="timestamp" iso={lot.firstSeenAt} /></FactRow>
              <FactRow label="Last seen"><LocalizedDateText format="timestamp" iso={lot.lastSeenAt} /></FactRow>
              {lot.missingSince ? (
                <FactRow label="Missing since"><LocalizedDateText format="timestamp" iso={lot.missingSince} /></FactRow>
              ) : null}
              {lot.canceledAt ? (
                <FactRow label="Canceled"><LocalizedDateText format="timestamp" iso={lot.canceledAt} /></FactRow>
              ) : null}
            </dl>

            {lot.evidence ? (
              <>
                <div className="h-px bg-border" />
                <p className="text-xs leading-relaxed text-muted-foreground">{lot.evidence}</p>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  );
}

export interface LotDetailPageProps {
  detail: LotDetail;
  auth: { signedIn: boolean; admin: boolean };
}
