import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Writing",
  description: "Notes on building things that run in production.",
};

/**
 * Blog index.
 *
 * Deliberately empty rather than seeded with invented posts: a fake article
 * with a fake date is a claim that something was written, and unlike a
 * placeholder bio it cannot be read as scaffolding. Posts arrive when the
 * Firestore-backed blog feature and its admin authoring UI land.
 */
export default function BlogIndexPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <header className="mb-8">
        <p className="text-xs uppercase tracking-[0.2em] text-text-faint">technical blog</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Writing</h1>
        <p className="prose-editorial mt-3 max-w-prose text-text-muted">
          Notes on building things that run in production — the parts that are hard to get right.
        </p>
      </header>

      <div className="rounded-md border border-border bg-surface p-5">
        <p className="text-sm text-text-muted">
          No posts published yet. The first few are already written in commit messages; they will
          appear here once the authoring UI ships.
        </p>
        <p className="mt-3 text-sm text-text-muted">
          In the meantime, the{" "}
          <Link href="/sandbox" className="text-accent hover:underline">
            C++ sandbox
          </Link>{" "}
          is live, and the{" "}
          <Link href="/projects" className="text-accent hover:underline">
            projects
          </Link>{" "}
          page describes what has been built.
        </p>
      </div>
    </main>
  );
}
