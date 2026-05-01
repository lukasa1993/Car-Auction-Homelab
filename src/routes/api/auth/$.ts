import { createFileRoute } from "@tanstack/react-router";
import { handleAuthApi } from "@/lib/auction-api-handlers";

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: async ({ request }) => await handleAuthApi(request),
      POST: async ({ request }) => await handleAuthApi(request),
    },
  },
});
