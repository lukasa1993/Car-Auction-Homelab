import { createFileRoute } from "@tanstack/react-router";
import { AuthPage } from "@/ui/pages/auth-page";

export const Route = createFileRoute("/admin/signup")({
  validateSearch: (search): { error?: string; message?: string } => ({
    error: typeof search.error === "string" ? search.error : undefined,
    message: typeof search.message === "string" ? search.message : undefined,
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => deps,
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { authRedirectFromResponse, dispatchAuthRequest } = await import("@/lib/auth");
        const form = await request.formData();
        const email = form.get("email");
        const password = form.get("password");
        const name = form.get("name");
        const response = await dispatchAuthRequest("/api/auth/sign-up/email", request, {
          name: typeof name === "string" ? name : "",
          email: typeof email === "string" ? email : "",
          password: typeof password === "string" ? password : "",
        });
        return await authRedirectFromResponse(
          response,
          "/admin/login?message=Account+created+successfully",
          "/admin/signup",
        );
      },
    },
  },
  component: AdminSignup,
});

function AdminSignup() {
  const { error, message } = Route.useSearch();
  return <AuthPage mode="signup" error={error} message={message} />;
}
