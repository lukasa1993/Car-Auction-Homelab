import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { forwardSetCookieHeaders } from "../lib/auth";
import { AppDocument } from "../ui/document";

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

export function renderPage(title: string, body: React.ReactElement): Response {
  return new Response(`<!doctype html>${renderToStaticMarkup(<AppDocument title={title}>{body}</AppDocument>)}`, {
    headers: {
      "content-type": "text/html; charset=utf-8",
    },
  });
}

export async function authRedirectFromResponse(
  response: Response,
  successRedirect: string,
  failureRedirect: string,
): Promise<Response> {
  if (response.ok) {
    const headers = new Headers();
    forwardSetCookieHeaders(response, headers);
    headers.set("location", successRedirect);
    return new Response(null, { status: 302, headers });
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
  );
}
