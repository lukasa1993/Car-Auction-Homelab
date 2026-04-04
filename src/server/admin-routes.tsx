import type { AuthState, ServerServices } from "./context";
import { parseLotActionPath, parseTargetForm } from "./forms";
import { redirect, renderPage } from "./responses";
import { AdminPage } from "../ui/pages/admin-page";

export async function handleAdminPages(
  request: Request,
  pathname: string,
  authState: AuthState,
  services: ServerServices,
): Promise<Response | null> {
  if (pathname === "/admin" && request.method === "GET") {
    if (!authState.signedIn) {
      return redirect("/login");
    }
    if (!authState.admin || !authState.email) {
      return redirect("/login?error=Admin%20access%20required");
    }
    return renderPage("Admin", <AdminPage email={authState.email} targets={services.store.getVinTargets()} />);
  }

  const lotAction = parseLotActionPath(pathname);
  if (lotAction && request.method === "POST") {
    if (!authState.admin || !authState.email) {
      return redirect("/login?error=Admin%20access%20required");
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
      return redirect("/login?error=Admin%20access%20required");
    }
    const form = await request.formData();
    services.store.upsertVinTarget(parseTargetForm(form));
    return redirect("/admin");
  }

  const targetUpdateMatch = pathname.match(/^\/admin\/targets\/([^/]+)$/);
  if (targetUpdateMatch && request.method === "POST") {
    if (!authState.admin) {
      return redirect("/login?error=Admin%20access%20required");
    }
    const form = await request.formData();
    const payload = parseTargetForm(form, { id: decodeURIComponent(targetUpdateMatch[1]) });
    payload.id = decodeURIComponent(targetUpdateMatch[1]);
    services.store.upsertVinTarget(payload);
    return redirect("/admin");
  }

  return null;
}
