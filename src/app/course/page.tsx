import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { SignOutButton } from "@/components/SignOutButton";

export const metadata: Metadata = {
  title: "C++ course",
  description:
    "C++ from first principles: how to approach a problem, data structures built as classes, and the patterns behind the most-asked interview questions.",
};

/**
 * Course home. Gated — see §Protections.
 *
 * 🛑 The server-side check below is the ACTUAL access control. middleware.ts
 * only tests that a cookie is present, because the edge runtime cannot verify a
 * Firebase session cookie. Remove this and a cookie named `__session`
 * containing arbitrary bytes would get in.
 */
export default async function CoursePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=%2Fcourse");

  return (
    <main className="mx-auto max-w-3xl px-5 py-16">
      <header className="mb-10 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-text-faint">Competitive programming</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">C++ course</h1>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-text-muted">
            {user.email}
            {user.role === "admin" ? (
              <span className="ml-2 rounded-sm bg-surface-raised px-1.5 py-0.5 text-accent">admin</span>
            ) : null}
          </span>
          <SignOutButton />
        </div>
      </header>

      <p className="prose-editorial max-w-prose text-text-muted">
        You are signed in, so progress and submissions can be saved. The lessons, the in-browser C++
        sandbox and the problem set are being built — the compiler toolchain is already proven and
        deployed.
      </p>

      <ul className="mt-8 grid gap-px overflow-hidden rounded-md border border-border bg-border">
        {[
          ["Track A — Foundations", "How to approach a problem, complexity, C++ for CP, OOP done properly"],
          ["Track B — Data structures", "Each one built from scratch as a class, against an interface"],
          ["Track C — Patterns & problems", "Blind 75, expanding toward NeetCode 150/250"],
        ].map(([title, note]) => (
          <li key={title} className="bg-surface p-4">
            <span className="block font-medium">{title}</span>
            <span className="mt-1 block text-sm text-text-muted">{note}</span>
          </li>
        ))}
      </ul>
    </main>
  );
}
