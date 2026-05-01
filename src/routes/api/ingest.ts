import { createFileRoute } from "@tanstack/react-router";
import { handleIngest } from "@/lib/auction-api-handlers";

export const Route = createFileRoute("/api/ingest")({
  server: {
    handlers: {
      POST: async ({ request }) => await handleIngest(request),
    },
  },
});
