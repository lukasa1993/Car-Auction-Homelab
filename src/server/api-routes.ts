import type { AuthState, ServerServices } from "./context";
import type { IngestPayload, SourceKey } from "../lib/types";
import { parseBoolean } from "../lib/utils";
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
      ...services.store.getScrapeConfig(),
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
    services.liveEvents.broadcast({
      type: "collector_sync",
      title: "Collector sync complete",
      message: `${payload.run.machineName} submitted ${result.upserted} row${result.upserted === 1 ? "" : "s"}${result.missingMarked ? `, with ${result.missingMarked} reconciled missing/canceled row${result.missingMarked === 1 ? "" : "s"}` : ""}.`,
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
      },
    });
    return Response.json(result);
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
    return Response.json(
      services.store.getLotList(authState.admin && parseBoolean(url.searchParams.get("removed"), false)),
    );
  }

  return null;
}
