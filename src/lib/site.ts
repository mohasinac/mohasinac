/**
 * Canonical site origin, with no trailing slash.
 *
 * Vercel sets NEXT_PUBLIC_SITE_URL per environment (production points at the
 * custom domain, preview is left unset so it falls back). Absolute URLs matter
 * for the sitemap, the RSS feed and Open Graph tags — a relative URL in any of
 * those is silently wrong rather than broken, which is why this is centralised
 * instead of re-derived at each call site.
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.mohasinac.com").replace(
  /\/+$/,
  "",
);

export const SITE_NAME = "mohasinac";
export const SITE_DESCRIPTION =
  "Portfolio, technical writing, an in-browser C++ sandbox and a competitive-programming course.";
