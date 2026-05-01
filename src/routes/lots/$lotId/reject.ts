import { createFileRoute } from "@tanstack/react-router";
import { handlePublicReject } from "@/lib/auction-action-handlers";

export const Route = createFileRoute("/lots/$lotId/reject")({
  server: {
    handlers: {
      POST: async ({ request, params }) => await handlePublicReject(request, params.lotId),
    },
  },
});
