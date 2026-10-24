"use client";

import { useState } from "react";

/**
 * A themed code block with a language tag and a copy button.
 *
 * The code arrives as a plain string in a text node — never as markup — so
 * nothing authored in the CMS can execute here.
 */
export function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  const lines = code.split("\n");

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be denied; the code is selectable either way, so
      // there is nothing useful to say about it.
    }
  }

  return (
    <div className="my-4 overflow-hidden rounded-md border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
        <span className="font-mono text-[11px] uppercase tracking-wider text-text-faint">
          {lang || "text"}
        </span>
        <button
          type="button"
          onClick={copy}
          className="rounded-sm px-1.5 py-0.5 font-mono text-[11px] text-text-faint transition-colors hover:bg-surface-raised hover:text-accent"
        >
          {copied ? "copied" : "copy"}
        </button>
      </div>
      <div className="overflow-x-auto">
        <pre className="p-3 font-mono text-[13px] leading-relaxed">
          <code>
            {lines.map((line, i) => (
              <span key={i} className="grid grid-cols-[2.5rem_1fr]">
                <span aria-hidden className="select-none text-right pr-3 text-text-faint">
                  {i + 1}
                </span>
                <span>{line || " "}</span>
              </span>
            ))}
          </code>
        </pre>
      </div>
    </div>
  );
}
