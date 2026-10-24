import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { listPublished } from "@/lib/public-content";
import { getDb } from "@/lib/firestore";

export const metadata: Metadata = {
  title: "Problem sets",
  description: "The 75, the 100, then A-Z.",
  // Gated, so there is nothing here for a crawler.
  robots: { index: false, follow: false },
};

/**
 * The problem axis, deliberately separate from the courses.
 *
 * A set is a curriculum rather than a tag: `order[]` carries the sequence it
 * should be worked through, which is why sets are their own collection and not
 * a filter over `problems.sheets[]`.
 */
export default async function ProblemSetsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=%2Fproblems");

  const sets = (await listPublished("problemSets")) ?? [];

  // One read for the whole solved set, then counted per list in memory — a
  // per-set query would be N round trips for the same data.
  let solved = new Set<string>();
  try {
    const snap = await getDb()
      .collection("userProgress")
      .where("uid", "==", user.uid)
      .where("solved", "==", true)
      .get();
    solved = new Set(snap.docs.map((d) => String(d.data().problemSlug)));
  } catch (error) {
    // Progress is additive detail; the sets are still worth showing without it.
    console.error("[problems] progress read failed", error);
  }

  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <header className="mb-8">
        <p className="text-xs uppercase tracking-[0.2em] text-text-faint">practice</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Problem sets</h1>
        <p className="prose-editorial mt-3 max-w-prose text-text-muted">
          Work these after the courses, or alongside them. Each set is ordered — the sequence is part of
          the teaching, moving from a single hash-map lookup to two-dimensional dynamic programming.
        </p>
      </header>

      {sets.length === 0 ? (
        <p className="rounded-md border border-border bg-surface p-4 text-sm text-text-muted">
          No problem sets published yet.
        </p>
      ) : (
        <ul className="grid gap-px overflow-hidden rounded-md border border-border bg-border">
          {sets.map((s) => {
            const order = Array.isArray(s.order) ? (s.order as string[]) : [];
            const done = order.filter((slug) => solved.has(slug)).length;
            const pct = order.length === 0 ? 0 : Math.round((done / order.length) * 100);
            return (
              <li key={s.id} className="bg-surface">
                <Link href={`/problems/${s.slug}`} className="block p-4 transition-colors hover:bg-bg">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="font-medium text-accent">{String(s.title ?? s.slug)}</span>
                    <span className="font-mono text-xs text-text-faint">
                      {done} / {order.length}
                    </span>
                  </span>
                  {s.summary ? (
                    <span className="mt-1 block text-sm text-text-muted">{String(s.summary)}</span>
                  ) : null}
                  {/* The bar is decorative; the count above it carries the number. */}
                  <span aria-hidden className="mt-3 block h-1 rounded-sm bg-surface-raised">
                    <span
                      className="block h-1 rounded-sm bg-accent"
                      style={{ width: `${pct}%` }}
                    />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
