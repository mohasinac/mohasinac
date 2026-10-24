"use client";

/**
 * The code listing, with the executing line highlighted and a breakpoint
 * gutter.
 *
 * 🛑 The gutter only offers breakpoints on lines that actually produced a
 * frame. A breakpoint on a blank line, a comment, or a statement the splice
 * planner skipped can never be hit, and a breakpoint that silently never fires
 * reads as a broken debugger rather than as an un-instrumented line. Those
 * lines render without a dot at all, which says "not available here" without a
 * word of explanation.
 */

import type { ReactNode } from "react";

export interface CodePaneProps {
  readonly source: string;
  /** 1-based. Absent means no frame is selected. */
  readonly currentLine?: number;
  readonly breakpoints: ReadonlySet<number>;
  /** Lines that produced at least one frame. */
  readonly executable: ReadonlySet<number>;
  readonly onToggleBreakpoint: (line: number) => void;
  /** line -> condition source, shown as a chip. */
  readonly conditions?: ReadonlyMap<number, string>;
  /** Lines the planner could not instrument, with the reason. */
  readonly skipped?: ReadonlyMap<number, string>;
}

export function CodePane({
  source,
  currentLine,
  breakpoints,
  executable,
  onToggleBreakpoint,
  conditions,
  skipped,
}: CodePaneProps): ReactNode {
  // Trailing newline would otherwise render a phantom final line.
  const lines = source.replace(/\n$/, "").split("\n");

  return (
    <div className="max-h-80 overflow-auto font-mono text-xs leading-5">
      <table className="w-full border-collapse">
        <tbody>
          {lines.map((text, i) => {
            const line = i + 1;
            const isCurrent = line === currentLine;
            const hasBp = breakpoints.has(line);
            const canBp = executable.has(line);
            const condition = conditions?.get(line);
            const skipReason = skipped?.get(line);

            return (
              <tr
                key={line}
                className={isCurrent ? "bg-accent/15" : undefined}
                // The executing line is the one piece of state a screen reader
                // most needs; the highlight alone is colour-only.
                aria-current={isCurrent ? "step" : undefined}
              >
                <td className="w-6 select-none py-0 pl-1 pr-0 align-top">
                  {canBp ? (
                    <button
                      type="button"
                      onClick={() => onToggleBreakpoint(line)}
                      aria-pressed={hasBp}
                      aria-label={
                        hasBp
                          ? `Remove breakpoint on line ${line}`
                          : `Set a breakpoint on line ${line}`
                      }
                      title={condition ? `breaks when ${condition}` : `line ${line}`}
                      className="flex h-5 w-4 items-center justify-center"
                    >
                      <span
                        aria-hidden="true"
                        className={[
                          "block h-2 w-2 rounded-full border transition-colors",
                          hasBp
                            ? condition
                              ? "border-warning bg-warning"
                              : "border-error bg-error"
                            : "border-border bg-transparent hover:border-error",
                        ].join(" ")}
                      />
                    </button>
                  ) : (
                    <span
                      className="block h-5"
                      title={skipReason ? `not traced — ${skipReason}` : undefined}
                    />
                  )}
                </td>
                <td className="w-8 select-none py-0 pr-2 text-right align-top text-text-faint">
                  {line}
                </td>
                <td className="whitespace-pre py-0 align-top">
                  {/* A text node, never innerHTML. Syntax highlighting would
                      mean parsing C++ here; the current-line highlight is what
                      actually matters for following execution. */}
                  {text === "" ? " " : text}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
