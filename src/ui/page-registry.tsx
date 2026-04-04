import * as React from "react";

import { AdminHistoryPage, type AdminHistoryPageProps } from "./pages/admin-history-page";
import { AdminPage, type AdminPageProps } from "./pages/admin-page";
import { AuthPage, type AuthPageProps } from "./pages/auth-page";
import { LotDetailPage, type LotDetailPageProps } from "./pages/lot-detail-page";
import { MainPage, type MainPageProps } from "./pages/main-page";

export type AppPage =
  | { kind: "admin"; props: AdminPageProps }
  | { kind: "admin-history"; props: AdminHistoryPageProps }
  | { kind: "auth"; props: AuthPageProps }
  | { kind: "lot-detail"; props: LotDetailPageProps }
  | { kind: "main"; props: MainPageProps };

export function renderAppPage(page: AppPage): React.ReactElement {
  switch (page.kind) {
    case "admin":
      return <AdminPage {...page.props} />;
    case "admin-history":
      return <AdminHistoryPage {...page.props} />;
    case "auth":
      return <AuthPage {...page.props} />;
    case "lot-detail":
      return <LotDetailPage {...page.props} />;
    case "main":
      return <MainPage {...page.props} />;
  }

  const exhaustivePage: never = page;
  throw new Error(`Unsupported page: ${JSON.stringify(exhaustivePage)}`);
}
