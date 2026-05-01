import "@tanstack/react-start/server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin as adminPlugin } from "better-auth/plugins";
import { db } from "@/lib/db";
import { getSecrets } from "@/utils/env";

const ADMIN_ROLE = "admin";
const DEFAULT_ROLE = "user";

function getBaseUrl(): string {
  return getSecrets().BETTER_AUTH_URL.replace(/\/$/, "");
}

function getAuthSecret(): string {
  const secrets = getSecrets();
  if (secrets.BETTER_AUTH_SECRET) {
    return secrets.BETTER_AUTH_SECRET;
  }
  const baseUrl = secrets.BETTER_AUTH_URL.replace(/\/$/, "");
  if (baseUrl.startsWith("http://localhost") || baseUrl.startsWith("http://127.0.0.1")) {
    return "dev-insecure-auction-auth-secret";
  }
  throw new Error("BETTER_AUTH_SECRET is required for auction auth");
}

function getTrustedOrigins(): string[] {
  const baseUrl = getBaseUrl();
  const origin = new URL(baseUrl).origin;
  return [
    origin,
    "http://localhost:3005",
    "http://127.0.0.1:3005",
    "http://localhost",
    "http://127.0.0.1",
  ];
}

function getAdminEmailAllowlist(): Set<string> {
  return new Set(
    getSecrets()
      .AUCTION_ADMIN_EMAILS.split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
}

export const auth = betterAuth({
  baseURL: getBaseUrl(),
  secret: getAuthSecret(),
  database: drizzleAdapter(db, { provider: "sqlite" }),
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
  },
  trustedOrigins: getTrustedOrigins(),
  plugins: [adminPlugin({ defaultRole: DEFAULT_ROLE, adminRoles: [ADMIN_ROLE] })],
  databaseHooks: {
    user: {
      create: {
        before: async (data) => {
          const email = typeof data.email === "string" ? data.email : "";
          if (isAdminEmail(email)) {
            return { data: { ...data, role: ADMIN_ROLE } };
          }
          return { data };
        },
      },
    },
  },
  advanced: {
    database: {
      generateId: () => crypto.randomUUID(),
    },
  },
});

export async function ensureBetterAuthSchema(): Promise<void> {
  await ensureBootstrapAdminUser();
}

export async function ensureBootstrapAdminUser(): Promise<void> {
  const secrets = getSecrets();
  const bootstrapAdminEmail = [...getAdminEmailAllowlist()][0] ?? null;
  const bootstrapAdminPassword = secrets.AUCTION_ADMIN_PASSWORD || null;
  if (!bootstrapAdminEmail || !bootstrapAdminPassword) {
    return;
  }

  const response = await auth.handler(
    new Request(`${getBaseUrl()}/api/auth/sign-up/email`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: new URL(getBaseUrl()).origin,
      },
      body: JSON.stringify({
        name: bootstrapAdminEmail.split("@")[0],
        email: bootstrapAdminEmail,
        password: bootstrapAdminPassword,
      }),
    }),
  );

  if (response.ok || response.status === 422) {
    return;
  }

  const body = await response.text().catch(() => "");
  throw new Error(
    `Failed to bootstrap admin user ${bootstrapAdminEmail}: ${response.status} ${body}`,
  );
}

export async function getAuthState(request: Request): Promise<{
  signedIn: boolean;
  admin: boolean;
  email: string | null;
  session: {
    session: Record<string, unknown>;
    user: { email: string; role?: string | null };
  } | null;
}> {
  const session = (await auth.api.getSession({ headers: request.headers }).catch(() => null)) as {
    session: Record<string, unknown>;
    user: { email: string; role?: string | null };
  } | null;
  const email = session?.user?.email ?? null;
  const hasAdminRole = session?.user?.role === ADMIN_ROLE;
  return {
    signedIn: Boolean(session?.session),
    // Admin if the role is set, OR (legacy fallback) the email is in the allowlist
    // for users who existed before the admin plugin was introduced.
    admin: hasAdminRole || isAdminEmail(email),
    email,
    session,
  };
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) {
    return false;
  }
  const adminEmailAllowlist = getAdminEmailAllowlist();
  if (adminEmailAllowlist.size === 0) {
    return true;
  }
  return adminEmailAllowlist.has(email.toLowerCase());
}

export async function dispatchAuthRequest(
  pathname: string,
  request: Request,
  body?: unknown,
): Promise<Response> {
  const headers = new Headers(request.headers);
  if (body !== undefined) {
    headers.set("content-type", "application/json");
  }
  return await auth.handler(
    new Request(`${getBaseUrl()}${pathname}`, {
      method: body === undefined ? request.method : "POST",
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}

export function forwardSetCookieHeaders(source: Response, destination: Headers): void {
  const headers = source.headers as Headers & { getSetCookie?: () => string[] };
  const setCookies = headers.getSetCookie?.() ?? [];
  if (setCookies.length > 0) {
    for (const value of setCookies) {
      destination.append("set-cookie", value);
    }
    return;
  }
  const single = source.headers.get("set-cookie");
  if (single) {
    destination.append("set-cookie", single);
  }
}

export async function authRedirectFromResponse(
  response: Response,
  successPath: string,
  failurePath: string,
): Promise<Response> {
  const headers = new Headers({ location: successPath });
  forwardSetCookieHeaders(response, headers);
  if (!response.ok) {
    let message = "Login failed";
    try {
      const body = (await response.clone().json()) as { message?: string; error?: string };
      message = body.message || body.error || message;
    } catch {
      const body = await response.text().catch(() => "");
      if (body.trim()) {
        message = body.trim();
      }
    }
    headers.set("location", `${failurePath}?error=${encodeURIComponent(message)}`);
  }
  return new Response(null, { status: 303, headers });
}

export function requireBearer(request: Request, expectedToken: string): boolean {
  const authorization = request.headers.get("authorization") ?? "";
  return (
    Boolean(expectedToken) &&
    authorization.startsWith("Bearer ") &&
    authorization.slice("Bearer ".length).trim() === expectedToken
  );
}
