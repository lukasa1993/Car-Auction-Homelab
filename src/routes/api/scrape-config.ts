import { createFileRoute } from "@tanstack/react-router";
import { handleScrapeConfig } from "@/lib/auction-api-handlers";

export const Route = createFileRoute("/api/scrape-config")({
  server: {
    handlers: {
      GET: async ({ request }) => await handleScrapeConfig(request),
    },
  },
});
