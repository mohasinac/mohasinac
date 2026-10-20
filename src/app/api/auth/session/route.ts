import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuth } from "firebase-admin/auth";
import { initProviders } from "@/providers.config";
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "@/lib/session";

/**
 * Exchange a Firebase ID token for an httpOnly session cookie.
 *
 * The browser signs in with the Firebase client SDK, which yields a short-lived
 * ID token. That token is NOT the session: it lives in JS-reachable memory and
 * would be readable by any XSS. This route verifies it server-side and issues
 * an httpOnly, SameSite=Lax cookie instead, which script cannot read.
 *
 * POST   create a session from an ID token
 * DELETE revoke it (sign out)
 */

const BodySchema = z.object({
  idToken: z.string().min(1, "idToken is required").max(4096),
});

/** Grants the admin role to ADMIN_BOOTSTRAP_EMAIL on its first sign-in.
 *
 * Writes a custom claim rather than a Firestore flag so the role travels inside
 * the verified token itself — a route can trust it without a database read, and
 * it cannot be forged client-side.
 *
 * 🛑 Only ever grants to the exact configured address, and only when no role
 * claim exists yet. It must not be able to re-grant admin to an account whose
 * role was deliberately removed later in the admin console.
 */
async function maybeBootstrapAdmin(uid: string, email: string | undefined, existingRole: unknown): Promise<string | null> {
  const bootstrap = process.env.ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase();
  if (!bootstrap || !email) return null;
  if (email.trim().toLowerCase() !== bootstrap) return null;
  if (typeof existingRole === "string" && existingRole.length > 0) return null;

  await getAuth().setCustomUserClaims(uid, { role: "admin" });
  console.log(`[auth] bootstrapped admin role for ${email}`);
  return "admin";
}

export async function POST(request: Request): Promise<NextResponse> {
  await initProviders();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Malformed JSON body" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    // checkRevoked: a token minted before a sign-out-everywhere must not be
    // accepted. Without it, a revoked session can be silently re-established.
    const decoded = await getAuth().verifyIdToken(parsed.data.idToken, true);

    const bootstrapped = await maybeBootstrapAdmin(decoded.uid, decoded.email, decoded.role);
    const role = bootstrapped ?? (typeof decoded.role === "string" ? decoded.role : "user");

    const sessionCookie = await getAuth().createSessionCookie(parsed.data.idToken, {
      expiresIn: SESSION_MAX_AGE_SECONDS * 1000,
    });

    const response = NextResponse.json({
      success: true,
      data: { uid: decoded.uid, email: decoded.email ?? null, role, bootstrapped: bootstrapped !== null },
    });

    response.cookies.set({
      name: SESSION_COOKIE,
      value: sessionCookie,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax", // "strict" would drop the cookie on the OAuth redirect back
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    });
    // A session response must never be cached by the CDN or the browser.
    response.headers.set("Cache-Control", "no-store, private");
    return response;
  } catch (error) {
    const code = (error as { code?: string })?.code ?? "";
    // Expired/revoked/malformed tokens are the client's problem (401); anything
    // else is ours (500). Collapsing both to 500 would hide a misconfiguration.
    const isClientFault =
      /auth\/(id-token-expired|id-token-revoked|argument-error|invalid-id-token|user-disabled)/.test(code);
    console.error(`[auth] session creation failed (${code || "unknown"})`, error);
    return NextResponse.json(
      { success: false, error: isClientFault ? "Invalid or expired sign-in token" : "Could not create session" },
      { status: isClientFault ? 401 : 500 },
    );
  }
}

export async function DELETE(request: Request): Promise<NextResponse> {
  await initProviders();

  const cookie = request.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);

  if (cookie) {
    try {
      // Revoke every refresh token, not just this cookie: otherwise the browser
      // can mint a fresh ID token and rebuild the session immediately.
      const decoded = await getAuth().verifySessionCookie(cookie, false);
      await getAuth().revokeRefreshTokens(decoded.sub);
    } catch (error) {
      // An already-invalid cookie still means "signed out" — clear it anyway.
      console.warn("[auth] sign-out on an unverifiable cookie; clearing regardless", error);
    }
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set({
    name: SESSION_COOKIE,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  response.headers.set("Cache-Control", "no-store, private");
  return response;
}
