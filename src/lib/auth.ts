import { createHash } from "node:crypto";

import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { createAuthDatabase } from "../models/auth-database";

const baseUrl = (process.env.AUCTION_BASE_URL || process.env.BETTER_AUTH_URL || "http://localhost:3005").replace(/\/$/, "");
const databasePath = process.env.AUCTION_SQLITE_PATH || `${process.cwd()}/data/auction.sqlite`;
const baseOrigin = new URL(baseUrl).origin;
const extraTrustedOrigins = String(process.env.AUCTION_TRUSTED_ORIGINS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const localDevOrigins = [
  "http://localhost:3005",
  "http://127.0.0.1:3005",
  "http://localhost",
  "http://127.0.0.1",
];
const trustedOrigins = [...new Set([baseOrigin, ...localDevOrigins, ...extraTrustedOrigins])];
const useSecureCookies = String(process.env.AUCTION_USE_SECURE_COOKIES || "false").toLowerCase() === "true";
const secret =
  process.env.BETTER_AUTH_SECRET ||
  process.env.AUCTION_AUTH_SECRET ||
  createHash("sha256").update(`auction-better-auth:${process.env.AUCTION_ADMIN_PASSWORD || "change-me"}`).digest("hex");
const adminEmailAllowlist = new Set(
  String(process.env.AUCTION_ADMIN_EMAILS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean),
);
const bootstrapAdminEmail = [...adminEmailAllowlist][0] ?? null;
const bootstrapAdminPassword = process.env.AUCTION_ADMIN_PASSWORD || null;

const authDatabase = createAuthDatabase(databasePath);

export const auth = betterAuth({
  baseURL: baseUrl,
  secret,
  database: authDatabase,
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
  },
  trustedOrigins,
  advanced: {
    useSecureCookies,
    database: {
      generateId: () => crypto.randomUUID(),
    },
  },
});

export async function ensureBetterAuthSchema(): Promise<void> {
  const { runMigrations } = await getMigrations(auth.options);
  await runMigrations();
  await ensureBootstrapAdminUser();
}

export async function getAuthState(request: Request): Promise<{
  signedIn: boolean;
  admin: boolean;
  email: string | null;
  session: { session: Record<string, unknown>; user: { email: string } } | null;
}> {
  const response = await auth.handler(
    new Request(`${baseUrl}/api/auth/get-session`, {
      method: "GET",
      headers: request.headers,
    }),
  );
  const session = response.ok
    ? (await response.json() as { session: Record<string, unknown>; user: { email: string } } | null)
    : null;
  const email = session?.user?.email ?? null;
  return {
    signedIn: Boolean(session?.session),
    admin: isAdminEmail(email),
    email,
    session,
  };
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) {
    return false;
  }
  if (adminEmailAllowlist.size === 0) {
    return true;
  }
  return adminEmailAllowlist.has(email.toLowerCase());
}

export async function dispatchAuthRequest(pathname: string, request: Request, body?: unknown): Promise<Response> {
  const headers = new Headers(request.headers);
  if (body !== undefined) {
    headers.set("content-type", "application/json");
  }
  return await auth.handler(
    new Request(`${baseUrl}${pathname}`, {
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

export function requireBearer(request: Request, expectedToken: string): boolean {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) {
    return false;
  }
  return authorization.slice("Bearer ".length).trim() === expectedToken;
}

async function ensureBootstrapAdminUser(): Promise<void> {
  if (!bootstrapAdminEmail || !bootstrapAdminPassword) {
    return;
  }

  const response = await auth.handler(
    new Request(`${baseUrl}/api/auth/sign-up/email`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: baseOrigin,
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

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Failed to bootstrap admin user ${bootstrapAdminEmail}: ${response.status} ${body}`);
  }
}
