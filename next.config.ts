import type { NextConfig } from "next";

/**
 * Deliberately NOT using appkit's `defineNextConfig`: that preset carries
 * marketplace-shaped defaults (notably `images.unoptimized: true` for seed data
 * pulled from third-party hosts) that this site does not want. The pieces this
 * app actually needs from appkit are imported explicitly elsewhere.
 */
const nextConfig: NextConfig = {
  /**
   * The course split moved every learning and problem URL. Those paths were
   * live, and `/course/problems/two-sum` is exactly the kind of link that gets
   * bookmarked — so they redirect permanently rather than 404.
   *
   * 🛑 Order matters. Next matches these top to bottom, so the specific
   * `/course/problems/:slug` and `/course/lessons/:slug` rules must come BEFORE
   * the catch-all `/course/:course`, or a problem URL would be rewritten to a
   * course named "problems".
   *
   * Problems now live under a SET and the old URLs carried none, so they land
   * on the 75 — where a problem is first encountered.
   */
  async redirects() {
    return [
      { source: "/course", destination: "/learn", permanent: true },
      { source: "/course/problems", destination: "/problems", permanent: true },
      { source: "/course/problems/:slug", destination: "/problems/blind75/:slug", permanent: true },
      { source: "/course/lessons/:slug", destination: "/learn/foundations/:slug", permanent: true },
      { source: "/course/:course", destination: "/learn/:course", permanent: true },
    ];
  },

  reactStrictMode: true,
  poweredByHeader: false,

  // appkit ships ESM `dist` that must be transpiled by Next rather than loaded
  // as an external CJS package.
  transpilePackages: ["@mohasinac/appkit"],

  /*
   * No `experimental.instrumentationHook`: the hook is stable as of Next 15 and
   * the flag was REMOVED in 16 (this app runs 16.4.2), so setting it is a type
   * error rather than a no-op. `src/instrumentation.ts` is picked up on its own.
   */

  async headers() {
    return [
      {
        /*
         * The C++ toolchain: ~119 MB raw across clang wasm, the WASI sysroot
         * tar and the precompiled header. Every file name is version-stamped by
         * scripts/build-toolchain-assets.mjs, so these are safe to pin
         * immutably — a toolchain upgrade changes the path, never the contents
         * at a path.
         */
        source: "/toolchain/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
        ],
      },
      {
        source: "/fonts/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

export default nextConfig;
