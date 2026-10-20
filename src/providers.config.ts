/**
 * providers.config.ts — appkit dependency-injection wiring for mohasinac.com
 *
 * `initProviders()` must be awaited before any route handler runs; it is called
 * from `instrumentation.ts → register()`, which Next.js awaits before serving
 * the first request.
 *
 * Deliberately far smaller than letitrip.in's equivalent: this site has no
 * payments, shipping, tax or marketplace concerns, so only the five required
 * providers plus `db` are registered. Payment/shipping stay unregistered rather
 * than wired to a manual stub — an unregistered optional provider fails loudly
 * at the call site, a stub fails silently and plausibly.
 *
 * Providers are imported dynamically for the same reason letitrip.in does it:
 * `@mohasinac/appkit` is not in `serverExternalPackages`, so its `dist` is
 * inlined into the SSR chunk and a plain top-level import side-effect cannot be
 * reliably awaited across webpack's async-module boundary. Awaiting an explicit
 * async function sidesteps that.
 */

let initPromise: Promise<void> | null = null;

/** Idempotent — safe to call repeatedly; the body runs exactly once per process. */
export function initProviders(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const [
      { configureMarketDefaults },
      { firebaseAuthProvider, firebaseSessionProvider },
      { createResendProvider },
      { firebaseStorageProvider },
      { firebaseDbProvider },
      { tailwindAdapter },
      { registerProviders },
    ] = await Promise.all([
      import("@mohasinac/appkit/core/baseline-resolver"),
      import("@mohasinac/appkit/providers/auth-firebase"),
      import("@mohasinac/appkit/providers/email-resend"),
      import("@mohasinac/appkit/providers/storage-firebase"),
      import("@mohasinac/appkit/providers/db-firebase"),
      import("@mohasinac/appkit/style/tailwind"),
      import("@mohasinac/appkit/contracts/registry"),
    ]);

    // Must run before any formatter or provider reads the baseline.
    configureMarketDefaults({
      currency: "INR",
      locale: "en-IN",
      country: "IN",
      phonePrefix: "+91",
      timezone: "Asia/Kolkata",
      currencySymbol: "₹",
    });

    registerProviders({
      auth: firebaseAuthProvider,
      session: firebaseSessionProvider,
      storage: firebaseStorageProvider,
      style: tailwindAdapter,
      db: firebaseDbProvider,
      email: createResendProvider({
        apiKey: process.env.RESEND_API_KEY ?? "",
        fromName: process.env.EMAIL_FROM_NAME ?? "mohasinac.com",
        fromEmail: process.env.EMAIL_FROM ?? "",
      }),
    });
  })();
  return initPromise;
}
