import { getAuthState } from "../lib/auth";
import type { ServerServices } from "./context";
import { handleAdminPages } from "./admin-routes";
import { handleApiRoutes } from "./api-routes";
import { handleAuthPages } from "./auth-routes";
import { handleCollectorRoutes } from "./collector-routes";
import { handleEntityPages } from "./entity-routes";
import { notFoundResponse } from "./responses";
import { handleStaticRequest } from "./static-routes";
import { handlePublicPages } from "./public-routes";

export async function handleRequest(request: Request, services: ServerServices): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname;

  const staticResponse = handleStaticRequest(pathname, services);
  if (staticResponse) {
    return staticResponse;
  }

  const authState = await getAuthState(request);

  const authRouteResponse = await handleAuthPages(request, pathname, url, authState);
  if (authRouteResponse) {
    return authRouteResponse;
  }

  if (pathname === "/events") {
    return services.liveEvents.subscribe(request);
  }

  if (pathname === "/health") {
    return Response.json({
      ok: true,
      baseUrl: services.config.baseUrl,
      collectorVersion: services.config.collectorVersion,
      collectorRuntimeDir: services.config.collectorRuntimeDir,
      authConfigured: true,
    });
  }

  const publicPageResponse = handlePublicPages(request, pathname, url, authState, services);
  if (publicPageResponse) {
    return publicPageResponse;
  }

  const entityResponse = await handleEntityPages(request, pathname, authState, services);
  if (entityResponse) {
    return entityResponse;
  }

  const adminResponse = await handleAdminPages(request, pathname, url, authState, services);
  if (adminResponse) {
    return adminResponse;
  }

  const apiResponse = await handleApiRoutes(request, pathname, url, authState, services);
  if (apiResponse) {
    return apiResponse;
  }

  const collectorResponse = handleCollectorRoutes(pathname, services);
  if (collectorResponse) {
    return collectorResponse;
  }

  return notFoundResponse();
}
