import * as React from "react";

import type { LotListItem } from "../../lib/types";

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

function renderLotLink(lot: LotListItem) {
  return lot.sourceKey === "copart" ? lot.lotNumber : "open";
}

export function MainPage({
  lots,
  generatedAt,
}: {
  lots: LotListItem[];
  generatedAt: string;
}) {
  const nowMs = Date.now();
  const soonLots = lots.filter((lot) => isStartingSoon(lot, nowMs));
  const remainingLots = lots.filter((lot) => !isStartingSoon(lot, nowMs));

  return (
    <main className="min-h-screen bg-background px-3 py-3 text-foreground sm:px-5 sm:py-5">
      <div className="mx-auto max-w-[1040px]">
        <header className="mb-4">
          <h1 className="text-base font-semibold">Tesla Auctions <span className="text-[12px] font-normal text-muted-foreground" data-generated-at={generatedAt}>{generatedAt}</span></h1>
        </header>

        <section className="mb-6 overflow-hidden rounded-md border border-[color:var(--soon-border)] bg-[color:var(--soon-bg)]">
          <div className="border-b border-[color:var(--soon-border)] px-3 py-2 text-[13px] font-semibold">Upcoming &lt; 12h</div>
          {soonLots.length > 0 ? (
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr>
                  <th className="px-3 py-2 text-left text-[12px] font-semibold uppercase tracking-[0.03em] text-muted-foreground">Status</th>
                  <th className="px-3 py-2 text-left text-[12px] font-semibold uppercase tracking-[0.03em] text-muted-foreground">Image</th>
                  <th className="px-3 py-2 text-left text-[12px] font-semibold uppercase tracking-[0.03em] text-muted-foreground">Model</th>
                  <th className="px-3 py-2 text-left text-[12px] font-semibold uppercase tracking-[0.03em] text-muted-foreground">Link</th>
                </tr>
              </thead>
              <tbody>
                {soonLots.map((lot) => (
                  <tr key={`${lot.sourceKey}:${lot.lotNumber}`} className="border-t border-border/70">
                    <td className="px-3 py-2 align-top">
                      <span className="whitespace-nowrap" data-auction-date={lot.auctionDate || ""}>{hasExactAuctionTime(lot.auctionDate) ? "Loading" : "Time TBD"}</span>
                      {lot.modelYear ? <span className="mt-0.5 block text-[11px] text-muted-foreground">MY {lot.modelYear}</span> : null}
                    </td>
                    <td className="px-3 py-2 align-top">
                      {lot.primaryImageId ? (
                        <a href={`/lots/${lot.sourceKey}/${lot.lotNumber}`}>
                          <img
                            alt={lot.lotNumber}
                            className="h-11 w-16 rounded border border-border object-cover"
                            src={`/images/${lot.primaryImageId}`}
                          />
                        </a>
                      ) : (
                        <div className="flex h-11 w-16 items-center justify-center rounded border border-dashed border-border text-[10px] text-muted-foreground">
                          none
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">{lot.carType.replace("Tesla ", "")}</td>
                    <td className="px-3 py-2 align-top">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <a href={lot.url} rel="noreferrer" target="_blank">{renderLotLink(lot)}</a>
                          {lot.sourceKey === "copart" ? (
                            <button
                              className="copy-lot rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground"
                              data-copy-lot={lot.lotNumber}
                              type="button"
                            >
                              copy
                            </button>
                          ) : null}
                        </div>
                        {lot.location ? <span className="text-[11px] text-muted-foreground">{lot.location}</span> : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="px-3 py-3 text-[13px] text-muted-foreground">No upcoming auctions within 12 hours.</div>
          )}
        </section>

        <div className="mb-[-1px] flex gap-0">
          <button className="tab active rounded-t-md border border-b-0 border-border px-4 py-2 text-[13px] font-semibold text-foreground" data-filter="Tesla Model 3" type="button">Model 3</button>
          <button className="tab rounded-t-md border border-transparent border-b-0 px-4 py-2 text-[13px] font-semibold text-muted-foreground" data-filter="Tesla Model Y" type="button">Model Y</button>
          <button className="tab rounded-t-md border border-transparent border-b-0 px-4 py-2 text-[13px] font-semibold text-muted-foreground" data-filter="all" type="button">All</button>
        </div>

        <section className="overflow-hidden rounded-b-md rounded-tr-md border border-border">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                <th className="px-3 py-2 text-left text-[12px] font-semibold uppercase tracking-[0.03em] text-muted-foreground">Status</th>
                <th className="px-3 py-2 text-left text-[12px] font-semibold uppercase tracking-[0.03em] text-muted-foreground">Image</th>
                <th className="px-3 py-2 text-left text-[12px] font-semibold uppercase tracking-[0.03em] text-muted-foreground">Auction Date</th>
                <th className="px-3 py-2 text-left text-[12px] font-semibold uppercase tracking-[0.03em] text-muted-foreground">Model</th>
                <th className="px-3 py-2 text-left text-[12px] font-semibold uppercase tracking-[0.03em] text-muted-foreground">Link</th>
              </tr>
            </thead>
            <tbody id="main-body">
              {remainingLots.map((lot) => (
                <tr
                  key={`${lot.sourceKey}:${lot.lotNumber}`}
                  className={lot.status === "done" ? "opacity-35" : ""}
                  data-car={lot.carType}
                >
                  <td className="border-t border-border px-3 py-2 align-top">
                    <span className="whitespace-nowrap" data-auction-date={lot.auctionDate || ""}>{hasExactAuctionTime(lot.auctionDate) ? "Loading" : lot.auctionDate ? "Time TBD" : "Date pending"}</span>
                    {lot.modelYear ? <span className="mt-0.5 block text-[11px] text-muted-foreground">MY {lot.modelYear}</span> : null}
                  </td>
                  <td className="border-t border-border px-3 py-2 align-top">
                    {lot.primaryImageId ? (
                      <a href={`/lots/${lot.sourceKey}/${lot.lotNumber}`}>
                        <img
                          alt={lot.lotNumber}
                          className="h-11 w-16 rounded border border-border object-cover"
                          src={`/images/${lot.primaryImageId}`}
                        />
                      </a>
                    ) : (
                      <div className="flex h-11 w-16 items-center justify-center rounded border border-dashed border-border text-[10px] text-muted-foreground">
                        none
                      </div>
                    )}
                  </td>
                  <td className="border-t border-border px-3 py-2 align-top">
                    <div>{formatAuctionDateDisplay(lot)}</div>
                    {hasExactAuctionTime(lot.auctionDate) ? <div className="mt-0.5 text-[11px] text-muted-foreground" data-local-auction-date={lot.auctionDate || ""} /> : null}
                  </td>
                  <td className="border-t border-border px-3 py-2 align-top">{lot.carType.replace("Tesla ", "")}</td>
                  <td className="border-t border-border px-3 py-2 align-top">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <a href={lot.url} rel="noreferrer" target="_blank">{renderLotLink(lot)}</a>
                        {lot.sourceKey === "copart" ? (
                          <button
                            className="copy-lot rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground"
                            data-copy-lot={lot.lotNumber}
                            type="button"
                          >
                            copy
                          </button>
                        ) : null}
                      </div>
                      {lot.location ? <span className="text-[11px] text-muted-foreground">{lot.location}</span> : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </main>
  );
}
