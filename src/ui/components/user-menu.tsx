import * as React from "react";
import { ChevronDown, LogOut } from "lucide-react";

import { cn } from "../lib";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./dropdown-menu";

function getInitials(email: string): string {
  const name = email.split("@")[0] || email;
  const parts = name.split(/[._-]/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export interface UserMenuProps {
  email: string;
  logoutAction?: string;
  className?: string;
}

export function UserMenu({ email, logoutAction = "/admin/logout", className }: UserMenuProps) {
  const initials = getInitials(email);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex h-9 items-center gap-2 rounded-full border border-border bg-card pl-1 pr-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 data-[state=open]:bg-muted",
          className,
        )}
        aria-label={`Account menu for ${email}`}
      >
        <span className="flex size-7 items-center justify-center rounded-full bg-foreground text-[10px] font-semibold uppercase tracking-wide text-background">
          {initials}
        </span>
        <span className="hidden max-w-40 truncate sm:inline">{email}</span>
        <ChevronDown className="size-3.5 text-muted-foreground transition-transform data-[state=open]:rotate-180" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>Signed in</DropdownMenuLabel>
        <div className="px-3 pb-2 text-sm font-medium text-foreground" title={email}>
          <span className="block truncate">{email}</span>
        </div>
        <DropdownMenuSeparator />
        <form action={logoutAction} method="post" className="px-1.5 pb-1.5">
          <button
            type="submit"
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
          >
            <LogOut className="size-4 text-muted-foreground" />
            Sign out
          </button>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
