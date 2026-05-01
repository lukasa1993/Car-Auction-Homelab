import { createFileRoute } from "@tanstack/react-router";
import { getRuntimeConfig } from "@/lib/auction-services";

export const Route = createFileRoute("/health")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const config = getRuntimeConfig(request);
        const { getSecrets } = await import("@/utils/env");
        const secrets = getSecrets();
        return Response.json({
          ok: true,
          baseUrl: config.baseUrl,
          collectorVersion: config.collectorVersion,
          authConfigured: Boolean(secrets.BETTER_AUTH_SECRET && secrets.AUCTION_ADMIN_EMAILS),
          storage: "cloudflare-d1-r2",
        });
      },
    },
  },
});
