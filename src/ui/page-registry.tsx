import * as React from "react";

import { DateRenderProvider } from "./date-render";
import { AdminHistoryPage, type AdminHistoryPageProps } from "./pages/admin-history-page";
import { AdminPage, type AdminPageProps } from "./pages/admin-page";
import { AuthPage, type AuthPageProps } from "./pages/auth-page";
import { LotDetailPage, type LotDetailPageProps } from "./pages/lot-detail-page";
import { MainPage, type MainPageProps } from "./pages/main-page";
import type { DateRenderConfig } from "../lib/date-render";

type AppPageBase = {
  dateRender: DateRenderConfig;
  isAdmin?: boolean;
};

export type AppPage =
  | ({ kind: "admin"; props: AdminPageProps } & AppPageBase)
  | ({ kind: "admin-history"; props: AdminHistoryPageProps } & AppPageBase)
  | ({ kind: "auth"; props: AuthPageProps } & AppPageBase)
  | ({ kind: "lot-detail"; props: LotDetailPageProps } & AppPageBase)
  | ({ kind: "main"; props: MainPageProps } & AppPageBase);

export function renderAppPage(page: AppPage): React.ReactElement {
  let content: React.ReactElement;
  switch (page.kind) {
    case "admin":
      content = <AdminPage {...page.props} />;
      break;
    case "admin-history":
      content = <AdminHistoryPage {...page.props} />;
      break;
    case "auth":
      content = <AuthPage {...page.props} />;
      break;
    case "lot-detail":
      content = <LotDetailPage {...page.props} />;
      break;
    case "main":
      content = <MainPage {...page.props} />;
      break;
    default: {
      const exhaustivePage: never = page;
      throw new Error(`Unsupported page: ${JSON.stringify(exhaustivePage)}`);
    }
  }

  return <DateRenderProvider value={page.dateRender}>{content}</DateRenderProvider>;
}
