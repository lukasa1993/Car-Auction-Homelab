import { existsSync } from "node:fs";
import path from "node:path";

import type { AuthState, ServerServices } from "./context";
import type { SourceKey } from "../lib/types";
import { parsePublicRejectPath } from "./forms";
import { notFoundResponse, redirect, renderPage } from "./responses";

export async function handleEntityPages(
  request: Request,
  pathname: string,
  authState: AuthState,
  services: ServerServices,
): Promise<Response | null> {
  const publicReject = parsePublicRejectPath(pathname);
  if (publicReject && request.method === "POST") {
    const form = await request.formData();
    const redirectTo = String(form.get("redirect") || "/");
    services.store.setWorkflowState(
      publicReject.lotId,
      "removed",
      authState.email || "public",
      authState.email ? "Rejected from lot page" : "Rejected from public lot page",
    );
    if (request.headers.get("x-auction-request") === "async") {
      return Response.json({ ok: true, lotId: publicReject.lotId, workflowState: "removed" });
    }
    return redirect(redirectTo);
  }

  const lotMatch = pathname.match(/^\/lots\/(copart|iaai)\/([^/]+)$/);
  if (lotMatch) {
    const detail = services.store.getLotDetail(lotMatch[1] as SourceKey, decodeURIComponent(lotMatch[2]));
    if (!detail) {
      return notFoundResponse("Lot not found");
    }
    return renderPage(
      `${detail.lot.lotNumber} · ${detail.lot.sourceLabel}`,
      {
        kind: "lot-detail",
        props: {
          auth: authState,
          detail,
        },
      },
      request,
      authState.admin,
    );
  }

  if (pathname.startsWith("/images/")) {
    const imageId = decodeURIComponent(pathname.slice("/images/".length));
    const image = services.store.getImageRow(imageId);
    if (!image) {
      return notFoundResponse("Image not found");
    }
    const absolutePath = path.join(services.config.mediaDir, image.storagePath);
    if (!existsSync(absolutePath)) {
      return notFoundResponse("Image file missing");
    }
    return new Response(Bun.file(absolutePath), {
      headers: {
        "content-type": image.mimeType || "application/octet-stream",
        "cache-control": "public, max-age=300",
      },
    });
  }

  return null;
}
