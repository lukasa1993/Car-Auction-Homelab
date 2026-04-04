type LiveEventName = "collector_sync";

export interface LiveEventPayload {
  type: LiveEventName;
  title: string;
  message: string;
  createdAt: string;
  payload?: Record<string, unknown>;
}

interface LiveClient {
  id: string;
  writer: WritableStreamDefaultWriter<Uint8Array>;
  heartbeat: ReturnType<typeof setInterval>;
}

const encoder = new TextEncoder();

function encodeEvent(name: string, payload: unknown): Uint8Array {
  return encoder.encode(`event: ${name}\ndata: ${JSON.stringify(payload)}\n\n`);
}

export class LiveEventBus {
  private clients = new Map<string, LiveClient>();

  subscribe(request: Request): Response {
    const stream = new TransformStream<Uint8Array, Uint8Array>();
    const writer = stream.writable.getWriter();
    const client: LiveClient = {
      id: crypto.randomUUID(),
      writer,
      heartbeat: setInterval(() => {
        void writer.write(encodeEvent("ping", { at: new Date().toISOString() })).catch(() => {
          this.removeClient(client.id);
        });
      }, 15_000),
    };

    this.clients.set(client.id, client);
    request.signal.addEventListener("abort", () => {
      this.removeClient(client.id);
    });

    void writer.write(
      encodeEvent("connected", {
        id: client.id,
        at: new Date().toISOString(),
      }),
    ).catch(() => {
      this.removeClient(client.id);
    });

    return new Response(stream.readable, {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "x-accel-buffering": "no",
      },
    });
  }

  broadcast(payload: LiveEventPayload): void {
    const frame = encodeEvent(payload.type, payload);
    for (const client of this.clients.values()) {
      void client.writer.write(frame).catch(() => {
        this.removeClient(client.id);
      });
    }
  }

  private removeClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) {
      return;
    }
    clearInterval(client.heartbeat);
    this.clients.delete(clientId);
    void client.writer.close().catch(() => {});
  }
}
