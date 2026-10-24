import Link from "next/link";
import { getDb } from "@/lib/firestore";
import { RESOURCES, type ResourceKey } from "@/lib/resources";

/**
 * Admin overview — a live count per collection.
 *
 * Counts use Firestore's aggregation query, which bills a fraction of a read
 * rather than streaming every document just to call `.length` on it.
 */
export default async function AdminHomePage() {
  const db = getDb();
  const entries = Object.entries(RESOURCES) as [ResourceKey, (typeof RESOURCES)[ResourceKey]][];

  const counts = await Promise.all(
    entries.map(async ([key, def]) => {
      try {
        const total = (await db.collection(def.collection).count().get()).data().count;
        const published = (
          await db.collection(def.collection).where("status", "==", "published").count().get()
        ).data().count;
        return { key, label: def.label, group: def.group, total, published, error: false };
      } catch {
        // A missing composite index or an unprovisioned collection should show
        // as an unknown count, not take the whole dashboard down.
        return { key, label: def.label, group: def.group, total: 0, published: 0, error: true };
      }
    }),
  );

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Content</h1>
        <p className="mt-1 text-sm text-text-muted">
          Every collection, with live counts. Empty is expected until content is imported.
        </p>
      </header>

      <ul className="grid gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
        {counts.map((c) => (
          <li key={c.key} className="bg-surface">
            <Link href={`/admin/${c.key}`} className="block p-4 transition-colors hover:bg-bg">
              <span className="flex items-baseline justify-between">
                <span className="font-medium text-accent">{c.label}</span>
                <span className="text-[10px] uppercase tracking-wider text-text-faint">{c.group}</span>
              </span>
              <span className="mt-2 block font-mono text-2xl">
                {c.error ? <span className="text-sm text-warning">unavailable</span> : c.total}
              </span>
              {!c.error ? (
                <span className="mt-0.5 block text-xs text-text-faint">{c.published} published</span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
