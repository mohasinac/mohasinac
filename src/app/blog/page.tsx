import type { Metadata } from "next";
import Link from "next/link";
import { listPublished } from "@/lib/public-content";

export const metadata: Metadata = {
  title: "Writing",
  description: "Notes on building things that run in production.",
};

/** Revalidate hourly — posts change rarely and this keeps the read off the
 *  critical path for most visitors. */
export const revalidate = 3600;

export default async function BlogIndexPage() {
  const posts = (await listPublished("posts", { limit: 50 })) ?? [];

  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <header className="mb-8">
        <p className="text-xs uppercase tracking-[0.2em] text-text-faint">technical blog</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Writing</h1>
        <p className="prose-editorial mt-3 max-w-prose text-text-muted">
          Notes on building things that run in production — the parts that are hard to get right.
        </p>
      </header>

      {posts.length === 0 ? (
        /* Deliberately empty rather than seeded with invented articles: a fake
           post with a date is a claim that something was written, which — unlike
           a placeholder bio — no reader would parse as scaffolding. */
        <div className="rounded-md border border-border bg-surface p-5">
          <p className="text-sm text-text-muted">
            No posts published yet. They will appear here as they are written.
          </p>
          <p className="mt-3 text-sm text-text-muted">
            In the meantime, the{" "}
            <Link href="/sandbox" className="text-accent hover:underline">
              C++ sandbox
            </Link>{" "}
            is live and{" "}
            <Link href="/projects" className="text-accent hover:underline">
              projects
            </Link>{" "}
            describes what has been built.
          </p>
        </div>
      ) : (
        <ol className="space-y-px overflow-hidden rounded-md border border-border bg-border">
          {posts.map((p) => (
            <li key={p.id} className="bg-surface">
              <Link href={`/blog/${p.slug}`} className="block p-4 transition-colors hover:bg-bg">
                <span className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span className="font-medium text-accent">{String(p.title ?? p.slug)}</span>
                  <span className="text-xs text-text-faint">
                    {p.publishedAt ? String(p.publishedAt).slice(0, 10) : "unpublished"}
                    {p.readTimeMinutes ? ` · ${String(p.readTimeMinutes)} min` : ""}
                  </span>
                </span>
                {p.excerpt ? (
                  <span className="prose-editorial mt-1.5 block text-sm text-text-muted">
                    {String(p.excerpt)}
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
