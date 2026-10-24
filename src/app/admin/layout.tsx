import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { groupedResources } from "@/lib/resources";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

/**
 * Admin console shell — an IDE-shaped layout: resource tree on the left,
 * content on the right.
 *
 * 🛑 The role check here guards the whole subtree, but it is NOT the only
 * guard. Every /api/admin route re-checks independently, because a page-level
 * check protects the UI and not the data behind it.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=%2Fadmin");
  if (user.role !== "admin") {
    // Deliberately a 404-style dead end rather than an explanation: a
    // non-admin has no business learning the shape of the admin console.
    redirect("/");
  }

  const groups = groupedResources();

  return (
    <div className="mx-auto flex max-w-6xl gap-6 px-5 py-8">
      <aside className="w-48 shrink-0">
        <p className="mb-3 text-xs uppercase tracking-[0.2em] text-text-faint">Admin</p>
        <nav aria-label="Resources" className="space-y-4 text-sm">
          {Object.entries(groups).map(([group, items]) => (
            <div key={group}>
              <p className="mb-1 text-[11px] uppercase tracking-wider text-accent">{group}</p>
              <ul className="space-y-0.5">
                {items.map((r) => (
                  <li key={r.key}>
                    <Link
                      href={`/admin/${r.key}`}
                      className="block rounded-sm px-2 py-1 text-text-muted transition-colors hover:bg-surface-raised hover:text-text"
                    >
                      {r.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div>
            <p className="mb-1 text-[11px] uppercase tracking-wider text-accent">Tools</p>
            <Link
              href="/admin/import"
              className="block rounded-sm px-2 py-1 text-text-muted transition-colors hover:bg-surface-raised hover:text-text"
            >
              Bulk import
            </Link>
          </div>
        </nav>
      </aside>

      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
