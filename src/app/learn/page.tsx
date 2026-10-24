import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { listPublished } from "@/lib/public-content";

export const metadata: Metadata = {
  title: "C++ course",
  description:
    "C++ from first principles: how to approach a problem, data structures built as classes, and the patterns behind the most-asked interview questions.",
};

/**
 * Course home — gated.
 *
 * 🛑 This server-side check is the ACTUAL access control. middleware.ts only
 * tests that a cookie is present, because the edge runtime cannot verify a
 * Firebase session cookie. Remove this and a cookie named `__session`
 * containing arbitrary bytes gets in.
 */
export default async function CoursePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=%2Flearn");

  const [tracks, problems] = await Promise.all([
    listPublished("tracks"),
    listPublished("problems", { limit: 300 }),
  ]);

  const byDifficulty = (problems ?? []).reduce<Record<string, number>>((acc, p) => {
    const d = String(p.difficulty ?? "unknown");
    acc[d] = (acc[d] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <header className="mb-8">
        <p className="text-xs uppercase tracking-[0.2em] text-text-faint">competitive programming</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">C++ course</h1>
        <p className="prose-editorial mt-3 max-w-prose text-text-muted">
          Signed in as {user.email}, so progress and submissions are saved against your account.
          Every problem runs in the same in-browser toolchain as the sandbox — your solutions never
          leave this machine.
        </p>
      </header>

      <section className="mb-8">
        <h2 className="mb-3 font-mono text-xs uppercase tracking-wider text-text-faint">Tracks</h2>
        {tracks?.length ? (
          <ul className="grid gap-px overflow-hidden rounded-md border border-border bg-border">
            {tracks.map((t) => (
              <li key={t.id} className="bg-surface">
                <Link href={`/learn/${t.slug}`} className="block p-4 transition-colors hover:bg-bg">
                  <span className="font-medium text-accent">{String(t.title ?? t.slug)}</span>
                  {t.summary ? (
                    <span className="mt-1 block text-sm text-text-muted">{String(t.summary)}</span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-md border border-border bg-surface p-4 text-sm text-text-muted">
            No tracks published yet. Content is imported through the admin console.
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-mono text-xs uppercase tracking-wider text-text-faint">Problems</h2>
        <div className="flex flex-wrap gap-4 rounded-md border border-border bg-surface p-4 text-sm">
          {(["easy", "medium", "hard"] as const).map((d) => (
            <span key={d} className="flex items-baseline gap-2">
              <span
                className={
                  d === "easy" ? "text-success" : d === "medium" ? "text-warning" : "text-error"
                }
              >
                {d}
              </span>
              <span className="font-mono">{byDifficulty[d] ?? 0}</span>
            </span>
          ))}
          <Link href="/problems" className="ml-auto text-accent hover:underline">
            Browse all →
          </Link>
        </div>
      </section>
    </main>
  );
}
