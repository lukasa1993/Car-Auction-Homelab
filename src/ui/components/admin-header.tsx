import * as React from "react";

import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";

type AdminSection = "targets" | "history";

const NAV_ITEMS: Array<{ key: AdminSection; label: string; href: string }> = [
  { key: "targets", label: "Targets", href: "/admin" },
  { key: "history", label: "History", href: "/admin/history" },
];

export interface AdminHeaderProps {
  email: string;
  active: AdminSection;
  historyCount?: number;
}

export function AdminHeader({ email, active, historyCount }: AdminHeaderProps) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
      <div className="flex items-center gap-4">
        <a className="flex items-baseline gap-2" href="/">
          <span className="text-base font-semibold tracking-tight text-foreground">Auction Monitor</span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Admin
          </span>
        </a>
        <nav className="flex items-center gap-0.5 rounded-3xl bg-muted p-0.5">
          {NAV_ITEMS.map((item) => {
            const isActive = item.key === active;
            const count = item.key === "history" ? historyCount : undefined;
            return (
              <a
                className={`inline-flex items-center gap-1.5 rounded-3xl px-3 py-1.5 text-xs font-medium transition-colors ${
                  isActive
                    ? "bg-background text-foreground shadow-sm ring-1 ring-foreground/5"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                href={item.href}
                key={item.key}
              >
                {item.label}
                {typeof count === "number" && count > 0 ? (
                  <span className="tabular-nums text-muted-foreground/70">{count}</span>
                ) : null}
              </a>
            );
          })}
        </nav>
      </div>
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <UserMenu email={email} />
      </div>
    </header>
  );
}
