import handler, { createServerEntry } from "@tanstack/react-start/server-entry";
import { connectAuctionEvents } from "@/lib/live-events";

export { AuctionEvents } from "@/lib/live-events";

export default createServerEntry({
  async fetch(request, opts) {
    const url = new URL(request.url);
    if (url.pathname === "/events") {
      return await connectAuctionEvents(request);
    }

    return await handler.fetch(request, opts);
  },
});
