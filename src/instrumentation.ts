/**
 * Next.js instrumentation hook.
 *
 * `register()` runs once per server process, before any request is handled —
 * the only correct place to register appkit's providers.
 *
 * IMPORTANT: this file must live at `src/instrumentation.ts`, not the repo
 * root. Next.js only looks for a root `instrumentation.ts` in projects WITHOUT
 * a `src/` directory; this app has `src/app`, so a root copy would be silently
 * ignored (a mistake letitrip.in paid for — its deployment digest never fired
 * because the wiring sat in the file Next ignores).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { initProviders } = await import("./providers.config");
  await initProviders();
}

/**
 * Called for every server-side error that ESCAPES — chiefly RSC render errors,
 * which never pass through a route handler. In production React replaces the
 * real message with a digest, so logging that digest alongside the message is
 * the only way to connect a user report back to the actual failure.
 */
export async function onRequestError(
  err: unknown,
  request: { path?: string; method?: string },
  context: { routePath?: string; routeType?: string },
): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const error = err as (Error & { digest?: string }) | undefined;
  console.error(
    `[rsc-error] digest=${error?.digest ?? "none"} route=${
      context?.routePath || request?.path || "(unknown)"
    } method=${request?.method ?? "-"}: ${error?.message ?? String(err)}`,
    error?.stack,
  );
}
