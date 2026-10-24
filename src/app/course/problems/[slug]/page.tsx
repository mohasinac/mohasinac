import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { getPublishedBySlug } from "@/lib/public-content";
import { getDb } from "@/lib/firestore";
import { ProblemWorkbench, type TestCase } from "@/components/course/ProblemWorkbench";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const p = await getPublishedBySlug("problems", (await params).slug);
  return { title: p ? String(p.title ?? p.slug) : "Problem", robots: { index: false, follow: false } };
}

export default async function ProblemPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/course/problems/${slug}`)}`);

  const problem = await getPublishedBySlug("problems", slug);
  if (!problem) notFound();

  /*
   * 🛑 Test cases are loaded server-side and filtered before they reach the
   * client. Inputs must go to the browser — that is the only way the program
   * can be run — but `expectedOutput` NEVER does for a hidden case. The client
   * posts back a SHA-256 of what it printed and the server compares.
   *
   * Sample cases intentionally include their expected output: they are the
   * worked examples in the statement.
   */
  let cases: TestCase[] = [];
  try {
    const snap = await getDb()
      .collection("problems")
      .doc(String(problem.id))
      .collection("testCases")
      .get();
    cases = snap.docs.map((d) => {
      const data = d.data();
      const visibility = String(data.visibility ?? "hidden") === "sample" ? "sample" : "hidden";
      return {
        id: d.id,
        visibility,
        input: String(data.input ?? ""),
        expectedOutput: visibility === "sample" ? String(data.expectedOutput ?? "") : null,
      };
    });
  } catch (error) {
    console.error("[course] test cases unavailable", error);
  }

  const patterns = Array.isArray(problem.patterns) ? (problem.patterns as string[]) : [];
  const difficulty = String(problem.difficulty ?? "");

  return (
    <main className="mx-auto max-w-5xl px-5 py-10">
      <nav className="mb-5 text-xs">
        <Link href="/course/problems" className="text-text-faint hover:text-accent">
          ← Problems
        </Link>
      </nav>

      <header className="mb-6">
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="text-xl font-semibold tracking-tight">{String(problem.title ?? slug)}</h1>
          <span
            className={
              difficulty === "easy"
                ? "text-xs text-success"
                : difficulty === "medium"
                  ? "text-xs text-warning"
                  : "text-xs text-error"
            }
          >
            {difficulty}
          </span>
          {patterns.map((p) => (
            <span key={p} className="rounded-sm bg-surface-raised px-1.5 py-0.5 text-[11px] text-text-faint">
              {p}
            </span>
          ))}
        </div>
        {problem.sourceUrl ? (
          /* Statements are written originally; the link is attribution to
             wherever the problem comes from. */
          <p className="mt-2 text-xs text-text-faint">
            Originally from{" "}
            <a href={String(problem.sourceUrl)} rel="noreferrer noopener" className="text-accent hover:underline">
              {String(problem.sourceName ?? "source")}
            </a>
          </p>
        ) : null}
      </header>

      <section className="prose-editorial mb-6 max-w-prose whitespace-pre-wrap text-sm text-text-muted">
        {String(problem.statement ?? "")}
        {problem.constraints ? (
          <>
            {"\n\n"}
            <strong className="text-text">Constraints</strong>
            {"\n"}
            {String(problem.constraints)}
          </>
        ) : null}
      </section>

      <ProblemWorkbench
        problemSlug={slug}
        starterCode={String(problem.starterCode ?? "")}
        cases={cases}
      />
    </main>
  );
}
