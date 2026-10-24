import type { Metadata } from "next";
import { CERTIFICATIONS, type Certification } from "@/content/profile";
import { listPublished } from "@/lib/public-content";
import { Timeline, TimelineDates, type TimelineItem } from "@/components/Timeline";
import { credentialStatus, formatPartialDate, type CredentialStatus } from "@/lib/portfolio";

export const metadata: Metadata = {
  title: "Certifications",
  description: "Credentials, when they were earned, and whether they are still current.",
};

async function load(): Promise<readonly Certification[]> {
  const docs = await listPublished("certifications");
  if (!docs) return CERTIFICATIONS;
  return docs.map((d) => ({
    title: String(d.title ?? ""),
    issuer: String(d.issuer ?? ""),
    issuedAt: String(d.issuedAt ?? ""),
    ...(typeof d.expiresAt === "string" ? { expiresAt: d.expiresAt } : {}),
    ...(typeof d.credentialId === "string" ? { credentialId: d.credentialId } : {}),
    ...(typeof d.credentialUrl === "string" ? { credentialUrl: d.credentialUrl } : {}),
    skills: Array.isArray(d.skills) ? (d.skills as string[]) : [],
    verified: true,
  }));
}

/**
 * 🛑 Status is computed and SHOWN, not left implicit in a date. A credential
 * that has quietly lapsed is worse than one that is absent, so an expired
 * entry says so rather than sitting in the list looking current.
 */
const STATUS_STYLE: Record<CredentialStatus, { label: string; className: string }> = {
  active: { label: "current", className: "text-success" },
  expiring: { label: "expiring soon", className: "text-warning" },
  expired: { label: "expired", className: "text-error" },
  permanent: { label: "no expiry", className: "text-text-faint" },
};

export default async function CertificationsPage() {
  const certs = await load();

  const items: TimelineItem[] = certs.map((c, i) => {
    const status = STATUS_STYLE[credentialStatus(c.expiresAt)];
    return {
      key: `${c.title}-${c.issuedAt}-${i}`,
      issuedAt: c.issuedAt,
      body: (
        <div>
          <TimelineDates from={formatPartialDate(c.issuedAt)} />
          <h2 className="mt-1 flex flex-wrap items-baseline gap-2 text-base font-medium tracking-tight">
            {c.title}
            <span className={`font-mono text-[11px] ${status.className}`}>{status.label}</span>
          </h2>
          <p className="text-sm text-text-muted">{c.issuer}</p>
          {c.expiresAt ? (
            <p className="mt-1 font-mono text-[11px] text-text-faint">
              valid to {formatPartialDate(c.expiresAt)}
            </p>
          ) : null}
          {c.credentialUrl ? (
            <p className="mt-1 text-sm">
              <a
                href={c.credentialUrl}
                rel="noreferrer noopener"
                className="text-accent hover:underline"
              >
                Verify{c.credentialId ? ` · ${c.credentialId}` : ""}
              </a>
            </p>
          ) : c.credentialId ? (
            <p className="mt-1 font-mono text-[11px] text-text-faint">{c.credentialId}</p>
          ) : null}
          {c.skills && c.skills.length > 0 ? (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {c.skills.map((s) => (
                <li
                  key={s}
                  className="rounded-sm bg-surface-raised px-1.5 py-0.5 font-mono text-[11px] text-text-faint"
                >
                  {s}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ),
    };
  });

  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <header className="mb-10">
        <p className="text-xs uppercase tracking-[0.2em] text-text-faint">portfolio</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Certifications</h1>
        <p className="mt-3 max-w-prose text-sm text-text-muted">
          Credentials with their issue date and whether they are still current.
        </p>
      </header>

      {items.length > 0 ? (
        <Timeline items={items} />
      ) : (
        <p className="text-sm text-text-muted">No certifications published yet.</p>
      )}
    </main>
  );
}
