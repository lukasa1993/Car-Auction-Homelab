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

  const setPreference = React.useCallback((preference: ThemePreference) => {
    if (typeof window === "undefined") {
      return;
    }
    const themeWindow = window as ThemeWindow;
    themeWindow.__setAuctionTheme?.(preference);
    setTheme(readThemeState());
  }, []);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4 sm:justify-end sm:px-6">
      <div className="pointer-events-auto inline-flex items-center gap-1 rounded-full border border-border/80 bg-card/90 p-1 text-foreground shadow-[0_12px_34px_rgba(15,23,42,0.18)] backdrop-blur-xl supports-[backdrop-filter]:bg-card/80">
        <span className="hidden pl-2 pr-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground sm:inline">
          Theme
        </span>
        {OPTIONS.map(({ value, label, Icon }) => {
          const active = theme.preference === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => setPreference(value)}
              aria-label={`Use ${label.toLowerCase()} theme`}
              aria-pressed={active}
              title={label}
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-all hover:bg-muted/80 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                active && "bg-background text-foreground shadow-sm",
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="sr-only">{label}</span>
            </button>
          );
        })}
        <span className="hidden pr-2 text-[10px] text-muted-foreground md:inline">
          {theme.resolvedTheme === "dark" ? "Dark live" : "Light live"}
        </span>
      </div>
    </div>
  );
}
