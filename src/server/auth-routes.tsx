import {
  auth,
  dispatchAuthRequest,
  forwardSetCookieHeaders,
} from "../lib/auth";
import type { AuthState } from "./context";
import { authRedirectFromResponse, redirect, renderPage } from "./responses";
import { AuthPage } from "../ui/pages/auth-page";

export async function handleAuthPages(
  request: Request,
  pathname: string,
  url: URL,
  authState: AuthState,
): Promise<Response | null> {
  if (pathname === "/login" && request.method === "GET") {
    if (authState.signedIn) {
      return redirect(authState.admin ? "/admin" : "/");
    }
    return renderPage(
      "Sign In",
      <AuthPage
        error={url.searchParams.get("error")}
        mode={url.searchParams.get("mode") === "signup" ? "signup" : "signin"}
      />,
    );
  }

  if (pathname === "/login" && request.method === "POST") {
    const form = await request.formData();
    const response = await dispatchAuthRequest("/api/auth/sign-in/email", request, {
      email: String(form.get("email") || ""),
      password: String(form.get("password") || ""),
    });
    return await authRedirectFromResponse(response, "/", "/login");
  }

  if (pathname === "/signup" && request.method === "POST") {
    const form = await request.formData();
    const response = await dispatchAuthRequest("/api/auth/sign-up/email", request, {
      name: String(form.get("name") || ""),
      email: String(form.get("email") || ""),
      password: String(form.get("password") || ""),
    });
    return await authRedirectFromResponse(response, "/", "/login?mode=signup");
  }

  if (pathname === "/logout" && request.method === "POST") {
    const response = await dispatchAuthRequest("/api/auth/sign-out", request);
    const headers = new Headers({ location: "/" });
    forwardSetCookieHeaders(response, headers);
    return new Response(null, { status: 302, headers });
  }

  if (pathname.startsWith("/api/auth/")) {
    return await auth.handler(request);
  }

  return null;
}
