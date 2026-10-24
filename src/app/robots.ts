import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/**
 * robots.txt
 *
 * The disallow list is defence in depth, not the access control — `/course`
 * and `/admin` are gated server-side in every route, and a robots directive
 * is a request that well-behaved crawlers honour, nothing more. It is here so
 * that gated pages do not accumulate crawl budget or show up as redirect
 * chains in search consoles.
 *
 * `/api/` is disallowed for the same reason: those endpoints return 401 to
 * anonymous callers, so crawling them is pure noise.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/learn", "/problems", "/api/", "/login"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
