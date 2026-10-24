import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { getPublishedBySlug, listPublished } from "@/lib/public-content";
import { getDb } from "@/lib/firestore";

export const metadata: Metadata = {
  title: "Problems",
  description: "Blind 75 and beyond, organised by pattern.",
};

/*
 * Which SET you are in is now the route, so the filter here is difficulty.
 * Switching between sets happens at /problems, which is also where progress
 * per set lives.
 */
const DIFFICULTIES = [
  { key: "", label: "All" },
  { key: "easy", label: "Easy" },
  { key: "medium", label: "Medium" },
  { key: "hard", label: "Hard" },
] as const;

export default async function ProblemsPage({
  params,
  searchParams,
}: {
  params: Promise<{ set: string }>;
  searchParams: Promise<{ difficulty?: string }>;
}) {
  const { set } = await params;
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/problems/${set}`)}`);

  const { difficulty } = await searchParams;

  const [setDoc, all] = await Promise.all([
    getPublishedBySlug("problemSets", set),
    listPublished("problems", { limit: 300 }),
  ]);
  if (!setDoc) notFound();

  /*
   * Ordered BY THE SET, not by the problems' own sortOrder. The sequence is the
   * teaching — that is the whole reason a set carries `order[]` rather than
   * being a filter over `problems.sheets[]`.
   */
  const order = Array.isArray(setDoc.order) ? (setDoc.order as string[]) : [];
  const bySlug = new Map((all ?? []).map((p) => [String(p.slug), p]));

  const problems = order
    .map((slug) => bySlug.get(slug))
    // A slug in `order` with no published problem is an authoring mistake, not
    // something to render as a blank row.
    .filter((p): p is NonNullable<typeof p> => p !== undefined)
    .filter((p) => !difficulty || String(p.difficulty) === difficulty);

  // Which of these has this user already solved?
  let solved = new Set<string>();
  try {
    const snap = await getDb()
      .collection("userProgress")
      .where("uid", "==", user.uid)
      .where("solved", "==", true)
      .get();
    solved = new Set(snap.docs.map((d) => String(d.data().problemSlug)));
  } catch (error) {
    // Progress is additive detail; the list is still useful without it.
    console.error("[course] progress read failed", error);
  }

  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <header className="mb-6">
        <nav className="mb-4 text-xs">
          <Link href="/problems" className="text-text-faint hover:text-accent">
            ← Problem sets
          </Link>
        </nav>
        <h1 className="text-2xl font-semibold tracking-tight">
          {String(setDoc.title ?? set)}
        </h1>
        <p className="mt-2 text-sm text-text-muted">
          {/* Counted against THIS set's order, not against every published
              problem — "12 of 300" would be meaningless on a 47-problem set. */}
          {problems.filter((p) => solved.has(String(p.slug))).length} of {order.length} solved
        </p>
      </header>

      <div className="mb-4 flex flex-wrap gap-2 text-xs">
        {DIFFICULTIES.map((d) => (
          <Link
            key={d.key || "all"}
            href={d.key ? `/problems/${set}?difficulty=${d.key}` : `/problems/${set}`}
            className={`rounded-sm border px-2 py-1 transition-colors ${
              (difficulty ?? "") === d.key
                ? "border-accent text-accent"
                : "border-border text-text-muted hover:bg-surface-raised"
            }`}
          >
            {d.label}
          </Link>
        ))}
      </div>

      {problems.length === 0 ? (
        <p className="rounded-md border border-border bg-surface p-4 text-sm text-text-muted">
          No problems published yet. They are loaded through the admin console&rsquo;s bulk import.
        </p>
      ) : (
        <ol className="space-y-px overflow-hidden rounded-md border border-border bg-border">
          {problems.map((p) => {
            const d = String(p.difficulty ?? "");
            const isSolved = solved.has(String(p.slug));
            return (
              <li key={p.id} className="bg-surface">
                <Link
                  href={`/problems/${set}/${p.slug}`}
                  className="flex items-center gap-3 p-3 transition-colors hover:bg-bg"
                >
                  <span
                    aria-label={isSolved ? "solved" : "unsolved"}
                    className={isSolved ? "text-success" : "text-text-faint"}
                  >
                    {isSolved ? "●" : "○"}
                  </span>
                  <span className="flex-1 text-sm">{String(p.title ?? p.slug)}</span>
                  <span
                    className={`text-xs ${
                      d === "easy" ? "text-success" : d === "medium" ? "text-warning" : "text-error"
                    }`}
                  >
                    {d}
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </main>
  );
}
