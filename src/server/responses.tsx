import * as React from "react";
import { renderToString } from "react-dom/server";

import { forwardSetCookieHeaders } from "../lib/auth";
import { buildDateRenderConfig } from "./date-render";
import { AppShell } from "../ui/app-shell";
import { AppDocument } from "../ui/document";
import { renderAppPage, type AppPage } from "../ui/page-registry";

export function notFoundResponse(message = "Not found"): Response {
  return Response.json({ error: message }, { status: 404 });
}

export function unauthorizedResponse(message = "Unauthorized"): Response {
  return Response.json({ error: message }, { status: 401 });
}

export function badRequestResponse(message = "Bad request"): Response {
  return Response.json({ error: message }, { status: 400 });
}

export function redirect(location: string, status = 302): Response {
  return new Response(null, {
    status,
    headers: {
      location,
    },
  });
}

export function renderPage(title: string, page: Omit<AppPage, "dateRender">, request: Request): Response {
  const fullPage = {
    ...page,
    dateRender: buildDateRenderConfig(request),
  } as AppPage;

  return new Response(`<!doctype html>${renderToString(
    <AppDocument page={fullPage} title={title}>
      <AppShell>{renderAppPage(fullPage)}</AppShell>
    </AppDocument>,
  )}`, {
    headers: {
      "content-type": "text/html; charset=utf-8",
    },
  });
}

export async function authRedirectFromResponse(
  response: Response,
  successRedirect: string,
  failureRedirect: string,
  redirectStatus = 303,
): Promise<Response> {
  if (response.ok) {
    const headers = new Headers();
    forwardSetCookieHeaders(response, headers);
    headers.set("location", successRedirect);
    return new Response(null, { status: redirectStatus, headers });
  }

  let message = "Authentication failed";
  try {
    const payload = await response.json() as { message?: string; error?: string };
    message = payload.message || payload.error || message;
  } catch {
    // ignore
  }

  return redirect(
    `${failureRedirect}${failureRedirect.includes("?") ? "&" : "?"}error=${encodeURIComponent(message)}`,
    redirectStatus,
  );
}
