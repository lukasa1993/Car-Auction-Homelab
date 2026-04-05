import * as React from "react";
import { ArrowLeft } from "lucide-react";

import { Button } from "./button";
import { UserMenu } from "./user-menu";

export interface AdminHeaderProps {
  email: string;
  eyebrow: string;
  title: string;
  backHref?: string;
  backLabel?: string;
  actions?: React.ReactNode;
}

export function AdminHeader({
  email,
  eyebrow,
  title,
  backHref,
  backLabel = "Back",
  actions,
}: AdminHeaderProps) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        {backHref ? (
          <a href={backHref}>
            <Button size="sm" variant="outline">
              <ArrowLeft className="size-3.5" />
              {backLabel}
            </Button>
          </a>
        ) : null}
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {eyebrow}
          </div>
          <h1 className="mt-0.5 text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {actions}
        <UserMenu email={email} />
      </div>
    </header>
  );
}
