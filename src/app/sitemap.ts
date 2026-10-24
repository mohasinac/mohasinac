import type { MetadataRoute } from "next";
import { listPublished } from "@/lib/public-content";
import { SITE_URL } from "@/lib/site";

/**
 * Sitemap for the PUBLIC surface only.
 *
 * 🛑 The course and admin areas are deliberately absent. Everything under
 * `/course` requires a login and is served with `robots: { index: false }`, so
 * listing those URLs here would advertise paths that only ever return a
 * redirect to a crawler — and would leak the full problem and lesson slug list
 * to anyone who fetches the sitemap.
 */
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/projects`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/blog`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE_URL}/sandbox`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
  ];

  // A failed read returns null, not []. Falling back to the static pages is
  // better than emitting a sitemap that silently claims the blog is empty.
  const posts = await listPublished("posts", { limit: 1000 });

  const postPages: MetadataRoute.Sitemap = (posts ?? []).map((post) => ({
    url: `${SITE_URL}/blog/${post.slug}`,
    lastModified: post.publishedAt ? new Date(String(post.publishedAt)) : now,
    changeFrequency: "yearly" as const,
    priority: 0.6,
  }));

  return [...staticPages, ...postPages];
}
