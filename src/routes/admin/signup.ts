import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/signup")({
  server: {
    handlers: {
      GET: ({ request }) =>
        Response.redirect(
          new URL("/admin/login?error=Account%20creation%20is%20disabled", request.url).toString(),
          303,
        ),
      POST: ({ request }) =>
        Response.redirect(
          new URL("/admin/login?error=Account%20creation%20is%20disabled", request.url).toString(),
          303,
        ),
    },
  },
});
