/**
 * Content-Security-Policy for mohasinac.com.
 *
 * Owned by the app rather than taken from `@mohasinac/appkit/security/csp`,
 * for two reasons:
 *
 *  1. This site needs `'wasm-unsafe-eval'`, which appkit's builder does not
 *     emit. A `buildCSP(nonce, { wasm: true })` option HAS been added on the
 *     appkit branch `feat/mohasinac-site` (commit 003ca865) but is not
 *     published, and Vercel installs appkit from the npm registry — so
 *     depending on it here would break the deploy.
 *  2. The directives a portfolio/course site needs genuinely differ from a
 *     marketplace's. appkit's policy allows `https://accounts.google.com` in
 *     `frame-src` and a broad `img-src https:`; this app has its own Firebase
 *     project and self-hosted fonts, so it can be stricter.
 *
 * When the appkit branch is merged and published, this can either delegate to
 * appkit or stay as-is. Staying is fine — a per-app CSP is not duplication
 * worth removing.
 */

/** Generate a 16-byte base64 nonce for a single request. */
export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

export interface AppCSPOptions {
  /**
   * Emit `'wasm-unsafe-eval'` in `script-src`.
   *
   * Required wherever the C++ sandbox runs: WebAssembly compilation counts as
   * script evaluation, so a nonce-only `script-src` blocks it outright.
   * Deliberately narrower than `'unsafe-eval'` — it permits WebAssembly and
   * still forbids `eval` and `new Function` for JavaScript.
   */
  wasm?: boolean;
}

export function buildAppCSP(nonce: string, options: AppCSPOptions = {}): string {
  const isDev = process.env.NODE_ENV === "development";
  const wasm = options.wasm === true ? " 'wasm-unsafe-eval'" : "";

  return [
    "default-src 'self'",

    isDev
      ? // Dev needs eval for fast refresh; 'unsafe-eval' already covers wasm.
        "script-src 'self' 'unsafe-eval' 'unsafe-inline'"
      : `script-src 'self' 'nonce-${nonce}'${wasm}`,

    // 'unsafe-inline' for styles only. Tailwind emits a stylesheet, but Next
    // inlines critical CSS and injects style attributes during hydration; a
    // nonce cannot cover a style attribute. Style injection is not a script
    // execution primitive, so this is a far smaller concession than it looks.
    "style-src 'self' 'unsafe-inline'",

    // Self-hosted woff2 only — no third-party font origin to trust.
    "font-src 'self'",

    // data: for inlined SVG/placeholder images; blob: for canvas work.
    // Firebase Storage serves user-uploaded media.
    "img-src 'self' data: blob: https://firebasestorage.googleapis.com https://storage.googleapis.com",

    [
      "connect-src 'self'",
      // Firebase Auth + Firestore/Storage REST surfaces used by the client SDK
      // for AUTH only (all data access is server-side via the Admin SDK).
      "https://*.googleapis.com",
      "https://securetoken.googleapis.com",
      "https://identitytoolkit.googleapis.com",
      // The C++ toolchain is served same-origin from /toolchain, so 'self'
      // already covers it. No CDN entry needed — that is the point of staging
      // it into public/ at build time.
      ...(isDev ? ["ws:", "http://localhost:*"] : []),
    ].join(" "),

    // The sandbox compiles and runs in a dedicated worker.
    "worker-src 'self' blob:",

    // Nothing is embedded, and nothing may embed this site.
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "object-src 'none'",

    "base-uri 'self'",
    "form-action 'self'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}
