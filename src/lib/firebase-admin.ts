import "server-only";

import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";

/**
 * Guarantees the default firebase-admin app exists before `getAuth()` is used.
 *
 * 🛑 Why this is not left to appkit: appkit initialises the default app
 * LAZILY, on first use of its db provider. An auth route that calls
 * `getAuth()` straight after `initProviders()` can therefore run before any
 * app exists and throw "The default Firebase app does not exist", which the
 * route reports as a 500 — making every sign-in fail with an error that
 * blames the token rather than the missing app. Found on the deployed site:
 * a deliberately forged token returned 500 instead of 401, which was the
 * symptom, not the cause.
 *
 * Idempotent and safe to call on every request.
 */

function parsePrivateKey(raw: string): string {
  return raw
    .replace(/^﻿/, "") // UTF-8 BOM, a PowerShell pipe artefact
    .replace(/^["']|["']$/g, "") // surrounding quotes from .env parsing
    .replace(/\\n/g, "\n") // literal \n -> real newline
    .replace(/\r/g, "")
    .trim();
}

export function getAdminApp(): App {
  const existing = getApps()[0];
  if (existing) return existing;

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    const missing = [
      !projectId && "FIREBASE_ADMIN_PROJECT_ID",
      !clientEmail && "FIREBASE_ADMIN_CLIENT_EMAIL",
      !privateKey && "FIREBASE_ADMIN_PRIVATE_KEY",
    ].filter(Boolean);
    // Naming the variables beats the SDK's generic credential error.
    throw new Error(`Firebase Admin is not configured — missing: ${missing.join(", ")}`);
  }

  return initializeApp({
    credential: cert({ projectId, clientEmail, privateKey: parsePrivateKey(privateKey) }),
    storageBucket: process.env.FIREBASE_ADMIN_STORAGE_BUCKET,
  });
}

export function adminAuth(): Auth {
  return getAuth(getAdminApp());
}
