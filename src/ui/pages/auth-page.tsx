import { Button } from "../components/button";
import { Input } from "../components/input";
import { Label } from "../components/label";

export interface AuthPageProps {
  mode?: "login" | "signup";
  error?: string | null;
  message?: string | null;
}

export function AuthPage({ mode = "login", error, message }: AuthPageProps) {
  const isSignup = mode === "signup";
  const action = isSignup ? "/admin/signup" : "/admin/login";
  const submitLabel = isSignup ? "Sign up" : "Sign in";
  const passwordAutoComplete = isSignup ? "new-password" : "current-password";

  return (
    <main className="min-h-screen bg-background px-3 py-3 text-foreground sm:px-5 sm:py-5">
      <div className="mx-auto max-w-[520px]">
        <p className="mb-4 text-sm text-muted-foreground">Admin</p>
        <div className="rounded-md border border-border bg-card p-5">
          {error ? (
            <div className="mb-4 rounded-md border border-red-300/50 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
              {error}
            </div>
          ) : message ? (
            <div className="mb-4 rounded-md border border-green-300/50 bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-300">
              {message}
            </div>
          ) : null}

          <form action={action} className="space-y-4" method="post">
            {isSignup ? (
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input autoComplete="name" id="name" name="name" required type="text" />
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input autoComplete="email" id="email" name="email" required type="email" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                autoComplete={passwordAutoComplete}
                id="password"
                minLength={8}
                name="password"
                required
                type="password"
              />
            </div>

            <Button type="submit">{submitLabel}</Button>
          </form>
        </div>
      </div>
    </main>
  );
}
