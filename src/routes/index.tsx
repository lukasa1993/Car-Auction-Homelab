import { createFileRoute } from "@tanstack/react-router";
import { getMainPageData } from "@/lib/auction-pages";
import { MainPage } from "@/ui/pages/main-page";

export const Route = createFileRoute("/")({
  validateSearch: (search): { tab?: string } => ({
    tab: typeof search.tab === "string" ? search.tab : undefined,
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => await getMainPageData({ data: deps }),
  component: Home,
});

function Home() {
  const props = Route.useLoaderData();
  return <MainPage {...props} />;
}
