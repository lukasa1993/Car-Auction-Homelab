import { auth } from "../lib/auth";
import type { AuthState } from "./context";

export async function handleAuthPages(
  request: Request,
  pathname: string,
  _url: URL,
  _authState: AuthState,
): Promise<Response | null> {
  if (pathname === "/api/auth/sign-up/email") {
    return Response.json(
      {
        error: "Account creation is disabled",
        message: "Account creation is disabled",
      },
      { status: 403 },
    );
  }

  if (pathname.startsWith("/api/auth/")) {
    return await auth.handler(request);
  }

  if (pathname === "/login" || pathname === "/signup" || pathname === "/logout") {
    return Response.redirect("/admin", 302);
  }

  return null;
}
