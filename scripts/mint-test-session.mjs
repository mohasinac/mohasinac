/**
 * Mint a `__session` cookie for a throwaway account, so the gated pages can be
 * verified in a browser.
 *
 * 🛑 Why this exists: `/problems/**` and `/learn/**` require a login, so the
 * visualizer and the debugger — the riskiest code in the project — could not be
 * looked at at all without one. Everything about them was verified headlessly
 * and nothing had ever been rendered.
 *
 * 🛑 It creates a REAL user in the project's Auth, and therefore deletes it
 * again. Run with `--cleanup` to remove it if a run is interrupted. It is
 * deliberately NOT the admin bootstrap account (`mohsin0502@gmail.com`):
 * signing in as that would claim the admin custom claim on first sign-in,
 * taking an action that belongs to the owner.
 *
 *   node scripts/mint-test-session.mjs            # print a cookie value
 *   node scripts/mint-test-session.mjs --cleanup  # delete the test user
 */
import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);

const UID = "viz-verify-throwaway";
const EMAIL = "viz-verify@example.invalid";

const app = initializeApp({
  credential: cert({
    projectId: env.FIREBASE_ADMIN_PROJECT_ID,
    clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/^﻿/, "").replace(/\\n/g, "\n"),
  }),
});
const auth = getAuth(app);

if (process.argv.includes("--cleanup")) {
  try {
    await auth.deleteUser(UID);
    console.log(`deleted ${UID}`);
  } catch (err) {
    console.log(`nothing to delete (${err?.code ?? err})`);
  }
  process.exit(0);
}

// Create or reuse. No admin claim — this account must be able to see exactly
// what an ordinary signed-in learner sees, which is the point.
try {
  await auth.getUser(UID);
} catch {
  await auth.createUser({ uid: UID, email: EMAIL, emailVerified: true });
}

const customToken = await auth.createCustomToken(UID);

const apiKey = env.NEXT_PUBLIC_FIREBASE_API_KEY;
if (!apiKey) throw new Error("NEXT_PUBLIC_FIREBASE_API_KEY missing from .env.local");

// Custom token -> ID token, the exchange the client SDK normally performs.
const signIn = await fetch(
  `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: customToken, returnSecureToken: true }),
  },
);
const signInBody = await signIn.json();
if (!signIn.ok) throw new Error(`signInWithCustomToken failed: ${JSON.stringify(signInBody)}`);

// ID token -> session cookie, minted directly rather than by POSTing to
// /api/auth/session: same admin call, one less round trip, and it works
// against a deployment that is mid-rollout.
const sessionCookie = await auth.createSessionCookie(signInBody.idToken, {
  expiresIn: 60 * 60 * 1000,
});

console.log(sessionCookie);
process.exit(0);
