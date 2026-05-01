import { createFileRoute } from "@tanstack/react-router";
import { handleAdminLotAction } from "@/lib/auction-action-handlers";

export const Route = createFileRoute("/admin/lots/$lotId/restore")({
  server: {
    handlers: {
      POST: async ({ request, params }) =>
        await handleAdminLotAction(request, params.lotId, "restore"),
    },
  },
});
