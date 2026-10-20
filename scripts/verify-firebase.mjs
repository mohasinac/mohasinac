/**
 * Verify the generated .env.local actually works against the live Firebase
 * project — credentials, Firestore read/write, Auth, and Storage.
 *
 * Exercises the real services rather than just asserting the variables are
 * non-empty: a wrong bucket name or an unprovisioned Firestore both produce a
 * perfectly well-formed env file that fails at runtime.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { getStorage } from "firebase-admin/storage";

const ROOT = process.argv[2];

// Minimal .env parser — enough for KEY="value" lines.
const env = {};
for (const line of readFileSync(join(ROOT, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)="?([\s\S]*?)"?$/);
  if (m && !line.trim().startsWith("#")) env[m[1]] = m[2];
}

const parsePrivateKey = (raw) =>
  raw.replace(/^﻿/, "").replace(/^["']|["']$/g, "").replace(/\\n/g, "\n").replace(/\\r/g, "").trim();

const results = [];
const check = async (name, fn) => {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail });
    console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  } catch (e) {
    results.push({ name, ok: false, detail: e.message });
    console.log(`  FAIL  ${name} — ${e.message.split("\n")[0].slice(0, 160)}`);
  }
};

console.log(`\nVerifying Firebase for project "${env.FIREBASE_ADMIN_PROJECT_ID}"\n`);

const app = initializeApp({
  credential: cert({
    projectId: env.FIREBASE_ADMIN_PROJECT_ID,
    clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: parsePrivateKey(env.FIREBASE_ADMIN_PRIVATE_KEY),
  }),
  storageBucket: env.FIREBASE_ADMIN_STORAGE_BUCKET,
});

await check("credentials accepted (token mint)", async () => {
  const token = await app.options.credential.getAccessToken();
  return `token expires in ${token.expires_in}s`;
});

const db = getFirestore(app);
const docRef = db.collection("_preflight").doc("env-check");

await check("Firestore write", async () => {
  await docRef.set({ at: new Date().toISOString(), by: "env verification" });
  return "wrote _preflight/env-check";
});

await check("Firestore read", async () => {
  const snap = await docRef.get();
  if (!snap.exists) throw new Error("document missing after write");
  return `read back at=${snap.data().at}`;
});

await check("Firestore delete (cleanup)", async () => {
  await docRef.delete();
  return "removed _preflight/env-check";
});

await check("Auth admin access", async () => {
  const list = await getAuth(app).listUsers(5);
  return `${list.users.length} existing user(s)`;
});

await check("Storage bucket exists", async () => {
  const bucket = getStorage(app).bucket();
  const [exists] = await bucket.exists();
  if (!exists) throw new Error(`bucket ${bucket.name} does not exist — check FIREBASE_ADMIN_STORAGE_BUCKET`);
  return bucket.name;
});

await check("admin bootstrap account resolves", async () => {
  const email = env.ADMIN_BOOTSTRAP_EMAIL;
  if (!email) throw new Error("ADMIN_BOOTSTRAP_EMAIL is empty");
  try {
    const u = await getAuth(app).getUserByEmail(email);
    return `${email} already exists (uid ${u.uid.slice(0, 8)}…)`;
  } catch (e) {
    if (e.code === "auth/user-not-found") return `${email} not registered yet — will be granted admin on first sign-in`;
    throw e;
  }
});

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
