import { createFileRoute, redirect } from "@tanstack/react-router";
import { getAdminHistoryPageData } from "@/lib/auction-pages";
import { AdminHistoryPage } from "@/ui/pages/admin-history-page";

function throwAdminRedirect(redirectTo: string): never {
  if (redirectTo.includes("Admin%20access%20required")) {
    throw redirect({ to: "/admin/login", search: { error: "Admin access required" } });
  }
  throw redirect({ to: "/admin/login", search: {} });
}

export const Route = createFileRoute("/admin/history")({
  loader: async () => {
    const data = await getAdminHistoryPageData();
    if (data.redirectTo) {
      throwAdminRedirect(data.redirectTo);
    }
    return data;
  },
  component: AdminHistory,
});

function AdminHistory() {
  const data = Route.useLoaderData();
  return <AdminHistoryPage email={data.email} lots={data.lots} />;
}
