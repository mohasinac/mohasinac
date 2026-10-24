import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { listPublished } from "@/lib/public-content";
import { getDb } from "@/lib/firestore";

export const metadata: Metadata = {
  title: "Problems",
  description: "Blind 75 and beyond, organised by pattern.",
};

const SHEETS = [
  { key: "", label: "All" },
  { key: "blind75", label: "Blind 75" },
  { key: "neetcode150", label: "NeetCode 150" },
  { key: "neetcode250", label: "NeetCode 250" },
] as const;

export default async function ProblemsPage({
  searchParams,
}: {
  searchParams: Promise<{ sheet?: string; difficulty?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=%2Fcourse%2Fproblems");

  const { sheet, difficulty } = await searchParams;
  const all = (await listPublished("problems", { limit: 300 })) ?? [];

  const problems = all.filter((p) => {
    const sheets = Array.isArray(p.sheets) ? (p.sheets as string[]) : [];
    if (sheet && !sheets.includes(sheet)) return false;
    if (difficulty && String(p.difficulty) !== difficulty) return false;
    return true;
  });

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
          <Link href="/course" className="text-text-faint hover:text-accent">
            ← Course
          </Link>
        </nav>
        <h1 className="text-2xl font-semibold tracking-tight">Problems</h1>
        <p className="mt-2 text-sm text-text-muted">
          {solved.size} of {all.length} solved
        </p>
      </header>

      <div className="mb-4 flex flex-wrap gap-2 text-xs">
        {SHEETS.map((s) => (
          <Link
            key={s.key || "all"}
            href={s.key ? `/course/problems?sheet=${s.key}` : "/course/problems"}
            className={`rounded-sm border px-2 py-1 transition-colors ${
              (sheet ?? "") === s.key
                ? "border-accent text-accent"
                : "border-border text-text-muted hover:bg-surface-raised"
            }`}
          >
            {s.label}
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
                  href={`/course/problems/${p.slug}`}
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
