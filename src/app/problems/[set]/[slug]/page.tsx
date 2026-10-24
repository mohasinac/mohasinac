import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { getPublishedBySlug } from "@/lib/public-content";
import { getDb } from "@/lib/firestore";
import { ProblemWorkbench, type TestCase } from "@/components/course/ProblemWorkbench";
import type { AzLimits } from "@dsa/trace/az-trace-header";
import { Markdown } from "@/components/Markdown";
import { ProblemExplainer } from "@/components/course/ProblemExplainer";
import { ProblemScenarios } from "@/components/course/ProblemScenarios";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ set: string; slug: string }>;
}): Promise<Metadata> {
  const p = await getPublishedBySlug("problems", (await params).slug);
  return { title: p ? String(p.title ?? p.slug) : "Problem", robots: { index: false, follow: false } };
}

export default async function ProblemPage({ params }: { params: Promise<{ set: string; slug: string }> }) {
  const { set, slug } = await params;
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/problems/${set}/${slug}`)}`);

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
    cases = snap.docs
      .map((d) => {
        const data = d.data();
        const visibility: TestCase["visibility"] =
          String(data.visibility ?? "hidden") === "sample" ? "sample" : "hidden";
        return {
          id: d.id,
          visibility,
          input: String(data.input ?? ""),
          expectedOutput: visibility === "sample" ? String(data.expectedOutput ?? "") : null,
          sortOrder: Number(data.sortOrder ?? 0),
        };
      })
      // Samples first, then authored order: the worked examples should be the
      // ones a learner sees failing.
      .sort(
        (a, b) =>
          (a.visibility === "sample" ? 0 : 1) - (b.visibility === "sample" ? 0 : 1) ||
          a.sortOrder - b.sortOrder,
      )
      .map(({ sortOrder: _sortOrder, ...c }) => c);
  } catch (error) {
    console.error("[course] test cases unavailable", error);
  }

  const patterns = Array.isArray(problem.patterns) ? (problem.patterns as string[]) : [];
  const difficulty = String(problem.difficulty ?? "");

  return (
    <main className="mx-auto max-w-5xl px-5 py-10">
      <nav className="mb-5 text-xs">
        <Link href={`/problems/${set}`} className="text-text-faint hover:text-accent">
          ← Back to the set
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

      <section className="mb-6 max-w-prose">
        <Markdown source={String(problem.statement ?? "")} />
        {problem.constraints ? (
          <div className="mt-4 rounded-md border border-border bg-surface p-3">
            <h2 className="mb-1 font-mono text-[11px] uppercase tracking-wider text-text-faint">
              Constraints
            </h2>
            <div className="text-sm">
              <Markdown source={String(problem.constraints)} />
            </div>
          </div>
        ) : null}
      </section>

      <ProblemExplainer
        samples={cases
          .filter((c) => c.visibility === "sample" && c.expectedOutput !== null)
          .map((c) => ({ input: c.input, expectedOutput: String(c.expectedOutput) }))}
        inputFormat={problem.inputFormat as never}
        {...(problem.vizKind ? { vizKind: problem.vizKind as never } : {})}
        {...(problem.vizVar ? { vizVar: String(problem.vizVar) } : {})}
        patterns={patterns}
      />

      <ProblemWorkbench
        problemSlug={slug}
        starterCode={String(problem.starterCode ?? "")}
        cases={cases}
        {...(problem.vizLimits ? { vizLimits: problem.vizLimits as Partial<AzLimits> } : {})}
        {...(problem.vizKind ? { vizKind: problem.vizKind as never } : {})}
        {...(problem.vizVar ? { vizVar: String(problem.vizVar) } : {})}
      />

      {problem.editorial ? (
        /* Collapsed by default — an editorial visible on arrival is just the
           answer, and the point is to attempt it first. */
        <details className="mt-8 rounded-md border border-border bg-surface">
          <summary className="cursor-pointer px-4 py-3 font-mono text-xs uppercase tracking-wider text-text-faint hover:text-accent">
            Editorial — approaches and complexity
          </summary>
          <div className="border-t border-border px-4 pb-4">
            <Markdown source={String(problem.editorial)} />

            {/* Inside the reveal: naming the edge cases gives away most of the
                approach, so it belongs with the editorial, not above the
                editor. */}
            {Array.isArray(problem.scenarios) ? (
              <ProblemScenarios
                scenarios={problem.scenarios as never}
                inputFormat={problem.inputFormat as never}
                {...(problem.vizKind ? { vizKind: problem.vizKind as never } : {})}
                {...(problem.vizVar ? { vizVar: String(problem.vizVar) } : {})}
                patterns={patterns}
              />
            ) : null}
          </div>
        </details>
      ) : null}
    </main>
  );
}
