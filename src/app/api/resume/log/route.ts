import "server-only";

import { NextResponse } from "next/server";
import { getDb } from "@/lib/firestore";
import { requireUser } from "@/lib/session";

/**
 * Record that someone took the resume.
 *
 * 🛑 Gating a resume behind a sign-in is only worth the friction if you learn
 * who was interested. Without this the login is pure cost: it turns away the
 * recruiter skimming on a phone and tells you nothing in exchange.
 *
 * `requireUser()` rather than a trust-the-client check — the uid comes from the
 * verified session cookie, never from the request body, so an entry cannot be
 * forged for someone else.
 */
export async function POST() {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  try {
    // Reuses the auditLog shape rather than a new collection: it already has
    // the actor/resource/at fields and an admin view that reads them.
    await getDb()
      .collection("auditLog")
      .add({
        action: "resume.download",
        resource: "resume",
        actorUid: user.uid,
        actorEmail: user.email ?? null,
        at: new Date().toISOString(),
      });
  } catch (error) {
    // A failed log must not block the download — the point is the resume, and
    // a swallowed write is strictly better than a 500 in front of it.
    console.error("[resume] download log failed", error);
  }

  return NextResponse.json({ data: { logged: true } });
}
