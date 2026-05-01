import "@tanstack/react-start/server-only";
import { dispatchAuthRequest, forwardSetCookieHeaders, getAuthState } from "@/lib/auth";
import { getAuctionStore } from "@/lib/auction-services";
import { parseTargetForm } from "@/server/forms";
import type { WorkflowState } from "@/lib/types";

function redirect(request: Request, path: string, status = 303): Response {
  return Response.redirect(new URL(path, request.url).toString(), status);
}

function isAsyncRequest(request: Request): boolean {
  return request.headers.get("x-auction-request") === "async";
}

function formString(form: FormData, key: string, fallback = ""): string {
  const value = form.get(key);
  return typeof value === "string" ? value : fallback;
}

async function requireAdmin(
  request: Request,
): Promise<Awaited<ReturnType<typeof getAuthState>> | Response> {
  const auth = await getAuthState(request);
  if (auth.admin && auth.email) {
    return auth;
  }
  if (isAsyncRequest(request)) {
    return Response.json({ ok: false, error: "Admin access required" }, { status: 403 });
  }
  return redirect(request, "/admin/login?error=Admin%20access%20required");
}

export async function handlePublicReject(request: Request, lotId: string): Promise<Response> {
  const form = await request.formData();
  const redirectTo = formString(form, "redirect", "/");
  const auth = await getAuthState(request);
  const store = await getAuctionStore();
  await store.setWorkflowState(
    lotId,
    "removed",
    auth.email || "public",
    auth.email ? "Rejected from lot page" : "Rejected from public lot page",
  );
  if (isAsyncRequest(request)) {
    return Response.json({ ok: true, lotId, workflowState: "removed" });
  }
  return redirect(request, redirectTo);
}

export async function handleAdminLotAction(
  request: Request,
  lotId: string,
  action: "approve" | "remove" | "restore" | "delete",
): Promise<Response> {
  const auth = await requireAdmin(request);
  if (auth instanceof Response) {
    return auth;
  }

  const form = await request.formData();
  const redirectTo = formString(form, "redirect", "/");
  const store = await getAuctionStore();

  if (action === "delete") {
    const deleted = await store.hardDeleteLot(lotId);
    if (isAsyncRequest(request)) {
      return Response.json({ ok: deleted, lotId, deleted });
    }
    return redirect(request, redirectTo);
  }

  const workflowState: Record<Exclude<typeof action, "delete">, WorkflowState> = {
    approve: "approved",
    remove: "removed",
    restore: "new",
  };
  await store.setWorkflowState(lotId, workflowState[action], auth.email || "admin", null);
  return redirect(request, redirectTo);
}

export async function handleHistoryDelete(request: Request): Promise<Response> {
  const auth = await requireAdmin(request);
  if (auth instanceof Response) {
    return auth;
  }
  const form = await request.formData();
  const redirectTo = formString(form, "redirect", "/admin/history");
  const lotIds = Array.from(
    new Set(
      form
        .getAll("lotId")
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );

  if (!lotIds.length) {
    if (isAsyncRequest(request)) {
      return Response.json({ ok: false, error: "No lots selected" }, { status: 400 });
    }
    return redirect(request, redirectTo);
  }

  const store = await getAuctionStore();
  const deletedLotIds: string[] = [];
  for (const lotId of lotIds) {
    if (await store.hardDeleteLot(lotId)) {
      deletedLotIds.push(lotId);
    }
  }

  if (isAsyncRequest(request)) {
    return Response.json({
      ok: true,
      deletedCount: deletedLotIds.length,
      deletedLotIds,
      requestedCount: lotIds.length,
    });
  }
  return redirect(request, redirectTo);
}

export async function handleTargetCreate(request: Request): Promise<Response> {
  const auth = await requireAdmin(request);
  if (auth instanceof Response) {
    return auth;
  }
  const form = await request.formData();
  const store = await getAuctionStore();
  try {
    const payload = parseTargetForm(form);
    const id = await store.upsertVinTarget(payload);
    if (isAsyncRequest(request)) {
      const savedTarget = (await store.getVinTargets()).find((target) => target.id === id) || null;
      return Response.json({ ok: true, target: savedTarget });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save target";
    if (isAsyncRequest(request)) {
      return Response.json({ ok: false, error: message }, { status: 400 });
    }
    return redirect(request, `/admin?error=${encodeURIComponent(message)}`);
  }
  return redirect(request, "/admin");
}

export async function handleTargetUpdate(request: Request, targetId: string): Promise<Response> {
  const auth = await requireAdmin(request);
  if (auth instanceof Response) {
    return auth;
  }
  const form = await request.formData();
  const store = await getAuctionStore();
  try {
    const payload = parseTargetForm(form, { id: targetId });
    payload.id = targetId;
    await store.upsertVinTarget(payload);
    if (isAsyncRequest(request)) {
      const savedTarget =
        (await store.getVinTargets()).find((target) => target.id === targetId) || null;
      return Response.json({ ok: true, target: savedTarget });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save target";
    if (isAsyncRequest(request)) {
      return Response.json({ ok: false, error: message }, { status: 400 });
    }
    return redirect(request, `/admin?error=${encodeURIComponent(message)}`);
  }
  return redirect(request, "/admin");
}

export async function handleTargetRemove(request: Request, targetId: string): Promise<Response> {
  const auth = await requireAdmin(request);
  if (auth instanceof Response) {
    return auth;
  }
  const store = await getAuctionStore();
  try {
    await store.removeVinTarget(targetId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to remove target";
    return redirect(request, `/admin?error=${encodeURIComponent(message)}`);
  }
  return redirect(request, "/admin");
}

export async function handleAdminLogout(request: Request): Promise<Response> {
  const response = await dispatchAuthRequest("/api/auth/sign-out", request);
  const headers = new Headers({ location: "/admin/login" });
  forwardSetCookieHeaders(response, headers);
  return new Response(null, { status: 303, headers });
}
