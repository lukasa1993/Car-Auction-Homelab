import { createFileRoute } from "@tanstack/react-router";
import { handleSoldPriceQueue } from "@/lib/auction-api-handlers";

export const Route = createFileRoute("/api/sold-price/queue")({
  server: {
    handlers: {
      GET: async ({ request }) => await handleSoldPriceQueue(request),
    },
  },
});
