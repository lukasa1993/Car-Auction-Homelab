import { existsSync } from "node:fs";

import type { ServerServices } from "./context";
import { notFoundResponse } from "./responses";

export function handleStaticRequest(pathname: string, services: ServerServices): Response | null {
  const staticFile =
    pathname === "/app.css"
      ? {
          path: services.config.appCssOutput,
          contentType: "text/css; charset=utf-8",
        }
      : pathname === "/app.js"
        ? {
            path: services.config.appJsOutput,
            contentType: "text/javascript; charset=utf-8",
          }
        : pathname === "/vin.html"
          ? {
              path: `${services.config.publicDir}/vin.html`,
              contentType: "text/html; charset=utf-8",
            }
          : null;

  if (!staticFile) {
    return null;
  }

  if (!existsSync(staticFile.path)) {
    return notFoundResponse("Static asset not built");
  }

  return new Response(Bun.file(staticFile.path), {
    headers: {
      "content-type": staticFile.contentType,
      "cache-control": "no-store",
    },
  });
}
