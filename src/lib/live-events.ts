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
  type: "collector_sync";
  payload: LiveEventPayload;
};

type LiveEventsEnv = Env & {
  AUCTION_EVENTS: DurableObjectNamespace<AuctionEvents>;
};

type LiveEventsClient = {
  enqueue: (chunk: string) => void;
  close: () => void;
};

const encoder = new TextEncoder();

function getAuctionEventsStub(): DurableObjectStub<AuctionEvents> {
  const namespace = (env as LiveEventsEnv).AUCTION_EVENTS;
  return namespace.get(namespace.idFromName("global"));
}

function eventStreamHeaders(): HeadersInit {
  return {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    "content-encoding": "identity",
  };
}

function formatSseEvent(message: LiveEventMessage): string {
  const data = JSON.stringify(message.payload);
  return [`event: ${message.type}`, ...data.split(/\r?\n/).map((line) => `data: ${line}`), ""].join(
    "\n",
  );
}

export async function connectAuctionEvents(request: Request): Promise<Response> {
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
  private readonly clients = new Map<string, LiveEventsClient>();

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

    if (request.method !== "GET") {
      return new Response("Method not allowed", { status: 405 });
    }

    return this.connect(request);
  }

  private connect(request: Request): Response {
    const clientId = crypto.randomUUID();
    const queue: string[] = [];
    let closed = false;
    let wake: (() => void) | null = null;
    let heartbeat: ReturnType<typeof setInterval> | null = null;

    const waitForChunk = () =>
      new Promise<void>((resolve) => {
        wake = resolve;
      });

    const enqueue = (chunk: string) => {
      if (closed) return;
      queue.push(chunk);
      wake?.();
      wake = null;
    };

    const cleanup = () => {
      if (closed) return;
      closed = true;
      if (heartbeat != null) {
        clearInterval(heartbeat);
        heartbeat = null;
      }
      this.clients.delete(clientId);
      wake?.();
      wake = null;
    };

    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        this.clients.set(clientId, { enqueue, close: cleanup });
        enqueue("retry: 3000\n: connected\n\n");
        heartbeat = setInterval(() => enqueue(": keep-alive\n\n"), 25000);

        const pump = async () => {
          try {
            while (!closed) {
              if (queue.length === 0) {
                await waitForChunk();
              }
              while (!closed && queue.length > 0) {
                controller.enqueue(encoder.encode(queue.shift()!));
              }
            }
          } finally {
            cleanup();
            try {
              controller.close();
            } catch {
              // Stream was already cancelled by the client.
            }
          }
        };

        void pump();
      },
      cancel: cleanup,
    });

    request.signal.addEventListener("abort", cleanup, { once: true });

    return new Response(stream, {
      headers: eventStreamHeaders(),
    });
  }

  private broadcast(message: LiveEventMessage): number {
    const chunk = formatSseEvent(message);
    let delivered = 0;

    for (const client of this.clients.values()) {
      try {
        client.enqueue(chunk);
        delivered += 1;
      } catch {
        client.close();
      }
    }

    return delivered;
  }
}
