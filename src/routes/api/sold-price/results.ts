import { createFileRoute } from "@tanstack/react-router";
import { handleSoldPriceResults } from "@/lib/auction-api-handlers";

export const Route = createFileRoute("/api/sold-price/results")({
  server: {
    handlers: {
      POST: async ({ request }) => await handleSoldPriceResults(request),
    },
  },
});
