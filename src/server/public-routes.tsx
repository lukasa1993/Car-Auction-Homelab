import type { AuthState, ServerServices } from "./context";
import { parseBoolean } from "../lib/utils";
import { renderPage } from "./responses";
import { MainPage } from "../ui/pages/main-page";

export function handlePublicPages(
  pathname: string,
  url: URL,
  authState: AuthState,
  services: ServerServices,
): Response | null {
  if (pathname !== "/") {
    return null;
  }

  const showRemoved = authState.admin && parseBoolean(url.searchParams.get("removed"), false);
  return renderPage(
    "Tesla Auctions",
    <MainPage
      auth={authState}
      filters={{
        model: url.searchParams.get("model") || "all",
        source: url.searchParams.get("source") || "all",
        workflow: url.searchParams.get("workflow") || "all",
        removed: showRemoved,
      }}
      generatedAt={new Date().toISOString()}
      lots={services.store.getLotList(showRemoved)}
    />,
  );
}
