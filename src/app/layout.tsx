import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { SiteNav } from "@/components/SiteNav";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME ?? "Mohasin A C";

export const metadata: Metadata = {
  // SITE_URL comes from @/lib/site so the sitemap, the RSS feed and these
  // metadata tags cannot disagree. They previously had separate definitions
  // with different fallbacks, which would have put localhost URLs in one and
  // the production domain in another.
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — engineer, writer, course author`,
    template: `%s · ${SITE_NAME}`,
  },
  description:
    "Portfolio, technical writing, an in-browser C++ sandbox, and a competitive-programming course taught from first principles.",
  robots: { index: true, follow: true },
  alternates: {
    canonical: "/",
    types: { "application/rss+xml": `${SITE_URL}/feed.xml` },
  },
};

export const viewport: Viewport = {
  // The technical theme is dark-first; declaring both lets the browser paint
  // form controls and scrollbars correctly before hydration.
  colorScheme: "dark light",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0b0d10" },
    { media: "(prefers-color-scheme: light)", color: "#fbfbfa" },
  ],
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  /*
   * 🛑 This `headers()` read is LOAD-BEARING, not informational — do not
   * "optimise" it away.
   *
   * A nonce-based CSP is incompatible with static prerendering: the HTML is
   * baked at build time, while middleware mints a fresh nonce per request, so
   * nothing in cached markup can ever carry a matching nonce. Next only stamps
   * the nonce onto its inline bootstrap scripts for DYNAMICALLY rendered
   * routes. Reading a request header opts this layout out of static
   * generation, which is what makes the nonce reachable at all.
   *
   * Without it the deployed page rendered but refused all three Next inline
   * scripts, so hydration never ran. Verified in a real browser console —
   * nothing in the build output hints at it.
   *
   * The cost is that pages render per-request rather than being served as
   * static files. For this site that is an acceptable trade: most of it
   * (course, admin, account) is auth-gated and dynamic anyway.
   */
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  /*
   * `data-theme` is pinned to the dark preset. A later phase swaps this for
   * appkit's ThemeProvider plus a pre-paint script that reads the stored
   * preference — that script is why the nonce is threaded down here.
   */
  return (
    <html lang="en" data-theme="technical-dark" suppressHydrationWarning>
      <body>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <SiteNav />
        <div id="main">{children}</div>
        {/* Surfaces the nonce for client code that must inject a styled or
            scripted element later (e.g. the theme pre-paint script). Reading
            it is also what keeps this route dynamic — see above. */}
        <meta name="csp-nonce" content={nonce} />
      </body>
    </html>
  );
}
