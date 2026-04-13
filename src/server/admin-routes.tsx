import { dispatchAuthRequest, forwardSetCookieHeaders } from "../lib/auth";
import type { AuthState, ServerServices } from "./context";
import { parseLotActionPath, parseTargetForm } from "./forms";
import { authRedirectFromResponse, redirect, renderPage } from "./responses";

export async function handleAdminPages(
  request: Request,
  pathname: string,
  url: URL,
  authState: AuthState,
  services: ServerServices,
): Promise<Response | null> {
  if (pathname === "/admin/login" && request.method === "GET") {
    if (authState.admin && authState.email) {
      return redirect("/admin");
    }

    return renderPage(
      "Admin Sign In",
      {
        kind: "auth",
        props: {
          error: url.searchParams.get("error"),
        },
      },
      request,
    );
  }

  if (pathname === "/admin" && request.method === "GET") {
    if (!authState.signedIn) {
      return redirect("/admin/login");
    }
    if (!authState.admin || !authState.email) {
      return redirect("/admin/login?error=Admin%20access%20required");
    }
    const historyCount = services.store.getLotList(true).filter((lot) => lot.workflowState !== "new").length;
    return renderPage(
      "Admin",
      {
        kind: "admin",
        props: {
          email: authState.email,
          error: url.searchParams.get("error"),
          historyCount,
          targets: services.store.getVinTargets(),
        },
      },
      request,
      true,
    );
  }

  if (pathname === "/admin/history" && request.method === "GET") {
    if (!authState.signedIn) {
      return redirect("/admin/login");
    }
    if (!authState.admin || !authState.email) {
      return redirect("/admin/login?error=Admin%20access%20required");
    }
    const moderatedLots = services.store.getLotList(true).filter((lot) => lot.workflowState !== "new");
    return renderPage(
      "Admin History",
      {
        kind: "admin-history",
        props: {
          email: authState.email,
          lots: moderatedLots,
        },
      },
      request,
      true,
    );
  }

  if (pathname === "/admin/login" && request.method === "POST") {
    const form = await request.formData();
    const response = await dispatchAuthRequest("/api/auth/sign-in/email", request, {
      email: String(form.get("email") || ""),
      password: String(form.get("password") || ""),
    });
    return await authRedirectFromResponse(response, "/admin", "/admin/login");
  }

  if (pathname === "/admin/signup") {
    return redirect("/admin/login?error=Account%20creation%20is%20disabled", 303);
  }

  if (pathname === "/admin/logout" && request.method === "POST") {
    const response = await dispatchAuthRequest("/api/auth/sign-out", request);
    const headers = new Headers({ location: "/admin/login" });
    forwardSetCookieHeaders(response, headers);
    return new Response(null, { status: 303, headers });
  }

  const lotAction = parseLotActionPath(pathname);
  if (lotAction && request.method === "POST") {
    if (!authState.admin || !authState.email) {
      return redirect("/admin/login?error=Admin%20access%20required", 303);
    }
    const form = await request.formData();
    const redirectTo = String(form.get("redirect") || "/");
    const actionMap = {
      approve: "approved",
      remove: "removed",
      restore: "new",
    } as const;
    services.store.setWorkflowState(lotAction.lotId, actionMap[lotAction.action], authState.email, null);
    return redirect(redirectTo, 303);
  }

  if (pathname === "/admin/targets" && request.method === "POST") {
    if (!authState.admin) {
      return redirect("/admin/login?error=Admin%20access%20required", 303);
    }
    const form = await request.formData();
    try {
      services.store.upsertVinTarget(parseTargetForm(form));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save target";
      return redirect(`/admin?error=${encodeURIComponent(message)}`, 303);
    }
    return redirect("/admin", 303);
  }

  const targetDeleteMatch = pathname.match(/^\/admin\/targets\/([^/]+)\/remove$/);
  if (targetDeleteMatch && request.method === "POST") {
    if (!authState.admin) {
      return redirect("/admin/login?error=Admin%20access%20required", 303);
    }
    try {
      services.store.removeVinTarget(decodeURIComponent(targetDeleteMatch[1]));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to remove target";
      return redirect(`/admin?error=${encodeURIComponent(message)}`, 303);
    }
    return redirect("/admin", 303);
  }

  const targetUpdateMatch = pathname.match(/^\/admin\/targets\/([^/]+)$/);
  if (targetUpdateMatch && request.method === "POST") {
    if (!authState.admin) {
      return redirect("/admin/login?error=Admin%20access%20required", 303);
    }
    const form = await request.formData();
    const payload = parseTargetForm(form, { id: decodeURIComponent(targetUpdateMatch[1]) });
    payload.id = decodeURIComponent(targetUpdateMatch[1]);
    try {
      services.store.upsertVinTarget(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save target";
      return redirect(`/admin?error=${encodeURIComponent(message)}`, 303);
    }
    return redirect("/admin", 303);
  }

  return null;
}
