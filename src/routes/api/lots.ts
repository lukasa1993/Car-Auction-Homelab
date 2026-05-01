import { createFileRoute } from "@tanstack/react-router";
import { handleLotsApi } from "@/lib/auction-api-handlers";

export const Route = createFileRoute("/api/lots")({
  server: {
    handlers: {
      GET: async ({ request }) => await handleLotsApi(request),
    },
  },
});
