import { createFileRoute } from "@tanstack/react-router";
import { handleAdminLogout } from "@/lib/auction-action-handlers";

export const Route = createFileRoute("/admin/logout")({
  server: {
    handlers: {
      POST: async ({ request }) => await handleAdminLogout(request),
    },
  },
});
