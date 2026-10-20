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
        <p className="text-sm text-[var(--text-muted)]">
          {/* TODO(profile): replaced by Firestore profile content in Phase 4 */}
          engineer · builder · course author
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          {process.env.NEXT_PUBLIC_SITE_NAME ?? "Mohasin A C"}
        </h1>
        <p className="mt-4 max-w-prose leading-relaxed text-[var(--text-muted)]">
          I build web products end to end and write about the parts that are hard to get right. This
          site also hosts a C++ competitive-programming course whose code runs entirely in your
          browser — the compiler is WebAssembly, and nothing you write leaves your machine.
        </p>
      </header>

      <nav aria-label="Sections">
        <ul className="grid gap-px overflow-hidden rounded border border-[var(--border)] bg-[var(--border)] sm:grid-cols-2">
          {SECTIONS.map((s) => (
            <li key={s.href} className="bg-[var(--surface)]">
              <Link
                href={s.href}
                className="block p-4 transition-colors hover:bg-[var(--bg)]"
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className="font-medium text-[var(--accent)]">{s.label}</span>
                  <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                    {s.phase}
                  </span>
                </span>
                <span className="mt-1 block text-sm text-[var(--text-muted)]">{s.note}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <footer className="mt-12 border-t border-[var(--border)] pt-4 text-xs text-[var(--text-muted)]">
        Skeleton is live. Sections land in the phase marked against each.
      </footer>
    </main>
  );
}
