import { createMiddleware, createStart } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";

const securityHeaders = createMiddleware().server(async ({ request, next }) => {
  if (request.method === "GET") {
    setResponseHeader("X-Content-Type-Options", "nosniff");
    setResponseHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  }
  return next();
});

export const startInstance = createStart(() => ({
  requestMiddleware: [securityHeaders],
}));
