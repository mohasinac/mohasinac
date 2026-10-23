import type { Metadata } from "next";
import { CERTIFICATIONS, HOBBIES, PROFILE, TOOLS } from "@/content/profile";

export const metadata: Metadata = {
  title: "About",
  description: "Who I am, what I work with, and what I do away from a keyboard.",
};

const CATEGORY_ORDER = ["language", "framework", "data", "infra", "tooling"] as const;

export default function AboutPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <header className="mb-10">
        <p className="text-xs uppercase tracking-[0.2em] text-text-faint">{PROFILE.tagline}</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{PROFILE.name}</h1>
        <p className="prose-editorial mt-3 max-w-prose whitespace-pre-line text-text-muted">
          {PROFILE.bio}
        </p>
        <p className="mt-3 text-sm text-text-faint">
          {PROFILE.location}
          {PROFILE.email ? ` · ${PROFILE.email}` : ""}
          {" · "}
          <a href={PROFILE.links.github} className="text-accent hover:underline" rel="noreferrer noopener">
            github
          </a>
        </p>
      </header>

      <section className="mb-10">
        <h2 className="mb-3 font-mono text-xs uppercase tracking-wider text-text-faint">Tools</h2>
        <div className="space-y-4">
          {CATEGORY_ORDER.map((cat) => {
            const items = TOOLS.filter((t) => t.category === cat);
            if (!items.length) return null;
            return (
              <div key={cat}>
                <h3 className="mb-1.5 text-xs uppercase tracking-wider text-accent">{cat}</h3>
                <ul className="grid gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-2">
                  {items.map((t) => (
                    <li key={t.name} className="bg-surface px-3 py-2">
                      <span className="text-sm font-medium">{t.name}</span>
                      <span className="mt-0.5 block text-xs text-text-muted">{t.note}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 font-mono text-xs uppercase tracking-wider text-text-faint">
          Certifications
        </h2>
        {CERTIFICATIONS.length ? (
          <ul className="space-y-px overflow-hidden rounded-md border border-border bg-border">
            {CERTIFICATIONS.map((c) => (
              <li key={c.title} className="bg-surface px-3 py-2">
                <span className="text-sm font-medium">{c.title}</span>
                <span className="mt-0.5 block text-xs text-text-muted">
                  {c.issuer} · {c.issuedAt}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          /* Stated plainly rather than faked. An invented certification is a
             claim about credentials, which is not a placeholder worth shipping. */
          <p className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-muted">
            None listed yet.
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-mono text-xs uppercase tracking-wider text-text-faint">Away from the keyboard</h2>
        <ul className="grid gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-2">
          {HOBBIES.map((h) => (
            <li key={h.name} className="bg-surface px-3 py-2">
              <span className="text-sm font-medium">{h.name}</span>
              <span className="mt-0.5 block text-xs text-text-muted">{h.note}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
