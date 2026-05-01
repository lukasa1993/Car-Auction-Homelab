import handler, { createServerEntry } from "@tanstack/react-start/server-entry";

export default createServerEntry({
  async fetch(request, opts) {
    return await handler.fetch(request, opts);
  },
});
