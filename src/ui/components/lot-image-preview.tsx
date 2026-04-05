import type { LotListItem } from "../../lib/types";
import { cn } from "../lib";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "./hover-card";

export interface LotImagePreviewProps {
  lot: LotListItem;
  thumbClassName?: string;
  placeholderClassName?: string;
  hoverSide?: "top" | "right" | "bottom" | "left";
}

export function LotImagePreview({
  lot,
  thumbClassName,
  placeholderClassName,
  hoverSide = "right",
}: LotImagePreviewProps) {
  if (!lot.primaryImageId) {
    return (
      <div
        className={cn(
          "flex h-11 w-16 items-center justify-center rounded-xl border border-dashed border-border text-[10px] text-muted-foreground",
          placeholderClassName,
        )}
      >
        none
      </div>
    );
  }

  const src = `/images/${lot.primaryImageId}`;
  const detailUrl = `/lots/${lot.sourceKey}/${lot.lotNumber}`;
  const previewMeta = [lot.modelYear ? `MY ${lot.modelYear}` : null, lot.location].filter(Boolean).join(" · ");

  return (
    <HoverCard closeDelay={80} openDelay={60}>
      <HoverCardTrigger asChild>
        <a className="group/image block cursor-zoom-in" href={detailUrl}>
          <img
            alt={lot.lotNumber}
            className={cn(
              "h-11 w-16 rounded-xl object-cover ring-1 ring-foreground/10 transition-transform duration-200 group-hover/image:scale-[1.04]",
              thumbClassName,
            )}
            src={src}
          />
        </a>
      </HoverCardTrigger>
      <HoverCardContent
        align="start"
        className="hidden w-[min(42rem,calc(100vw-2rem))] overflow-hidden p-0 sm:block"
        side={hoverSide}
        sideOffset={18}
      >
        <img
          alt={`${lot.carType} ${lot.lotNumber}`}
          className="aspect-[4/3] w-full object-cover"
          src={src}
        />
        <div className="flex flex-wrap items-start justify-between gap-4 border-t border-border/70 bg-popover/95 px-5 py-4">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">{lot.sourceLabel}</p>
            <p className="mt-1 text-xl font-semibold tracking-tight">{lot.carType}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {lot.lotNumber}
              {previewMeta ? ` · ${previewMeta}` : ""}
            </p>
          </div>
          <span className="shrink-0 rounded-full border border-border/70 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            {lot.imageCount > 0 ? "HD image" : "Preview"}
          </span>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
