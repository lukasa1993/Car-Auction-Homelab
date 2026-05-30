import { createFileRoute } from "@tanstack/react-router";
import { connectAuctionEvents } from "@/lib/live-events";

export const Route = createFileRoute("/events")({
  server: {
    handlers: {
      GET: async ({ request }) => await connectAuctionEvents(request),
    },
  },
});
