import type { AuthState, ServerServices } from "./context";
import type { IngestPayload, SoldPriceResultInput, SourceKey, TargetMetadataUpdatePayload } from "../lib/types";
import { parseBoolean } from "../lib/utils";
import { applyTargetBlacklistToExistingLots, getPatchedScrapeConfig } from "../models/target-blacklist-patch";
import { badRequestResponse, unauthorizedResponse } from "./responses";
import { requireBearer } from "../lib/auth";

export async function handleApiRoutes(
  request: Request,
  pathname: string,
  url: URL,
  authState: AuthState,
  services: ServerServices,
): Promise<Response | null> {
  if (pathname === "/api/scrape-config" && request.method === "GET") {
    if (!requireBearer(request, services.config.ingestToken)) {
      return unauthorizedResponse();
    }
    return Response.json({
      baseUrl: services.config.baseUrl,
      collectorUpdateBaseUrl: services.config.collectorUpdateBaseUrl,
      collectorVersion: services.config.collectorVersion,
      ...getPatchedScrapeConfig(services.store),
    });
  }

  if (pathname === "/api/ingest" && request.method === "POST") {
    if (!requireBearer(request, services.config.ingestToken)) {
      return unauthorizedResponse();
    }
    const payload = await request.json() as IngestPayload;
    if (!payload?.run || !Array.isArray(payload.records)) {
      return badRequestResponse("Malformed ingest payload");
    }
    const result = services.store.ingest(payload);
    const blacklistSweep = applyTargetBlacklistToExistingLots(services.store);
    services.liveEvents.broadcast({
      type: "collector_sync",
      title: "Collector sync complete",
      message: `${payload.run.machineName} submitted ${result.upserted} row${result.upserted === 1 ? "" : "s"}${result.missingMarked ? `, with ${result.missingMarked} reconciled missing/canceled row${result.missingMarked === 1 ? "" : "s"}` : ""}${blacklistSweep.updated ? `, auto-rejecting ${blacklistSweep.updated} blacklist match${blacklistSweep.updated === 1 ? "" : "es"}` : ""}.`,
      createdAt: new Date().toISOString(),
      payload: {
        runId: result.runId,
        collectorId: payload.run.runnerId,
        collectorVersion: payload.run.runnerVersion,
        machineName: payload.run.machineName,
        sourceKeys: payload.run.sourceKeys,
        recordsReceived: payload.records.length,
        upserted: result.upserted,
        missingMarked: result.missingMarked,
        blacklistRejected: blacklistSweep.updated,
      },
    });
    return Response.json({
      ...result,
      blacklistRejected: blacklistSweep.updated,
    });
  }

  if (pathname === "/api/ingest/target-updates" && request.method === "POST") {
    if (!requireBearer(request, services.config.ingestToken)) {
      return unauthorizedResponse();
    }
    const payload = await request.json() as TargetMetadataUpdatePayload;
    if (!Array.isArray(payload?.updates)) {
      return badRequestResponse("Malformed target update payload");
    }
    return Response.json(services.store.applyTargetMetadataUpdates(payload));
  }

  if (pathname === "/api/ingest/image-state" && request.method === "GET") {
    if (!requireBearer(request, services.config.ingestToken)) {
      return unauthorizedResponse();
    }
    const sourceKey = url.searchParams.get("sourceKey") as SourceKey | null;
    const lotNumber = url.searchParams.get("lotNumber");
    if (!sourceKey || !lotNumber) {
      return badRequestResponse("Missing image state lookup params");
    }
    const image = services.store.getLotImageSyncState(sourceKey, lotNumber);
    return Response.json(
      image
        ? {
            imageId: image.id,
            sourceUrl: image.sourceUrl,
            sha256: image.sha256,
            width: image.width,
            height: image.height,
          }
        : null,
    );
  }

  if (pathname === "/api/ingest/image" && request.method === "POST") {
    if (!requireBearer(request, services.config.ingestToken)) {
      return unauthorizedResponse();
    }
    const payload = await request.json() as {
      runId: string;
      sourceKey: SourceKey;
      lotNumber: string;
      sourceUrl: string;
      sortOrder?: number;
      mimeType?: string;
      width?: number | null;
      height?: number | null;
      dataBase64: string;
    };
    if (!payload?.runId || !payload?.sourceKey || !payload?.lotNumber || !payload?.dataBase64) {
      return badRequestResponse("Malformed image payload");
    }
    return Response.json(
      services.store.uploadLotImage({
        runId: payload.runId,
        sourceKey: payload.sourceKey,
        lotNumber: payload.lotNumber,
        sourceUrl: payload.sourceUrl,
        sortOrder: payload.sortOrder ?? 0,
        mimeType: payload.mimeType,
        width: payload.width,
        height: payload.height,
        dataBase64: payload.dataBase64,
      }),
    );
  }

  if (pathname === "/api/lots" && request.method === "GET") {
    if (authState.admin) {
      return Response.json(
        services.store.getLotList(parseBoolean(url.searchParams.get("removed"), false)),
      );
    }
    return Response.json(services.store.getPublicLotList());
  }

  // Diagnostic: recent collector runs with per-target scope notes (filter
  // counters from collector/coverage.ts summarizeScopeCoverage). Token-gated.
  // Used to confirm whether Copart is returning Model X listings that get
  // filtered (and which filter), versus returning none at all.
  if (pathname === "/api/sync-runs" && request.method === "GET") {
    if (!requireBearer(request, services.config.ingestToken)) {
      return unauthorizedResponse();
    }
    const limit = Number(url.searchParams.get("limit") ?? "20");
    return Response.json({ runs: services.store.getRecentSyncRuns(limit) });
  }

  if (pathname === "/api/sold-price/queue" && request.method === "GET") {
    if (!requireBearer(request, services.config.ingestToken)) {
      return unauthorizedResponse();
    }
    const limit = Number(url.searchParams.get("limit") ?? "20");
    return Response.json({
      now: new Date().toISOString(),
      lots: services.store.getSoldPriceQueue(limit),
    });
  }

  if (pathname === "/api/sold-price/results" && request.method === "POST") {
    if (!requireBearer(request, services.config.ingestToken)) {
      return unauthorizedResponse();
    }
    const body = await request.json() as { results?: SoldPriceResultInput[] } | SoldPriceResultInput[];
    const results = Array.isArray(body) ? body : body?.results;
    if (!Array.isArray(results)) {
      return badRequestResponse("Malformed sold-price results payload");
    }
    const summary = services.store.recordSoldPriceResults(results);
    const foundCount = results.filter((result) => result.lookupStatus === "found").length;
    if (foundCount > 0) {
      services.liveEvents.broadcast({
        type: "collector_sync",
        title: "Sold prices updated",
        message: `${foundCount} sold price${foundCount === 1 ? "" : "s"} added from Bidfax.`,
        createdAt: new Date().toISOString(),
        payload: {
          foundCount,
          accepted: summary.accepted,
          skipped: summary.skipped,
        },
      });
    }
    return Response.json(summary);
  }

  if (pathname === "/api/push/vapid-key" && request.method === "GET") {
    return Response.json({ publicKey: services.push.getVapidPublicKey() });
  }

  if (pathname === "/api/push/subscribe" && request.method === "POST") {
    if (!authState.admin) {
      return unauthorizedResponse();
    }
    const body = await request.json() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
    if (!body?.endpoint || !body?.keys?.p256dh || !body?.keys?.auth) {
      return badRequestResponse("Missing push subscription fields");
    }
    services.store.savePushSubscription(body.endpoint, body.keys.p256dh, body.keys.auth);
    return Response.json({ ok: true });
  }

  if (pathname === "/api/push/subscribe" && request.method === "DELETE") {
    if (!authState.admin) {
      return unauthorizedResponse();
    }
    const body = await request.json() as { endpoint?: string };
    if (!body?.endpoint) {
      return badRequestResponse("Missing endpoint");
    }
    services.store.removePushSubscription(body.endpoint);
    return Response.json({ ok: true });
  }

  return null;
}
