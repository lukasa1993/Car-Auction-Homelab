import type { AuthState, ServerServices } from "./context";
import { renderPage } from "./responses";
import { MainPage } from "../ui/pages/main-page";

export function handlePublicPages(
  pathname: string,
  _url: URL,
  _authState: AuthState,
  services: ServerServices,
): Response | null {
  if (pathname !== "/") {
    return null;
  }

  return renderPage(
    "Tesla Auctions",
    <MainPage
      generatedAt={new Date().toISOString()}
      lots={services.store.getLotList(false).filter((lot) => lot.workflowState !== "removed")}
    />,
  );
}
