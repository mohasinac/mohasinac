"use client";

/**
 * Firebase client SDK — AUTH ONLY.
 *
 * 🛑 Do not add `firebase/firestore` or `firebase/storage` here. This project
 * inherits appkit's backend-only data rule: `firestore.rules` denies every
 * client read and write, and all data access goes through an API route using
 * the Admin SDK. A client Firestore import would compile, ship, and then fail
 * at runtime with a permission error that looks like a rules bug.
 *
 * Auth is the deliberate exception: sign-in has to happen in the browser to get
 * an ID token, which is then exchanged for an httpOnly session cookie by
 * POST /api/auth/session. The token itself is never persisted client-side.
 */
import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  browserLocalPersistence,
  getAuth,
  setPersistence,
  type Auth,
} from "firebase/auth";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

/**
 * Fail loudly at the call site rather than letting the SDK throw something
 * opaque. A missing NEXT_PUBLIC_* var is a deployment mistake, and
 * `auth/invalid-api-key` does not say which variable is empty.
 */
function assertConfigured(): void {
  const missing = Object.entries(config)
    .filter(([, v]) => !v)
    .map(([k]) => `NEXT_PUBLIC_FIREBASE_${k.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase()}`);
  if (missing.length) {
    throw new Error(
      `Firebase client is not configured — missing: ${missing.join(", ")}. ` +
        `Check .env.local (locally) or the Vercel project environment.`,
    );
  }
}

export function getFirebaseApp(): FirebaseApp {
  assertConfigured();
  return getApps()[0] ?? initializeApp(config);
}

let authInstance: Auth | null = null;

export function getFirebaseAuth(): Auth {
  if (authInstance) return authInstance;
  authInstance = getAuth(getFirebaseApp());
  /*
   * Local persistence keeps the user signed in across reloads. The httpOnly
   * session cookie is the server's source of truth and expires on its own
   * schedule, so this only governs whether the browser can silently re-mint an
   * ID token to refresh that cookie.
   */
  void setPersistence(authInstance, browserLocalPersistence);
  return authInstance;
}
