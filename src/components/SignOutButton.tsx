"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase-client";

/**
 * Sign out of both halves of the session.
 *
 * DELETE /api/auth/session revokes the refresh tokens and clears the httpOnly
 * cookie; the client-side signOut() clears the browser's Firebase state. Doing
 * only the second would leave a valid server session, and the user would still
 * be signed in on their next page load.
 */
export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onClick(): Promise<void> {
    setBusy(true);
    try {
      await fetch("/api/auth/session", { method: "DELETE" });
      await signOut(getFirebaseAuth()).catch(() => {
        // Server session is already gone, which is what actually gates access.
      });
      router.refresh();
      router.push("/");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="rounded-sm border border-border px-2 py-1 text-text-muted transition-colors hover:bg-surface-raised hover:text-text disabled:opacity-50"
    >
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
