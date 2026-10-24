"use client";

import { useState } from "react";

/**
 * Bulk import UI.
 *
 * Dry run is the default and the apply button stays disabled until a dry run
 * has reported what would change — importing hundreds of records is exactly
 * the operation where "I'll just try it" is most expensive.
 */
export function ImportPanel({ resources }: { resources: Array<{ key: string; label: string }> }) {
  const [resource, setResource] = useState(resources[0]?.key ?? "");
  const [json, setJson] = useState("[\n  \n]");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dryRunPassed, setDryRunPassed] = useState(false);

  async function send(dryRun: boolean) {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      let items: unknown;
      try {
        items = JSON.parse(json);
      } catch (e) {
        // Parse locally first so a typo is reported instantly and precisely,
        // rather than as a generic 400 from the server.
        throw new Error(`Invalid JSON: ${(e as Error).message}`);
      }
      if (!Array.isArray(items)) throw new Error("Top level must be an array of records.");

      const res = await fetch("/api/admin/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resource, items, dryRun }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body?.error ?? `Import failed (${res.status})`);
        setResult(body?.invalid ? { invalid: body.invalid } : null);
        setDryRunPassed(false);
        return;
      }
      setResult(body.data ?? body);
      // Applying requires a successful dry run of the CURRENT payload.
      setDryRunPassed(dryRun);
    } catch (e) {
      setError((e as Error).message);
      setDryRunPassed(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <header className="mb-4">
        <h1 className="text-xl font-semibold tracking-tight">Bulk import</h1>
        <p className="mt-1 max-w-prose text-sm text-text-muted">
          Paste a JSON array of records. Upserts by <code>slug</code>, so re-running a corrected
          payload fixes records instead of duplicating them.
        </p>
      </header>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select
          value={resource}
          onChange={(e) => {
            setResource(e.target.value);
            setDryRunPassed(false);
          }}
          className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm outline-none focus:border-accent"
        >
          {resources.map((r) => (
            <option key={r.key} value={r.key}>
              {r.label}
            </option>
          ))}
        </select>

        <button
          type="button"
          disabled={busy}
          onClick={() => send(true)}
          className="rounded-md border border-border px-3 py-1.5 text-sm transition-colors hover:bg-surface-raised disabled:opacity-50"
        >
          {busy ? "Working…" : "Dry run"}
        </button>

        <button
          type="button"
          disabled={busy || !dryRunPassed}
          onClick={() => send(false)}
          title={dryRunPassed ? "" : "Run a dry run first"}
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-on-accent transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          Apply
        </button>
      </div>

      <textarea
        spellCheck={false}
        value={json}
        onChange={(e) => {
          setJson(e.target.value);
          // Any edit invalidates the previous dry run.
          setDryRunPassed(false);
        }}
        rows={18}
        className="w-full resize-y rounded-md border border-border bg-surface p-3 font-mono text-[13px] outline-none focus:border-accent"
      />

      {error ? (
        <p role="alert" className="mt-3 rounded-md border border-border bg-surface px-3 py-2 text-sm text-error">
          {error}
        </p>
      ) : null}

      {result ? (
        <pre className="mt-3 overflow-x-auto rounded-md border border-border bg-surface p-3 text-xs">
          {JSON.stringify(result, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}
