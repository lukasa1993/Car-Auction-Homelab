import { createFileRoute } from "@tanstack/react-router";
import { handleLotReject } from "@/lib/auction-action-handlers";

export const Route = createFileRoute("/lots/$lotId/reject")({
  server: {
    handlers: {
      POST: async ({ request, params }) => await handleLotReject(request, params.lotId),
    },
  },
});
