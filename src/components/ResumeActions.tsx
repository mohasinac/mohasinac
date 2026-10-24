"use client";

import { useState } from "react";

/**
 * "Download PDF" via the browser's own print-to-PDF.
 *
 * 🛑 Why not a real file: a PDF in `public/` would be served directly at a
 * guessable URL, and `middleware.ts`'s matcher excludes static assets — so the
 * "login required" would be decorative. Cloud Storage is also still
 * unprovisioned. Printing the gated page means the bytes are only ever
 * produced behind the session check, needs no new dependency, and the resume
 * can never drift from the site content because it IS the site content.
 */
export function ResumeActions() {
  const [logged, setLogged] = useState(false);

  async function onDownload() {
    // Logged before printing, not after: `window.print()` blocks on a modal
    // dialog, and a user who cancels it has still been shown the resume.
    if (!logged) {
      try {
        await fetch("/api/resume/log", { method: "POST" });
        setLogged(true);
      } catch {
        // Never block the download on telemetry.
      }
    }
    window.print();
  }

  return (
    <div className="flex flex-wrap items-center gap-3 print:hidden">
      <button
        type="button"
        onClick={onDownload}
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-on-accent transition-opacity hover:opacity-90"
      >
        Download PDF
      </button>
      <span className="text-xs text-text-faint">
        Opens your browser’s print dialog — choose “Save as PDF”.
      </span>
    </div>
  );
}
