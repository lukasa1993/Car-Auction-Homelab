import "@tanstack/react-start/server-only";
import { auth, getAuthState, requireBearer } from "@/lib/auth";
import { getRuntimeConfig, getAuctionStore } from "@/lib/auction-services";
import type {
  IngestPayload,
  SoldPriceResultInput,
  SourceKey,
  TargetMetadataUpdatePayload,
} from "@/lib/types";

function badRequest(message: string): Response {
  return Response.json({ error: message }, { status: 400 });
}

function unauthorized(): Response {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

function parseBoolean(value: string | null | undefined, defaultValue = false): boolean {
  if (value == null || value === "") {
    return defaultValue;
  }
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function requireIngest(request: Request): Response | null {
  if (!requireBearer(request, getRuntimeConfig(request).ingestToken)) {
    return unauthorized();
  }
  return null;
}

export async function handleAuthApi(request: Request): Promise<Response> {
  return await auth.handler(request);
}

export async function handleScrapeConfig(request: Request): Promise<Response> {
  const unauthorizedResponse = requireIngest(request);
  if (unauthorizedResponse) return unauthorizedResponse;
  const config = getRuntimeConfig(request);
  const store = await getAuctionStore();
  return Response.json({
    baseUrl: config.baseUrl,
    collectorUpdateBaseUrl: config.collectorUpdateBaseUrl,
    collectorVersion: config.collectorVersion,
    ...(await store.getScrapeConfig()),
  });
}

export async function handleIngest(request: Request): Promise<Response> {
  const unauthorizedResponse = requireIngest(request);
  if (unauthorizedResponse) return unauthorizedResponse;
  const payload = (await request.json()) as IngestPayload;
  if (!payload?.run || !Array.isArray(payload.records)) {
    return badRequest("Malformed ingest payload");
  }
  const store = await getAuctionStore();
  const result = await store.ingest(payload);
  const blacklistSweep = await store.applyTargetBlacklistToExistingLots();
  return Response.json({
    ...result,
    blacklistRejected: blacklistSweep.updated,
  });
}

export async function handleTargetUpdates(request: Request): Promise<Response> {
  const unauthorizedResponse = requireIngest(request);
  if (unauthorizedResponse) return unauthorizedResponse;
  const payload = (await request.json()) as TargetMetadataUpdatePayload;
  if (!Array.isArray(payload?.updates)) {
    return badRequest("Malformed target update payload");
  }
  const store = await getAuctionStore();
  return Response.json(await store.applyTargetMetadataUpdates(payload));
}

export async function handleImageState(request: Request): Promise<Response> {
  const unauthorizedResponse = requireIngest(request);
  if (unauthorizedResponse) return unauthorizedResponse;
  const url = new URL(request.url);
  const sourceKey = url.searchParams.get("sourceKey") as SourceKey | null;
  const lotNumber = url.searchParams.get("lotNumber");
  if (!sourceKey || !lotNumber) {
    return badRequest("Missing image state lookup params");
  }
  const store = await getAuctionStore();
  const image = await store.getLotImageSyncState(sourceKey, lotNumber);
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

export async function handleImageUpload(request: Request): Promise<Response> {
  const unauthorizedResponse = requireIngest(request);
  if (unauthorizedResponse) return unauthorizedResponse;
  const payload = (await request.json()) as {
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
    return badRequest("Malformed image payload");
  }
  const store = await getAuctionStore();
  return Response.json(
    await store.uploadLotImage({
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

export async function handleLotsApi(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const authState = await getAuthState(request);
  const store = await getAuctionStore();
  if (authState.admin) {
    return Response.json(
      await store.getLotList(parseBoolean(url.searchParams.get("removed"), false)),
    );
  }
  return Response.json(await store.getPublicLotList());
}

export async function handleSyncRuns(request: Request): Promise<Response> {
  const unauthorizedResponse = requireIngest(request);
  if (unauthorizedResponse) return unauthorizedResponse;
  const url = new URL(request.url);
  const store = await getAuctionStore();
  return Response.json({
    runs: await store.getRecentSyncRuns(Number(url.searchParams.get("limit") ?? "20")),
  });
}

export async function handleSoldPriceQueue(request: Request): Promise<Response> {
  const unauthorizedResponse = requireIngest(request);
  if (unauthorizedResponse) return unauthorizedResponse;
  const url = new URL(request.url);
  const store = await getAuctionStore();
  return Response.json({
    now: new Date().toISOString(),
    lots: await store.getSoldPriceQueue(Number(url.searchParams.get("limit") ?? "20")),
  });
}

export async function handleSoldPriceResults(request: Request): Promise<Response> {
  const unauthorizedResponse = requireIngest(request);
  if (unauthorizedResponse) return unauthorizedResponse;
  const body = (await request.json()) as
    | { results?: SoldPriceResultInput[] }
    | SoldPriceResultInput[];
  const results = Array.isArray(body) ? body : body?.results;
  if (!Array.isArray(results)) {
    return badRequest("Malformed sold-price results payload");
  }
  const store = await getAuctionStore();
  return Response.json(await store.recordSoldPriceResults(results));
}

export function handleVapidKey(request: Request): Response {
  return Response.json({ publicKey: getRuntimeConfig(request).vapidPublicKey });
}

export async function handlePushSubscribe(request: Request): Promise<Response> {
  const authState = await getAuthState(request);
  if (!authState.admin) {
    return unauthorized();
  }
  const store = await getAuctionStore();
  if (request.method === "DELETE") {
    const body = (await request.json()) as { endpoint?: string };
    if (!body?.endpoint) {
      return badRequest("Missing endpoint");
    }
    await store.removePushSubscription(body.endpoint);
    return Response.json({ ok: true });
  }
  const body = (await request.json()) as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };
  if (!body?.endpoint || !body?.keys?.p256dh || !body?.keys?.auth) {
    return badRequest("Missing push subscription fields");
  }
  await store.savePushSubscription(body.endpoint, body.keys.p256dh, body.keys.auth);
  return Response.json({ ok: true });
}

export async function handleImageResponse(imageId: string): Promise<Response> {
  const store = await getAuctionStore();
  const result = await store.getImageObject(imageId);

  if (!result) {
    return Response.json({ error: "Image not found" }, { status: 404 });
  }

  return new Response(result.object.body, {
    headers: {
      "content-type":
        result.image.mimeType ||
        result.object.httpMetadata?.contentType ||
        "application/octet-stream",
      "cache-control": "public, max-age=300",
      "x-lot-number": result.lotNumber,
      "x-source-key": result.sourceKey,
      "x-image-id": result.image.id,
    },
  });
}
