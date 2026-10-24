/**
 * A vertical chronological rail, grouped by year.
 *
 * One component, two instantiations (experience and certifications): the rail,
 * the year headings and the dots are identical, and only the body of an entry
 * differs — so that is the only thing passed in.
 *
 * Drawn with borders and a positioned dot rather than SVG. The rail is a
 * 1px line and a circle; reaching for SVG here would add markup without
 * adding anything you can see.
 */

import type { ReactNode } from "react";
import { byRecencyDesc, yearOf } from "@/lib/portfolio";

export interface TimelineItem {
  readonly key: string;
  /** Sorting fields. A missing `endDate` alongside a `startDate` means present. */
  readonly startDate?: string;
  readonly endDate?: string;
  readonly issuedAt?: string;
  readonly body: ReactNode;
}

export function Timeline({ items }: { readonly items: readonly TimelineItem[] }) {
  if (items.length === 0) return null;

  /*
   * Year headings are marked in a pass over the already-sorted list, so they
   * cannot disagree with the order the way a separate grouping pass could.
   * Computed up front rather than tracked in a variable during render —
   * reassigning across a map callback is mutation during render, which the
   * react-hooks immutability rule rejects, correctly.
   */
  const ordered = byRecencyDesc(items).map((item, i, all) => {
    const year = yearOf(item.startDate ?? item.issuedAt);
    const prev = i > 0 ? all[i - 1] : undefined;
    const prevYear = prev ? yearOf(prev.startDate ?? prev.issuedAt) : "";
    return { item, year, isNewYear: year !== prevYear };
  });

  return (
    <ol className="relative ml-2 border-l border-border pl-6">
      {ordered.map(({ item, year, isNewYear }) => {
        return (
          <li key={item.key} className="relative pb-7 last:pb-0">
            {isNewYear ? (
              <span
                className="absolute -left-[3.25rem] top-0 w-10 text-right font-mono text-[11px] text-text-faint"
                aria-hidden="true"
              >
                {year}
              </span>
            ) : null}
            {/* The dot sits ON the rail: half its width to the left of the
                padding edge, so it is centred on the 1px border. */}
            <span
              aria-hidden="true"
              className="absolute -left-[1.4375rem] top-1.5 h-2 w-2 rounded-full border border-accent bg-bg"
            />
            {item.body}
          </li>
        );
      })}
    </ol>
  );
}

/** The year is decorative in the rail, so each entry still states its own dates. */
export function TimelineDates({
  from,
  to,
  present,
}: {
  readonly from: string;
  readonly to?: string;
  readonly present?: boolean;
}) {
  return (
    <p className="font-mono text-[11px] text-text-faint">
      {from}
      {present ? " — present" : to ? ` — ${to}` : ""}
    </p>
  );
}
