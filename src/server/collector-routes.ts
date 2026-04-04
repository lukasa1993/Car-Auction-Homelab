import { existsSync } from "node:fs";

import type { ServerServices } from "./context";
import { buildCollectorManifest, resolveCollectorRuntimeFile, signCollectorManifest } from "./collector";
import { notFoundResponse } from "./responses";

export function handleCollectorRoutes(pathname: string, services: ServerServices): Response | null {
  if (pathname === "/collector/manifest.json") {
    return Response.json(buildCollectorManifest(services.config), {
      headers: {
        "cache-control": "no-store",
      },
    });
  }

  if (pathname === "/collector/manifest.sig") {
    const signed = signCollectorManifest(services.config);
    if (!signed) {
      return Response.json({ error: "Collector signing key is not configured" }, { status: 503 });
    }
    return new Response(signed, {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }

  if (pathname.startsWith("/collector/files/")) {
    const relativePath = decodeURIComponent(pathname.slice("/collector/files/".length));
    const absolutePath = resolveCollectorRuntimeFile(services.config, relativePath);
    if (!absolutePath || !existsSync(absolutePath)) {
      return notFoundResponse("Collector file not found");
    }
    return new Response(Bun.file(absolutePath), {
      headers: {
        "cache-control": "no-store",
      },
    });
  }

  return null;
}
