import type { NextConfig } from "next";

/**
 * Deliberately NOT using appkit's `defineNextConfig`: that preset carries
 * marketplace-shaped defaults (notably `images.unoptimized: true` for seed data
 * pulled from third-party hosts) that this site does not want. The pieces this
 * app actually needs from appkit are imported explicitly elsewhere.
 */
const nextConfig: NextConfig = {
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
