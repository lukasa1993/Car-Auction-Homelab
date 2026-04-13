import * as React from "react";
import { Monitor, MoonStar, SunMedium } from "lucide-react";

import {
  DEFAULT_THEME_PREFERENCE,
  normalizeThemePreference,
  type ResolvedTheme,
  type ThemePreference,
} from "../../lib/theme";
import { cn } from "../lib";

type ThemeWindow = Window & {
  __setAuctionTheme?: (preference: ThemePreference) => void;
  __AUCTION_THEME__?: {
    preference?: ThemePreference;
    resolvedTheme?: ResolvedTheme;
  };
};

type ThemeState = {
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
};

const OPTIONS: Array<{
  value: ThemePreference;
  label: string;
  Icon: typeof SunMedium;
}> = [
  { value: "light", label: "Light", Icon: SunMedium },
  { value: "dark", label: "Dark", Icon: MoonStar },
  { value: "system", label: "System", Icon: Monitor },
];

function readThemeState(): ThemeState {
  if (typeof window === "undefined") {
    return {
      preference: DEFAULT_THEME_PREFERENCE,
      resolvedTheme: "light",
    };
  }

  const root = document.documentElement;
  const themeWindow = window as ThemeWindow;
  const preference = normalizeThemePreference(root.dataset.themePreference || themeWindow.__AUCTION_THEME__?.preference);
  const resolvedTheme = themeWindow.__AUCTION_THEME__?.resolvedTheme === "dark" || root.classList.contains("dark")
    ? "dark"
    : "light";

  return {
    preference,
    resolvedTheme,
  };
}

export function ThemeToggle() {
  const [theme, setTheme] = React.useState<ThemeState>(() => readThemeState());
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const syncTheme = () => setTheme(readThemeState());

    syncTheme();
    window.addEventListener("auction-theme-change", syncTheme as EventListener);
    window.addEventListener("storage", syncTheme);
    return () => {
      window.removeEventListener("auction-theme-change", syncTheme as EventListener);
      window.removeEventListener("storage", syncTheme);
    };
  }, []);

  React.useEffect(() => {
    if (!open) {
      return;
    }

    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const setPreference = React.useCallback((preference: ThemePreference) => {
    if (typeof window === "undefined") {
      return;
    }
    const themeWindow = window as ThemeWindow;
    themeWindow.__setAuctionTheme?.(preference);
    setTheme(readThemeState());
    setOpen(false);
  }, []);

  const activeOption = OPTIONS.find((option) => option.value === theme.preference) || OPTIONS[0];
  const ActiveIcon = activeOption.Icon;

  return (
    <div className="relative" ref={containerRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Theme: ${activeOption.label}`}
        className={cn(
          "inline-flex size-8 items-center justify-center rounded-full border border-border bg-card text-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
          open && "bg-muted",
        )}
        onClick={() => setOpen((value) => !value)}
        title={`Theme: ${activeOption.label}`}
        type="button"
      >
        <ActiveIcon className="size-4 text-muted-foreground" />
      </button>
      {open ? (
        <div
          className="absolute left-0 top-[calc(100%+6px)] z-50 w-[180px] overflow-hidden rounded-2xl border border-border bg-popover shadow-[0_24px_80px_-32px_rgba(15,23,42,0.35)] sm:left-auto sm:right-0"
          role="menu"
        >
          <div className="border-b border-border/70 px-3 py-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Theme</div>
            <div className="mt-1 text-sm font-medium text-foreground">
              {theme.resolvedTheme === "dark" ? "Dark live" : "Light live"}
            </div>
          </div>
          <div className="p-1.5">
            {OPTIONS.map(({ value, label, Icon }) => {
              const active = theme.preference === value;
              return (
                <button
                  key={value}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition hover:bg-muted",
                    active && "bg-muted text-foreground",
                  )}
                  onClick={() => setPreference(value)}
                  role="menuitemradio"
                  aria-checked={active}
                  type="button"
                >
                  <Icon className="size-4 text-muted-foreground" />
                  <span className="flex-1">{label}</span>
                  {active ? <span className="text-[11px] font-semibold text-muted-foreground">Active</span> : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
