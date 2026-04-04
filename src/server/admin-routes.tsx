import { dispatchAuthRequest, forwardSetCookieHeaders } from "../lib/auth";
import type { AuthState, ServerServices } from "./context";
import { parseLotActionPath, parseTargetForm } from "./forms";
import { authRedirectFromResponse, redirect, renderPage } from "./responses";
import { AdminPage } from "../ui/pages/admin-page";
import { AdminHistoryPage } from "../ui/pages/admin-history-page";
import { AuthPage } from "../ui/pages/auth-page";

export async function handleAdminPages(
  request: Request,
  pathname: string,
  url: URL,
  authState: AuthState,
  services: ServerServices,
): Promise<Response | null> {
  if (pathname === "/admin" && request.method === "GET") {
    if (!authState.signedIn) {
      return renderPage(
        "Admin Sign In",
        <AuthPage
          error={url.searchParams.get("error")}
          mode={url.searchParams.get("mode") === "signup" ? "signup" : "signin"}
        />,
      );
    }
    if (!authState.admin || !authState.email) {
      return renderPage(
        "Admin Sign In",
        <AuthPage
          error="Admin access required"
          mode={url.searchParams.get("mode") === "signup" ? "signup" : "signin"}
        />,
      );
    }
    const historyCount = services.store.getLotList(true).filter((lot) => lot.workflowState !== "new").length;
    return renderPage(
      "Admin",
      <AdminPage email={authState.email} historyCount={historyCount} targets={services.store.getVinTargets()} />,
    );
  }

  if (pathname === "/admin/history" && request.method === "GET") {
    if (!authState.signedIn) {
      return renderPage(
        "Admin Sign In",
        <AuthPage
          error={url.searchParams.get("error")}
          mode={url.searchParams.get("mode") === "signup" ? "signup" : "signin"}
        />,
      );
    }
    if (!authState.admin || !authState.email) {
      return renderPage(
        "Admin Sign In",
        <AuthPage
          error="Admin access required"
          mode={url.searchParams.get("mode") === "signup" ? "signup" : "signin"}
        />,
      );
    }
    const moderatedLots = services.store.getLotList(true).filter((lot) => lot.workflowState !== "new");
    return renderPage("Admin History", <AdminHistoryPage email={authState.email} lots={moderatedLots} />);
  }

  if (pathname === "/admin/login" && request.method === "POST") {
    const form = await request.formData();
    const response = await dispatchAuthRequest("/api/auth/sign-in/email", request, {
      email: String(form.get("email") || ""),
      password: String(form.get("password") || ""),
    });
    return await authRedirectFromResponse(response, "/admin", "/admin");
  }

  if (pathname === "/admin/signup" && request.method === "POST") {
    const form = await request.formData();
    const response = await dispatchAuthRequest("/api/auth/sign-up/email", request, {
      name: String(form.get("name") || ""),
      email: String(form.get("email") || ""),
      password: String(form.get("password") || ""),
    });
    return await authRedirectFromResponse(response, "/admin", "/admin?mode=signup");
  }

  if (pathname === "/admin/logout" && request.method === "POST") {
    const response = await dispatchAuthRequest("/api/auth/sign-out", request);
    const headers = new Headers({ location: "/admin" });
    forwardSetCookieHeaders(response, headers);
    return new Response(null, { status: 302, headers });
  }

  const lotAction = parseLotActionPath(pathname);
  if (lotAction && request.method === "POST") {
    if (!authState.admin || !authState.email) {
      return redirect("/admin?error=Admin%20access%20required");
    }
    const form = await request.formData();
    const redirectTo = String(form.get("redirect") || "/");
    const actionMap = {
      approve: "approved",
      remove: "removed",
      restore: "new",
    } as const;
    services.store.setWorkflowState(lotAction.lotId, actionMap[lotAction.action], authState.email, null);
    return redirect(redirectTo);
  }

  if (pathname === "/admin/targets" && request.method === "POST") {
    if (!authState.admin) {
      return redirect("/admin?error=Admin%20access%20required");
    }
    const form = await request.formData();
    services.store.upsertVinTarget(parseTargetForm(form));
    return redirect("/admin");
  }

  const targetUpdateMatch = pathname.match(/^\/admin\/targets\/([^/]+)$/);
  if (targetUpdateMatch && request.method === "POST") {
    if (!authState.admin) {
      return redirect("/admin?error=Admin%20access%20required");
    }
    const form = await request.formData();
    const payload = parseTargetForm(form, { id: decodeURIComponent(targetUpdateMatch[1]) });
    payload.id = decodeURIComponent(targetUpdateMatch[1]);
    services.store.upsertVinTarget(payload);
    return redirect("/admin");
  }

  return null;
}
