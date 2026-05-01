import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { buildDateRenderConfig } from "@/server/date-render";
import { getThemePreferenceFromRequest } from "@/server/theme";

export const getRootData = createServerFn().handler(async () => {
  const request = getRequest();
  const { getAuthState } = await import("@/lib/auth");
  const auth = await getAuthState(request);
  return {
    dateRender: buildDateRenderConfig(request),
    initialThemePreference: getThemePreferenceFromRequest(request),
    isAdmin: auth.admin,
    auth: {
      signedIn: auth.signedIn,
      admin: auth.admin,
      email: auth.email,
    },
  };
});
