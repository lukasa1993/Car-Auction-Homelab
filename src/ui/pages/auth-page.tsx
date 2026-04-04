import * as React from "react";

import { Button } from "../components/button";
import { Input } from "../components/input";
import { Label } from "../components/label";

export function AuthPage({
  mode,
  error,
}: {
  mode: "signin" | "signup";
  error?: string | null;
}) {
  const isSignup = mode === "signup";

  return (
    <main className="min-h-screen bg-background px-3 py-3 text-foreground sm:px-5 sm:py-5">
      <div className="mx-auto max-w-[520px]">
        <p className="mb-4 text-sm text-muted-foreground">Admin</p>
        <div className="rounded-md border border-border bg-card p-5">
          <div className="mb-4 flex gap-2">
            <a
              className={`rounded-full px-4 py-2 text-sm font-medium ${!isSignup ? "border border-border text-foreground" : "text-muted-foreground"}`}
              href="/admin"
            >
              Sign in
            </a>
            <a
              className={`rounded-full px-4 py-2 text-sm font-medium ${isSignup ? "border border-border text-foreground" : "text-muted-foreground"}`}
              href="/admin?mode=signup"
            >
              Create account
            </a>
          </div>

          {error ? (
            <div className="mb-4 rounded-md border border-red-300/50 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
              {error}
            </div>
          ) : null}

          <form action={isSignup ? "/admin/signup" : "/admin/login"} className="space-y-4" method="post">
            {isSignup ? (
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" name="name" required />
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input autoComplete="email" id="email" name="email" required type="email" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input autoComplete={isSignup ? "new-password" : "current-password"} id="password" minLength={8} name="password" required type="password" />
            </div>

            <Button type="submit">{isSignup ? "Create account" : "Sign in"}</Button>
          </form>
        </div>
      </div>
    </main>
  );
}
