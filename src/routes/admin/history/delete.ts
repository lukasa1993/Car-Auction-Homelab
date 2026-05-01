import { createFileRoute } from "@tanstack/react-router";
import { handleHistoryDelete } from "@/lib/auction-action-handlers";

export const Route = createFileRoute("/admin/history/delete")({
  server: {
    handlers: {
      POST: async ({ request }) => await handleHistoryDelete(request),
    },
  },
});
