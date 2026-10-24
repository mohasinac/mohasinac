import { NextResponse, type NextRequest } from "next/server";
import { buildAppCSP, generateNonce } from "@/lib/csp";

/**
 * Edge middleware: security headers, a per-request CSP nonce, and the coarse
 * auth gate for `/course` and `/admin`.
 *
 * 🛑 The gate here is a redirect for humans, NOT an access control. It only
 * checks that a session cookie is PRESENT — the edge runtime cannot verify a
 * Firebase session cookie (that needs firebase-admin, Node-only). Every route
 * under those prefixes re-checks the real identity and role server-side via
 * `createRouteHandler`/`requireRole`. Treating this as the control would mean a
 * forged cookie name grants entry.
 */

/*
 * Must match the name appkit's firebase auth provider reads
 * (providers/auth-firebase/helpers.ts). A mismatch here fails open in the worst
 * way: the gate sees no cookie and redirects a signed-in user to /login forever.
 */
const SESSION_COOKIE = "__session";

/** Paths that require a signed-in user. Course is login-only by design. */
const PROTECTED_PREFIXES = ["/learn", "/problems", "/admin", "/account"];

/** Paths under PROTECTED_PREFIXES that must stay reachable while signed out. */
const PROTECTED_EXCEPTIONS = ["/course/preview"];

function isProtected(pathname: string): boolean {
  if (PROTECTED_EXCEPTIONS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return false;
  }
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function middleware(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;

  if (isProtected(pathname) && !request.cookies.get(SESSION_COOKIE)?.value) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(login);
  }

  const nonce = generateNonce();
  // wasm: true — the sandbox and every course problem page compile C++ to
  // WebAssembly in the browser, which a nonce-only script-src would block.
  const csp = buildAppCSP(nonce, { wasm: true });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  /*
   * 🛑 Content-Security-Policy must be set on the forwarded REQUEST, not only
   * on the response. Next.js parses the nonce out of this request header to
   * stamp it onto the inline bootstrap scripts it injects itself.
   *
   * Without it the page still renders — the HTML is static — but every Next
   * inline script is refused ("Executing inline script violates the following
   * Content Security Policy directive"), hydration never runs, and the site is
   * silently non-interactive. Caught in production by a browser console check;
   * no build, typecheck or header assertion would have found it, because the
   * response header was correct all along.
   */
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  // Legacy companion to frame-ancestors 'none' in the CSP above, for old agents.
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=()",
  );
  // HSTS only in production: sending it from localhost would pin http://localhost
  // to https in the browser and break local dev for everything on that port.
  if (process.env.NODE_ENV === "production") {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload",
    );
  }

  return response;
}

export const config = {
  /*
   * Skip Next internals, the toolchain assets and static files. /toolchain is
   * excluded deliberately: those are ~30 MB of immutable wasm/tar/pch blobs
   * fetched from a worker, and running nonce generation per chunk request buys
   * nothing. Their caching headers come from next.config.ts instead.
   */
  matcher: ["/((?!_next/static|_next/image|toolchain|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico|woff2?)$).*)"],
};
