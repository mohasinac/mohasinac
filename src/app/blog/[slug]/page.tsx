import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublishedBySlug } from "@/lib/public-content";
import { Markdown } from "@/components/Markdown";

export const revalidate = 3600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const post = await getPublishedBySlug("posts", (await params).slug);
  if (!post) return { title: "Not found", robots: { index: false, follow: false } };

  const title = String(post.metaTitle ?? post.title ?? post.slug);
  const description = String(post.metaDescription ?? post.excerpt ?? "");
  return {
    title,
    description,
    openGraph: { title, description, type: "article" },
  };
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const post = await getPublishedBySlug("posts", (await params).slug);
  // A draft or archived post is indistinguishable from a missing one here, on
  // purpose: an unpublished URL should not confirm that it exists.
  if (!post) notFound();

  const tags = Array.isArray(post.tags) ? (post.tags as string[]) : [];

  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <nav className="mb-6 text-xs">
        <Link href="/blog" className="text-text-faint hover:text-accent">
          ← Writing
        </Link>
      </nav>

      <article>
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">{String(post.title ?? post.slug)}</h1>
          <p className="mt-2 text-xs text-text-faint">
            {post.publishedAt ? String(post.publishedAt).slice(0, 10) : "unpublished"}
            {post.readTimeMinutes ? ` · ${String(post.readTimeMinutes)} min read` : ""}
          </p>
          {tags.length ? (
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {tags.map((t) => (
                <li key={t} className="rounded-sm bg-surface-raised px-1.5 py-0.5 text-[11px] text-text-faint">
                  {t}
                </li>
              ))}
            </ul>
          ) : null}
        </header>

        {/*
          Rendered through the structural markdown renderer, NOT
          dangerouslySetInnerHTML. Content is authored through the admin
          console, but injecting raw HTML here would make the CMS an XSS vector
          against its own readers — and a nonce-based CSP would not stop markup
          that the server itself emitted.
        */}
        <Markdown source={String(post.content ?? "")} />
      </article>
    </main>
  );
}
