import { createFileRoute } from "@tanstack/react-router";
import { handleImageUpload } from "@/lib/auction-api-handlers";

export const Route = createFileRoute("/api/ingest/image")({
  server: {
    handlers: {
      POST: async ({ request }) => await handleImageUpload(request),
    },
  },
});
