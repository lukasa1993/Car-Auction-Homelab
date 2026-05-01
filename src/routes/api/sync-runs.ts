import { createFileRoute } from "@tanstack/react-router";
import { handleSyncRuns } from "@/lib/auction-api-handlers";

export const Route = createFileRoute("/api/sync-runs")({
  server: {
    handlers: {
      GET: async ({ request }) => await handleSyncRuns(request),
    },
  },
});
