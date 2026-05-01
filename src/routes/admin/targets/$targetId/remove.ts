import { createFileRoute } from "@tanstack/react-router";
import { handleTargetRemove } from "@/lib/auction-action-handlers";

export const Route = createFileRoute("/admin/targets/$targetId/remove")({
  server: {
    handlers: {
      POST: async ({ request, params }) => await handleTargetRemove(request, params.targetId),
    },
  },
});
