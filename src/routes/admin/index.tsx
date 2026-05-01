import { createFileRoute, redirect } from "@tanstack/react-router";
import { getAdminPageData } from "@/lib/auction-pages";
import { AdminPage } from "@/ui/pages/admin-page";

function throwAdminRedirect(redirectTo: string): never {
  if (redirectTo.includes("Admin%20access%20required")) {
    throw redirect({ to: "/admin/login", search: { error: "Admin access required" } });
  }
  throw redirect({ to: "/admin/login", search: {} });
}

export const Route = createFileRoute("/admin/")({
  validateSearch: (search): { error?: string } => ({
    error: typeof search.error === "string" ? search.error : undefined,
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const data = await getAdminPageData({ data: deps });
    if (data.redirectTo) {
      throwAdminRedirect(data.redirectTo);
    }
    return data;
  },
  component: Admin,
});

function Admin() {
  const data = Route.useLoaderData();
  return (
    <AdminPage
      email={data.email}
      error={data.error}
      historyCount={data.historyCount}
      targets={data.targets}
    />
  );
}
