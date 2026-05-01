import { createFileRoute } from "@tanstack/react-router";
import { handleTargetUpdate } from "@/lib/auction-action-handlers";

export const Route = createFileRoute("/admin/targets/$targetId")({
  server: {
    handlers: {
      POST: async ({ request, params }) => await handleTargetUpdate(request, params.targetId),
    },
  },
});
