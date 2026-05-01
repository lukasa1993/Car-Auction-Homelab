import * as React from "react";
import { Monitor, MoonStar, SunMedium } from "lucide-react";

import {
  DEFAULT_THEME_PREFERENCE,
  normalizeThemePreference,
  type ResolvedTheme,
  type ThemePreference,
} from "../../lib/theme";
import { cn } from "../lib";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./dropdown-menu";

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

const OPTIONS: Array<{ value: ThemePreference; label: string; Icon: typeof SunMedium }> = [
  { value: "light", label: "Light", Icon: SunMedium },
  { value: "dark", label: "Dark", Icon: MoonStar },
  { value: "system", label: "System", Icon: Monitor },
];

function readThemeState(): ThemeState {
  if (typeof window === "undefined") {
    return { preference: DEFAULT_THEME_PREFERENCE, resolvedTheme: "light" };
  }

  const root = document.documentElement;
  const themeWindow = window as ThemeWindow;
  const preference = normalizeThemePreference(
    root.dataset.themePreference || themeWindow.__AUCTION_THEME__?.preference,
  );
  const resolvedTheme =
    themeWindow.__AUCTION_THEME__?.resolvedTheme === "dark" || root.classList.contains("dark")
      ? "dark"
      : "light";

  return { preference, resolvedTheme };
}

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = React.useState<ThemeState>(() => readThemeState());

  React.useEffect(() => {
    const sync = () => setTheme(readThemeState());
    sync();
    window.addEventListener("auction-theme-change", sync as EventListener);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("auction-theme-change", sync as EventListener);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const setPreference = React.useCallback((preference: ThemePreference) => {
    if (typeof window === "undefined") return;
    (window as ThemeWindow).__setAuctionTheme?.(preference);
    setTheme(readThemeState());
  }, []);

  const active = OPTIONS.find((opt) => opt.value === theme.preference) ?? OPTIONS[0];
  const ActiveIcon = active.Icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Theme: ${active.label}`}
        className={cn(
          "inline-flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 data-[state=open]:bg-muted data-[state=open]:text-foreground",
          className,
        )}
      >
        <ActiveIcon className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel>Theme · {theme.resolvedTheme === "dark" ? "Dark" : "Light"}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {OPTIONS.map(({ value, label, Icon }) => (
          <DropdownMenuItem
            key={value}
            onSelect={(event) => {
              event.preventDefault();
              setPreference(value);
            }}
            className={cn(theme.preference === value && "bg-muted text-foreground")}
          >
            <Icon />
            <span className="flex-1">{label}</span>
            {theme.preference === value ? (
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Active
              </span>
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
