import { createFileRoute } from "@tanstack/react-router";
import { handleTargetUpdates } from "@/lib/auction-api-handlers";

export const Route = createFileRoute("/api/ingest/target-updates")({
  server: {
    handlers: {
      POST: async ({ request }) => await handleTargetUpdates(request),
    },
  },
});
