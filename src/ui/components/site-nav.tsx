import * as React from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { ChevronDown, Menu } from "lucide-react";

import { cn } from "../lib";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./dropdown-menu";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "./sheet";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";

export type SiteNavAuth = {
  signedIn: boolean;
  admin: boolean;
  email: string | null;
};

export interface SiteNavProps {
  auth: SiteNavAuth;
}

type PrimaryItem = { label: string; href: string; match: (path: string) => boolean };
type AdminItem = { label: string; href: string; match: (path: string) => boolean };

const PRIMARY_ITEMS: PrimaryItem[] = [
  { label: "Live", href: "/", match: (path) => path === "/" },
  { label: "Sold", href: "/sold", match: (path) => path === "/sold" || path.startsWith("/sold/") },
];

const ADMIN_ITEMS: AdminItem[] = [
  { label: "Targets", href: "/admin", match: (path) => path === "/admin" },
  { label: "History", href: "/admin/history", match: (path) => path.startsWith("/admin/history") },
];

function isAdminPath(path: string) {
  return path === "/admin" || path.startsWith("/admin/");
}

function NavLink({
  href,
  active,
  children,
  className,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      to={href}
      className={cn(
        "inline-flex h-9 items-center rounded-full px-3 text-sm transition-colors",
        active
          ? "bg-muted text-foreground"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
        className,
      )}
    >
      {children}
    </Link>
  );
}

function AdminMenu({ pathname }: { pathname: string }) {
  const adminActive = isAdminPath(pathname);
  const activeChild = ADMIN_ITEMS.find((item) => item.match(pathname));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "inline-flex h-9 items-center gap-1 rounded-full px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 data-[state=open]:bg-muted",
          adminActive
            ? "bg-muted text-foreground"
            : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
        )}
      >
        Admin
        <ChevronDown className="size-3.5 text-muted-foreground transition-transform data-[state=open]:rotate-180" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        <DropdownMenuLabel>Admin</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {ADMIN_ITEMS.map((item) => {
          const isActive = item === activeChild;
          return (
            <DropdownMenuItem key={item.href} asChild>
              <Link
                to={item.href}
                className={cn(
                  "w-full",
                  isActive && "bg-muted text-foreground",
                )}
              >
                <span className="flex-1">{item.label}</span>
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MobileNav({
  pathname,
  auth,
}: {
  pathname: string;
  auth: SiteNavAuth;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        className="inline-flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 data-[state=open]:bg-muted"
        aria-label="Open menu"
      >
        <Menu className="size-4" />
      </SheetTrigger>
      <SheetContent side="right" className="w-72 sm:max-w-sm">
        <SheetHeader>
          <SheetTitle>Auction Monitor</SheetTitle>
        </SheetHeader>
        <nav aria-label="Mobile" className="flex flex-col gap-1 px-3 pb-2">
          {PRIMARY_ITEMS.map((item) => (
            <SheetClose key={item.href} asChild>
              <Link
                to={item.href}
                className={cn(
                  "flex h-11 items-center rounded-2xl px-3 text-sm transition-colors",
                  item.match(pathname)
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            </SheetClose>
          ))}
        </nav>
        {auth.admin ? (
          <div className="border-t border-border/70 px-3 pt-3 pb-2">
            <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Admin
            </p>
            <div className="flex flex-col gap-1">
              {ADMIN_ITEMS.map((item) => (
                <SheetClose key={item.href} asChild>
                  <Link
                    to={item.href}
                    className={cn(
                      "flex h-11 items-center rounded-2xl px-3 text-sm transition-colors",
                      item.match(pathname)
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                    )}
                  >
                    {item.label}
                  </Link>
                </SheetClose>
              ))}
            </div>
          </div>
        ) : null}
        <div className="mt-auto flex flex-col gap-3 border-t border-border/70 px-5 py-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Theme
            </span>
            <ThemeToggle />
          </div>
          {auth.signedIn && auth.email ? (
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-xs text-muted-foreground" title={auth.email}>
                {auth.email}
              </span>
              <form action="/admin/logout" method="post">
                <button
                  type="submit"
                  className="inline-flex h-9 items-center rounded-full border border-border bg-card px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                >
                  Sign out
                </button>
              </form>
            </div>
          ) : (
            <a
              href="/admin/login"
              className="inline-flex h-10 items-center justify-center rounded-full bg-foreground px-4 text-sm font-medium text-background transition-opacity hover:opacity-90"
            >
              Sign in
            </a>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function SiteNav({ auth }: SiteNavProps) {
  const { pathname } = useLocation();

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-[1180px] items-center gap-3 px-3 sm:px-5">
        <Link
          to="/"
          aria-label="Homepage"
          className="flex items-baseline gap-2 rounded-full px-2 py-1 transition-colors hover:bg-muted/60"
        >
          <span className="text-sm font-semibold tracking-tight text-foreground">Auction Monitor</span>
        </Link>

        <nav aria-label="Primary" className="ml-2 hidden items-center gap-0.5 lg:flex">
          {PRIMARY_ITEMS.map((item) => (
            <NavLink key={item.href} active={item.match(pathname)} href={item.href}>
              {item.label}
            </NavLink>
          ))}
          {auth.admin ? <AdminMenu pathname={pathname} /> : null}
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          <div className="hidden lg:inline-flex">
            <ThemeToggle />
          </div>
          {auth.signedIn && auth.email ? (
            <div className="hidden lg:inline-flex">
              <UserMenu email={auth.email} />
            </div>
          ) : (
            <a
              href="/admin/login"
              className="hidden h-9 items-center rounded-full border border-border bg-card px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted lg:inline-flex"
            >
              Sign in
            </a>
          )}
          <div className="lg:hidden">
            <MobileNav auth={auth} pathname={pathname} />
          </div>
        </div>
      </div>
    </header>
  );
}
