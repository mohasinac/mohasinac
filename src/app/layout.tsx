import type { Metadata, Viewport } from "next";
import "./globals.css";

const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME ?? "Mohasin A C";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — engineer, writer, course author`,
    template: `%s · ${SITE_NAME}`,
  },
  description:
    "Portfolio, technical writing, an in-browser C++ sandbox, and a competitive-programming course taught from first principles.",
  robots: { index: true, follow: true },
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  /*
   * `data-theme` is hardcoded to the dark preset for now. Phase 2 replaces this
   * with appkit's ThemeProvider plus a pre-paint inline script that reads the
   * stored preference — that script will need the `x-nonce` header middleware
   * sets, since the production CSP is nonce-based.
   */
  return (
    <html lang="en" data-theme="technical-dark" suppressHydrationWarning>
      <body>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <div id="main">{children}</div>
      </body>
    </html>
  );
}
