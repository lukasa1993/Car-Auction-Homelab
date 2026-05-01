import { createFileRoute, redirect } from "@tanstack/react-router";
import { getLoginPageData } from "@/lib/auction-pages";
import { AuthPage } from "@/ui/pages/auth-page";

export const Route = createFileRoute("/admin/login")({
  validateSearch: (search): { error?: string; message?: string } => ({
    error: typeof search.error === "string" ? search.error : undefined,
    message: typeof search.message === "string" ? search.message : undefined,
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const data = await getLoginPageData({ data: deps });
    if (data.redirectTo) {
      throw redirect({ to: "/admin", search: {} });
    }
    return data;
  },
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { authRedirectFromResponse, dispatchAuthRequest, ensureBootstrapAdminUser } =
          await import("@/lib/auth");
        await ensureBootstrapAdminUser();
        const form = await request.formData();
        const email = form.get("email");
        const password = form.get("password");
        const response = await dispatchAuthRequest("/api/auth/sign-in/email", request, {
          email: typeof email === "string" ? email : "",
          password: typeof password === "string" ? password : "",
        });
        return await authRedirectFromResponse(response, "/admin", "/admin/login");
      },
    },
  },
  component: AdminLogin,
});

function AdminLogin() {
  const data = Route.useLoaderData();
  return <AuthPage error={data.error} message={data.message} />;
}
