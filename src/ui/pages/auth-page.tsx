import * as React from "react";
import { ArrowRight, KeyRound, ShieldCheck } from "lucide-react";

import { Button } from "../components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/card";
import { Input } from "../components/input";
import { Label } from "../components/label";
import { cn } from "../lib";

export function AuthPage({
  mode,
  error,
}: {
  mode: "signin" | "signup";
  error?: string | null;
}) {
  const isSignup = mode === "signup";
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(188,169,128,0.14),transparent_36%),linear-gradient(180deg,rgba(253,250,244,0.96),rgba(246,240,230,0.94))]">
      <div className="mx-auto grid min-h-screen max-w-[1180px] items-center gap-8 px-4 py-6 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8">
        <div className="space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background/70 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
            <ShieldCheck className="size-3.5" />
            Better Auth session flow
          </div>
          <div className="space-y-4">
            <h1 className="max-w-3xl font-display text-4xl tracking-[-0.05em] sm:text-5xl lg:text-6xl">
              Controlled access for moderation, target management, and lot state.
            </h1>
            <p className="max-w-2xl text-base leading-7 text-muted-foreground">
              Auth is now session-backed instead of a handwritten cookie. Public users can still view
              the table. Signed-in users can be promoted to admin through the configured admin email list.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-[28px] border border-border/70 bg-card/80 p-5">
              <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Public</div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Table-first live view, lot detail pages, and image browsing remain readable without sign-in.
              </p>
            </div>
            <div className="rounded-[28px] border border-border/70 bg-card/80 p-5">
              <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Admin</div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Approval, removal, restore, and VIN-target control are reserved for authenticated admins.
              </p>
            </div>
          </div>
        </div>

        <Card className="bg-card/92">
          <CardHeader className="gap-4">
            <div className="flex items-center gap-2">
              <a
                className={cn(
                  "inline-flex rounded-full px-4 py-2 text-sm font-medium transition-colors",
                  !isSignup ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
                )}
                href="/login"
              >
                Sign in
              </a>
              <a
                className={cn(
                  "inline-flex rounded-full px-4 py-2 text-sm font-medium transition-colors",
                  isSignup ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
                )}
                href="/login?mode=signup"
              >
                Create account
              </a>
            </div>
            <div>
              <CardTitle className="font-display text-3xl tracking-[-0.04em]">
                {isSignup ? "Create your account" : "Sign in"}
              </CardTitle>
              <CardDescription className="mt-2">
                {isSignup
                  ? "Use an email and password. Admin access is still controlled separately."
                  : "Use your Better Auth credentials to enter the protected control surfaces."}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {error ? (
              <div className="rounded-2xl border border-red-300/50 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
                {error}
              </div>
            ) : null}

            <form action={isSignup ? "/signup" : "/login"} className="space-y-4" method="post">
              {isSignup ? (
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" name="name" placeholder="Auction operator" required />
                </div>
              ) : null}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input autoComplete="email" id="email" name="email" placeholder="you@example.com" required type="email" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input autoComplete={isSignup ? "new-password" : "current-password"} id="password" minLength={8} name="password" required type="password" />
              </div>
              <Button className="w-full justify-between" size="lg" type="submit">
                <span className="inline-flex items-center gap-2">
                  <KeyRound className="size-4" />
                  {isSignup ? "Create account" : "Sign in"}
                </span>
                <ArrowRight className="size-4" />
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
