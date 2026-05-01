import { createFileRoute } from "@tanstack/react-router";
import { handleVapidKey } from "@/lib/auction-api-handlers";

export const Route = createFileRoute("/api/push/vapid-key")({
  server: {
    handlers: {
      GET: ({ request }) => handleVapidKey(request),
    },
  },
});
