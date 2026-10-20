import Link from "next/link";

/**
 * Phase 1 landing page — a real page that proves the skeleton boots, not a
 * placeholder to be thrown away. Phase 4 replaces the profile strip with
 * Firestore-backed content from `features/portfolio`.
 */

const SECTIONS = [
  {
    href: "/projects",
    label: "Projects",
    note: "What I have built and shipped",
    phase: "Phase 4",
  },
  {
    href: "/blog",
    label: "Writing",
    note: "Notes on building things that run in production",
    phase: "Phase 5",
  },
  {
    href: "/sandbox",
    label: "Sandbox",
    note: "Compile and run C++ in your browser — no server",
    phase: "Phase 6",
  },
  {
    href: "/course",
    label: "CP course",
    note: "C++ from first principles to Blind 75 and beyond",
    phase: "Phase 7",
  },
] as const;

export default function HomePage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-16">
      <header className="mb-12">
        <p className="text-xs uppercase tracking-[0.2em] text-text-faint">
          {/* TODO(profile): replaced by Firestore profile content in Phase 4 */}
          engineer · builder · course author
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-text">
          {process.env.NEXT_PUBLIC_SITE_NAME ?? "Mohasin A C"}
        </h1>
        {/* Long prose opts out of the mono stack — see .prose-editorial. */}
        <p className="prose-editorial mt-4 max-w-prose text-text-muted">
          I build web products end to end and write about the parts that are hard to get right. This
          site also hosts a C++ competitive-programming course whose code runs entirely in your
          browser — the compiler is WebAssembly, and nothing you write leaves your machine.
        </p>
      </header>

      <nav aria-label="Sections">
        {/* gap-px over a border-coloured background draws hairline gridlines
            between cells without doubling borders. */}
        <ul className="grid gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-2">
          {SECTIONS.map((s) => (
            <li key={s.href} className="bg-surface">
              <Link href={s.href} className="block p-4 transition-colors hover:bg-bg">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="font-medium text-accent">{s.label}</span>
                  <span className="rounded-sm bg-surface-raised px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-text-faint">
                    {s.phase}
                  </span>
                </span>
                <span className="mt-1 block text-sm text-text-muted">{s.note}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <footer className="mt-12 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-4 text-xs text-text-faint">
        <span>Skeleton is live. Sections land in the phase marked against each.</span>
        <span className="text-success">● deployed</span>
      </footer>
    </main>
  );
}
