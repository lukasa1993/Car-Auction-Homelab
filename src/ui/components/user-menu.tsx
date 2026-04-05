import * as React from "react";
import { ChevronDown, LogOut } from "lucide-react";

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
}

export function UserMenu({ email, logoutAction = "/admin/logout" }: UserMenuProps) {
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const initials = getInitials(email);

  return (
    <div className="relative" ref={containerRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex h-8 items-center gap-2 rounded-3xl border border-border bg-card px-1.5 pr-2 text-xs font-medium text-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        onClick={() => setOpen((v) => !v)}
        type="button"
      >
        <span className="flex size-5 items-center justify-center rounded-full bg-foreground text-[9px] font-semibold uppercase tracking-wide text-background">
          {initials}
        </span>
        <span className="hidden max-w-[160px] truncate sm:inline">{email}</span>
        <ChevronDown
          className={`size-3.5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open ? (
        <div
          className="absolute right-0 top-[calc(100%+6px)] z-50 w-[240px] overflow-hidden rounded-2xl border border-border bg-popover shadow-[0_24px_80px_-32px_rgba(15,23,42,0.35)]"
          role="menu"
        >
          <div className="border-b border-border/70 px-3 py-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Signed in
            </div>
            <div className="mt-1 truncate text-sm font-medium text-foreground" title={email}>
              {email}
            </div>
          </div>
          <form action={logoutAction} method="post">
            <button
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-foreground transition hover:bg-muted"
              role="menuitem"
              type="submit"
            >
              <LogOut className="size-4 text-muted-foreground" />
              Sign out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
