import { createFileRoute } from "@tanstack/react-router";
import { handleTargetCreate } from "@/lib/auction-action-handlers";

export const Route = createFileRoute("/admin/targets")({
  server: {
    handlers: {
      POST: async ({ request }) => await handleTargetCreate(request),
    },
  },
});
