import { createFileRoute } from "@tanstack/react-router";
import { handlePushSubscribe } from "@/lib/auction-api-handlers";

export const Route = createFileRoute("/api/push/subscribe")({
  server: {
    handlers: {
      POST: async ({ request }) => await handlePushSubscribe(request),
      DELETE: async ({ request }) => await handlePushSubscribe(request),
    },
  },
});
