import { existsSync } from "node:fs";

import type { ServerServices } from "./context";
import { notFoundResponse } from "./responses";

export function handleStaticRequest(pathname: string, services: ServerServices): Response | null {
  if (pathname !== "/app.css") {
    return null;
  }

  if (!existsSync(services.config.appCssOutput)) {
    return notFoundResponse("CSS not built");
  }

  return new Response(Bun.file(services.config.appCssOutput), {
    headers: {
      "content-type": "text/css; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
