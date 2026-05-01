import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/events")({
  server: {
    handlers: {
      GET: () => {
        const body = new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(": connected\n\n"));
          },
        });
        return new Response(body, {
          headers: {
            "content-type": "text/event-stream; charset=utf-8",
            "cache-control": "no-store",
          },
        });
      },
    },
  },
});
