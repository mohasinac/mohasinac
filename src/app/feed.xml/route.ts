import { listPublished } from "@/lib/public-content";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";

/**
 * RSS 2.0 feed for the blog.
 *
 * Hand-built rather than pulled from a library: the document is forty lines of
 * XML and a dependency here would be larger than the code.
 *
 * 🛑 Every interpolated value goes through `escapeXml`. Post titles and
 * excerpts are authored in the CMS, so an unescaped `&` or `<` produces a feed
 * that fails to parse in every reader — and a `]]>` inside a CDATA block would
 * let authored content break out of it. Escaping rather than CDATA avoids that
 * class of problem entirely.
 */

export const revalidate = 3600;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;") // must be first, or it double-escapes the others
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** RSS requires RFC 822 dates; an invalid date must not become "Invalid Date". */
function rfc822(value: unknown): string {
  const date = value ? new Date(String(value)) : new Date();
  return (Number.isNaN(date.getTime()) ? new Date() : date).toUTCString();
}

export async function GET(): Promise<Response> {
  const posts = (await listPublished("posts", { limit: 50 })) ?? [];

  const items = posts
    .map((post) => {
      const url = `${SITE_URL}/blog/${post.slug}`;
      const title = escapeXml(String(post.title ?? post.slug));
      const description = escapeXml(String(post.excerpt ?? ""));
      return `    <item>
      <title>${title}</title>
      <link>${escapeXml(url)}</link>
      <description>${description}</description>
      <pubDate>${rfc822(post.publishedAt)}</pubDate>
      <guid isPermaLink="true">${escapeXml(url)}</guid>
    </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(SITE_NAME)}</title>
    <link>${escapeXml(SITE_URL)}</link>
    <description>${escapeXml(SITE_DESCRIPTION)}</description>
    <language>en</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${escapeXml(`${SITE_URL}/feed.xml`)}" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
