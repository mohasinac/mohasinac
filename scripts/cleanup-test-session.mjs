/**
 * Remove the throwaway verification account and everything it wrote.
 *
 * 🛑 Deleting the Auth user is not enough: `submissions` and `userProgress` are
 * keyed by uid in Firestore and would be left orphaned under an identity that
 * no longer exists. A verification run must leave no trace in the owner's data.
 */
import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

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

const app = initializeApp({
  credential: cert({
    projectId: env.FIREBASE_ADMIN_PROJECT_ID,
    clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
    // 🛑 `\\n` -> a real newline. A heredoc swallowed one backslash when this
    // file was first written, making the replace a no-op and leaving literal
    // `\n` sequences in the PEM — which surfaces as
    // `error:1E08010C:DECODER routines::unsupported`, naming neither the cause
    // nor the file. Exactly the failure the plan warns about.
    privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/^﻿/, "").replace(/\\n/g, "\n"),
  }),
});
const db = getFirestore(app);

for (const collection of ["submissions", "userProgress", "userNotes"]) {
  const snap = await db.collection(collection).where("uid", "==", UID).get();
  for (const doc of snap.docs) await doc.ref.delete();
  console.log(`${collection}: deleted ${snap.size}`);
}

try {
  await getAuth(app).deleteUser(UID);
  console.log(`auth user ${UID}: deleted`);
} catch (err) {
  console.log(`auth user: ${err?.code ?? err}`);
}
process.exit(0);
