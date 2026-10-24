"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

type Row = Record<string, unknown> & { id: string };

const BULK_ACTIONS = [
  { action: "publish", label: "Publish" },
  { action: "draft", label: "Move to draft" },
  { action: "archive", label: "Archive" },
  { action: "feature", label: "Feature" },
  { action: "unfeature", label: "Unfeature" },
] as const;

/**
 * Generic admin table: search, status filter, row selection, bulk actions,
 * pagination. Driven entirely by props from the resource registry, so one
 * implementation covers all ten collections.
 */
export function AdminResourceTable({
  resourceKey,
  label,
  titleField,
  items,
  total,
  page,
  pageSize,
  status,
  query,
  failure,
}: {
  resourceKey: string;
  label: string;
  titleField: string;
  items: Row[];
  total: number;
  page: number;
  pageSize: number;
  status: string;
  query: string;
  failure: string | null;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    // Any filter change invalidates the current page number.
    if (key !== "page") next.delete("page");
    router.push(`/admin/${resourceKey}?${next.toString()}`);
  }

  async function runBulk(action: string) {
    if (!selected.length) return;
    setError(null);
    const res = await fetch(`/api/admin/${resourceKey}/bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ids: selected }),
    });
    if (!res.ok) {
      setError((await res.json().catch(() => ({})))?.error ?? `Bulk ${action} failed`);
      return;
    }
    setSelected([]);
    startTransition(() => router.refresh());
  }

  async function remove(id: string, hard: boolean) {
    const verb = hard ? "permanently delete" : "archive";
    if (!confirm(`Really ${verb} this record?`)) return;
    setError(null);
    const res = await fetch(`/api/admin/${resourceKey}/${id}${hard ? "?hard=true" : ""}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      setError((await res.json().catch(() => ({})))?.error ?? "Delete failed");
      return;
    }
    startTransition(() => router.refresh());
  }

  const allOnPageSelected = items.length > 0 && selected.length === items.length;

  return (
    <div>
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight">{label}</h1>
        <span className="text-xs text-text-faint">{total} record(s)</span>
      </header>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          type="search"
          defaultValue={query}
          placeholder="Search…"
          onKeyDown={(e) => {
            if (e.key === "Enter") setParam("q", (e.target as HTMLInputElement).value.trim());
          }}
          className="w-48 rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-accent"
        />
        <select
          value={status}
          onChange={(e) => setParam("status", e.target.value)}
          className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm outline-none focus:border-accent"
        >
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </select>

        {selected.length > 0 ? (
          <span className="ml-auto flex flex-wrap items-center gap-2 text-xs">
            <span className="text-text-muted">{selected.length} selected</span>
            {BULK_ACTIONS.map((b) => (
              <button
                key={b.action}
                type="button"
                disabled={pending}
                onClick={() => runBulk(b.action)}
                className="rounded-sm border border-border px-2 py-1 transition-colors hover:bg-surface-raised disabled:opacity-50"
              >
                {b.label}
              </button>
            ))}
          </span>
        ) : null}
      </div>

      {failure ? (
        <p className="mb-3 rounded-md border border-border bg-surface px-3 py-2 text-sm text-warning">
          Query failed: {failure}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mb-3 rounded-md border border-border bg-surface px-3 py-2 text-sm text-error">
          {error}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-surface-raised text-left text-xs uppercase tracking-wider text-text-faint">
            <tr>
              <th scope="col" className="w-8 px-3 py-2">
                <input
                  type="checkbox"
                  aria-label="Select all rows on this page"
                  checked={allOnPageSelected}
                  onChange={(e) => setSelected(e.target.checked ? items.map((i) => i.id) : [])}
                />
              </th>
              <th scope="col" className="px-3 py-2">Title</th>
              <th scope="col" className="px-3 py-2">Slug</th>
              <th scope="col" className="px-3 py-2">Status</th>
              <th scope="col" className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-text-faint">
                  Nothing here yet. Use Bulk import to load records.
                </td>
              </tr>
            ) : (
              items.map((row) => {
                const rowStatus = String(row.status ?? "draft");
                return (
                  <tr key={row.id} className="border-t border-border">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        aria-label={`Select ${String(row[titleField] ?? row.id)}`}
                        checked={selected.includes(row.id)}
                        onChange={(e) =>
                          setSelected((prev) =>
                            e.target.checked ? [...prev, row.id] : prev.filter((x) => x !== row.id),
                          )
                        }
                      />
                    </td>
                    <td className="px-3 py-2">{String(row[titleField] ?? "—")}</td>
                    <td className="px-3 py-2 font-mono text-xs text-text-faint">
                      {String(row.slug ?? "—")}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={
                          rowStatus === "published"
                            ? "text-success"
                            : rowStatus === "archived"
                              ? "text-text-faint"
                              : "text-warning"
                        }
                      >
                        {rowStatus}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right text-xs">
                      <button
                        type="button"
                        onClick={() => remove(row.id, false)}
                        className="mr-2 text-text-muted hover:text-text"
                      >
                        archive
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(row.id, true)}
                        className="text-error hover:underline"
                      >
                        delete
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 ? (
        <nav aria-label="Pagination" className="mt-3 flex items-center gap-2 text-xs">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setParam("page", String(page - 1))}
            className="rounded-sm border border-border px-2 py-1 disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-text-faint">
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setParam("page", String(page + 1))}
            className="rounded-sm border border-border px-2 py-1 disabled:opacity-40"
          >
            Next
          </button>
        </nav>
      ) : null}
    </div>
  );
}
