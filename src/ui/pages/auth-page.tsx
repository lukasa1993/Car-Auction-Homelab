import * as React from "react";

import { Button } from "../components/button";
import { Input } from "../components/input";
import { Label } from "../components/label";

export interface AuthPageProps {
  error?: string | null;
}

export function AuthPage({
  error,
}: AuthPageProps) {
  return (
    <main className="min-h-screen bg-background px-3 py-3 text-foreground sm:px-5 sm:py-5">
      <div className="mx-auto max-w-[520px]">
        <p className="mb-4 text-sm text-muted-foreground">Admin</p>
        <div className="rounded-md border border-border bg-card p-5">
          {error ? (
            <div className="mb-4 rounded-md border border-red-300/50 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
              {error}
            </div>
          ) : null}

          <form action="/admin/login" className="space-y-4" method="post">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input autoComplete="email" id="email" name="email" required type="email" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input autoComplete="current-password" id="password" minLength={8} name="password" required type="password" />
            </div>

            <Button type="submit">Sign in</Button>
          </form>
        </div>
      </div>
    </main>
  );
}
