import "@tanstack/react-start/server-only";
import { DurableObject, env } from "cloudflare:workers";

export type LiveEventPayload = {
  title?: string;
  message?: string;
  runId?: string;
  upserted?: number;
  missingMarked?: number;
  blacklistRejected?: number;
  timestamp?: string;
};

type LiveEventMessage = {
  type: "collector_sync" | "connected" | "pong";
  payload: LiveEventPayload;
};

type LiveEventsEnv = Env & {
  AUCTION_EVENTS: DurableObjectNamespace<AuctionEvents>;
};

function getAuctionEventsStub(): DurableObjectStub<AuctionEvents> {
  const namespace = (env as LiveEventsEnv).AUCTION_EVENTS;
  return namespace.get(namespace.idFromName("global"));
}

function expectedWebSocketResponse(): Response {
  return new Response("Expected WebSocket upgrade", {
    status: 426,
    headers: {
      upgrade: "websocket",
    },
  });
}

export async function connectAuctionEvents(request: Request): Promise<Response> {
  if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    return expectedWebSocketResponse();
  }

  return await getAuctionEventsStub().fetch(request);
}

export async function publishCollectorSync(payload: LiveEventPayload): Promise<void> {
  await getAuctionEventsStub().fetch("https://auction-events.internal/publish", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      type: "collector_sync",
      payload: {
        ...payload,
        timestamp: payload.timestamp ?? new Date().toISOString(),
      },
    } satisfies LiveEventMessage),
  });
}

function isLiveEventMessage(value: unknown): value is LiveEventMessage {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { type?: unknown; payload?: unknown };
  return (
    candidate.type === "collector_sync" &&
    !!candidate.payload &&
    typeof candidate.payload === "object"
  );
}

export class AuctionEvents extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/publish") {
      const message = (await request.json()) as unknown;
      if (!isLiveEventMessage(message)) {
        return Response.json({ error: "Malformed live event" }, { status: 400 });
      }

      return Response.json({
        ok: true,
        connections: this.broadcast(message),
      });
    }

    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return expectedWebSocketResponse();
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];

    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ connectedAt: new Date().toISOString() });
    server.send(
      JSON.stringify({
        type: "connected",
        payload: { timestamp: new Date().toISOString() },
      } satisfies LiveEventMessage),
    );

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (message !== "ping") return;
    ws.send(
      JSON.stringify({
        type: "pong",
        payload: { timestamp: new Date().toISOString() },
      } satisfies LiveEventMessage),
    );
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    ws.close(code, reason);
  }

  private broadcast(message: LiveEventMessage): number {
    const serialized = JSON.stringify(message);
    let delivered = 0;

    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(serialized);
        delivered += 1;
      } catch {
        socket.close(1011, "Failed to deliver live event");
      }
    }

    return delivered;
  }
}
