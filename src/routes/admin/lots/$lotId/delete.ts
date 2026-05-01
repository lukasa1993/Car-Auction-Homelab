import { createFileRoute } from "@tanstack/react-router";
import { handleAdminLotAction } from "@/lib/auction-action-handlers";

export const Route = createFileRoute("/admin/lots/$lotId/delete")({
  server: {
    handlers: {
      POST: async ({ request, params }) =>
        await handleAdminLotAction(request, params.lotId, "delete"),
    },
  },
});
