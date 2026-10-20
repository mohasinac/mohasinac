import "server-only";

import { cookies } from "next/headers";
import { getAuth } from "firebase-admin/auth";
import { initProviders } from "@/providers.config";

/**
 * Server-side session helpers.
 *
 * 🛑 This is the real access control. `middleware.ts` only checks that a cookie
 * EXISTS — the edge runtime cannot verify a Firebase session cookie, which
 * needs firebase-admin (Node-only). Every protected route and page must call
 * `requireUser`/`requireAdmin` here; treating the middleware redirect as the
 * control would mean any forged cookie of the right NAME grants entry.
 */

/**
 * Must match appkit's firebase auth provider
 * (providers/auth-firebase/helpers.ts) and `middleware.ts`.
 */
export const SESSION_COOKIE = "__session";

/** 5 days. Firebase caps session cookies at 14 days. */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 5;

export interface SessionUser {
  uid: string;
  email: string | null;
  role: string;
  emailVerified: boolean;
  name: string | null;
  picture: string | null;
}

/**
 * Resolve the signed-in user, or null.
 *
 * `checkRevoked: true` costs a round trip to Firebase but is the difference
 * between "signed out everywhere" meaning something and meaning nothing: a
 * revoked session otherwise stays valid until the cookie's own expiry, up to
 * five days of access after the user asked to be logged out.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const cookie = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!cookie) return null;

  await initProviders();

  try {
    const decoded = await getAuth().verifySessionCookie(cookie, true);
    return {
      uid: decoded.uid,
      email: decoded.email ?? null,
      role: typeof decoded.role === "string" ? decoded.role : "user",
      emailVerified: decoded.email_verified === true,
      name: typeof decoded.name === "string" ? decoded.name : null,
      picture: typeof decoded.picture === "string" ? decoded.picture : null,
    };
  } catch {
    // Expired, revoked or forged — all mean "not signed in". Deliberately not
    // distinguished to the caller: there is no safe action that differs.
    return null;
  }
}

export class UnauthorizedError extends Error {
  readonly status = 401;
  constructor(message = "Sign-in required") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  readonly status = 403;
  constructor(message = "Insufficient permissions") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** Throws UnauthorizedError when there is no valid session. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

/** Throws unless the caller holds the admin role. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "admin") throw new ForbiddenError("Admin role required");
  return user;
}
