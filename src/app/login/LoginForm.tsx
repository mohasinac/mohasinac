"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  type UserCredential,
} from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase-client";

type Mode = "signin" | "signup";

/**
 * Sign-in / sign-up form.
 *
 * The browser authenticates with Firebase, then immediately trades the ID
 * token for an httpOnly session cookie via POST /api/auth/session. The ID
 * token is never stored — only the cookie, which script cannot read.
 */
export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Exchange the Firebase credential for a server session, then navigate. */
  async function establishSession(credential: UserCredential): Promise<void> {
    const idToken = await credential.user.getIdToken();

    const res = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error ?? `Session exchange failed (${res.status})`);
    }

    /*
     * refresh() before push(): the destination is a server component that reads
     * the session cookie. Without invalidating the router cache first, Next can
     * serve the previously-rendered signed-out version and the user appears to
     * still be logged out.
     */
    router.refresh();
    router.push(next);
  }

  function describe(err: unknown): string {
    const code = (err as { code?: string })?.code ?? "";
    switch (code) {
      case "auth/invalid-credential":
      case "auth/wrong-password":
      case "auth/user-not-found":
        // Deliberately identical for all three: distinguishing them tells an
        // attacker which addresses are registered.
        return "Email or password is incorrect.";
      case "auth/email-already-in-use":
        return "That email already has an account — sign in instead.";
      case "auth/weak-password":
        return "Password must be at least 6 characters.";
      case "auth/popup-closed-by-user":
      case "auth/cancelled-popup-request":
        return "Google sign-in was cancelled.";
      case "auth/popup-blocked":
        return "Your browser blocked the sign-in popup. Allow popups and retry.";
      case "auth/too-many-requests":
        return "Too many attempts. Wait a few minutes and try again.";
      case "auth/operation-not-allowed":
        return "This sign-in method is not enabled for the project.";
      case "auth/network-request-failed":
        return "Network error reaching Firebase. Check your connection.";
      default:
        return (err as Error)?.message ?? "Sign-in failed.";
    }
  }

  async function onEmailSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const auth = getFirebaseAuth();
      const credential =
        mode === "signup"
          ? await createUserWithEmailAndPassword(auth, email, password)
          : await signInWithEmailAndPassword(auth, email, password);
      await establishSession(credential);
    } catch (err) {
      setError(describe(err));
      setBusy(false);
    }
  }

  async function onGoogle(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      await establishSession(await signInWithPopup(getFirebaseAuth(), provider));
    } catch (err) {
      setError(describe(err));
      setBusy(false);
    }
  }

  return (
    <div className="w-full max-w-sm">
      <button
        type="button"
        onClick={onGoogle}
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-md border border-border bg-surface px-4 py-2.5 text-sm font-medium transition-colors hover:bg-surface-raised disabled:opacity-50"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z" />
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.65l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
          <path fill="#FBBC05" d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84Z" />
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1a11 11 0 0 0-9.82 6.05l3.66 2.84c.87-2.6 3.3-4.51 6.16-4.51Z" />
        </svg>
        Continue with Google
      </button>

      <div className="my-5 flex items-center gap-3 text-xs text-text-faint">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={onEmailSubmit} className="space-y-3">
        <div>
          <label htmlFor="email" className="mb-1 block text-xs uppercase tracking-wider text-text-faint">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </div>

        <div>
          <label htmlFor="password" className="mb-1 block text-xs uppercase tracking-wider text-text-faint">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={6}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </div>

        {error ? (
          <p role="alert" className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-error">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-on-accent transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Working…" : mode === "signup" ? "Create account" : "Sign in"}
        </button>
      </form>

      <p className="mt-4 text-center text-xs text-text-muted">
        {mode === "signup" ? "Already have an account?" : "No account yet?"}{" "}
        <button
          type="button"
          onClick={() => {
            setMode(mode === "signup" ? "signin" : "signup");
            setError(null);
          }}
          className="text-accent underline-offset-2 hover:underline"
        >
          {mode === "signup" ? "Sign in" : "Create one"}
        </button>
      </p>
    </div>
  );
}
