import { createHash } from "node:crypto";

import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { createAuthDatabase } from "../models/auth-database";

const baseUrl = (process.env.AUCTION_BASE_URL || process.env.BETTER_AUTH_URL || "http://localhost:3005").replace(/\/$/, "");
const databasePath = process.env.AUCTION_SQLITE_PATH || `${process.cwd()}/data/auction.sqlite`;
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
  trustedOrigins: [baseUrl],
  advanced: {
    database: {
      generateId: () => crypto.randomUUID(),
    },
  },
});

export async function ensureBetterAuthSchema(): Promise<void> {
  const { runMigrations } = await getMigrations(auth.options);
  await runMigrations();
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
  const headers = new Headers();
  const cookie = request.headers.get("cookie");
  if (cookie) {
    headers.set("cookie", cookie);
  }
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
