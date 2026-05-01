import { createFileRoute } from "@tanstack/react-router";
import { handleImageState } from "@/lib/auction-api-handlers";

export const Route = createFileRoute("/api/ingest/image-state")({
  server: {
    handlers: {
      GET: async ({ request }) => await handleImageState(request),
    },
  },
});
