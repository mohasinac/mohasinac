import Link from "next/link";
import { SectionArt, type SectionArtVariant } from "@/components/SectionArt";

/**
 * Home page. Phase 4 replaces the profile strip with Firestore-backed content
 * from `features/portfolio`.
 */

type Section = {
  href: string;
  label: string;
  note: string;
  art: SectionArtVariant;
  /** Honest status, so a card never implies something that is not there yet. */
  status: "live" | "building";
  meta: string;
};

const SECTIONS: readonly Section[] = [
  {
    href: "/projects",
    label: "Projects",
    note: "What I have built and shipped, the stacks behind each, and what I would do differently.",
    art: "projects",
    status: "building",
    meta: "portfolio",
  },
  {
    href: "/blog",
    label: "Writing",
    note: "Notes on building things that run in production — the parts that are hard to get right.",
    art: "writing",
    status: "building",
    meta: "technical blog",
  },
  {
    href: "/sandbox",
    label: "Sandbox",
    note: "Compile and run C++ in your browser. Clang is WebAssembly; no server sees your code.",
    art: "sandbox",
    status: "building",
    meta: "clang 22 · wasm",
  },
  {
    href: "/learn",
    label: "CP course",
    note: "C++ from first principles: data structures built as classes, then Blind 75 and beyond.",
    art: "course",
    status: "live",
    meta: "sign-in required",
  },
];

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
              <Link
                href={s.href}
                className="flex h-full flex-col gap-3 p-4 transition-colors hover:bg-bg"
              >
                <span className="flex items-start justify-between gap-3">
                  <span className="text-accent">
                    <SectionArt variant={s.art} />
                  </span>
                  <span
                    className={`rounded-sm px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${
                      s.status === "live"
                        ? "bg-surface-raised text-success"
                        : "bg-surface-raised text-text-faint"
                    }`}
                  >
                    {s.status === "live" ? "live" : "building"}
                  </span>
                </span>

                <span>
                  <span className="block font-medium text-accent">{s.label}</span>
                  <span className="mt-1 block text-sm leading-relaxed text-text-muted">{s.note}</span>
                </span>

                <span className="mt-auto pt-1 text-[11px] uppercase tracking-wider text-text-faint">
                  {s.meta}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <footer className="mt-12 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-4 text-xs text-text-faint">
        <span>Built in the open — each section ships as it is finished.</span>
        <span className="text-success">● deployed</span>
      </footer>
    </main>
  );
}
