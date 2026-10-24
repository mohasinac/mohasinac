"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import {
  EVERYTHING,
  STORAGE_KEY,
  applySelection,
  buildPresets,
  orderSkillLine,
  parseStoredSelection,
} from "@/lib/resume-presets";
import { byRecencyDesc, formatPartialDate } from "@/lib/portfolio";

/**
 * The resume, tailored to a skill preset.
 *
 * 🛑 Nothing here is written to Firestore. Tailoring a resume for one
 * application is not a fact about the site, so the selection lives in
 * `localStorage` and nowhere else — no API route, no collection, no document
 * to migrate later. "Save and close" means save in this browser.
 *
 * 🛑 The server renders the WHOLE resume and this filters it down. The other
 * way round — asking the server for a filtered resume — would make the
 * selection a URL parameter or a request body, which is exactly how it would
 * end up persisted. Filtering client-side keeps it local by construction.
 */

export interface ResumeRole {
  readonly role: string;
  readonly company: string;
  readonly startDate: string;
  readonly endDate?: string;
  readonly summary?: string;
  readonly highlights?: readonly string[];
  readonly skills?: readonly string[];
}

export interface ResumeProject {
  readonly title: string;
  readonly period?: string;
  readonly summary?: string;
  readonly skills?: readonly string[];
}

export interface ResumeCertification {
  readonly title: string;
  readonly issuer: string;
  readonly issuedAt: string;
  readonly skills?: readonly string[];
}

/*
 * localStorage as an external store, not as state loaded in an effect.
 *
 * 🛑 Two reasons, and the second is why the eslint rule exists. Reading it
 * during render would give the server and the client different HTML — a
 * hydration mismatch. Loading it with `setState` inside an effect instead
 * causes a cascading render, which `react-hooks/set-state-in-effect` rejects.
 * `useSyncExternalStore` is the hook built for exactly this, and this file is
 * the second place in the project to need it (see VizPlayer's reduced-motion
 * handling).
 *
 * 🛑 The snapshot is the raw STRING, deliberately. Returning a parsed array
 * would hand React a new object identity on every call and spin forever; the
 * string is stable, and parsing happens in a `useMemo` downstream.
 */
const SELECTION_EVENT = "mohasinac:resume-selection-changed";

function subscribeSelection(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  // `storage` covers another tab; the custom event covers this one, because
  // `storage` deliberately does not fire in the tab that wrote the value.
  window.addEventListener("storage", onChange);
  window.addEventListener(SELECTION_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(SELECTION_EVENT, onChange);
  };
}

function getSelectionSnapshot(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // Blocked storage (some private modes throw on access, not just on write).
    return null;
  }
}

/** The server always renders the FULL resume — the safe, hydration-stable default. */
const getServerSelectionSnapshot = (): string | null => null;

export interface ResumeComposerProps {
  readonly profile: {
    readonly name: string;
    readonly tagline: string;
    readonly bio: string;
    readonly contact: readonly string[];
  };
  readonly roles: readonly ResumeRole[];
  readonly projects: readonly ResumeProject[];
  readonly certifications: readonly ResumeCertification[];
  readonly skillLine: readonly string[];
  readonly tools: readonly { readonly name: string; readonly category: string }[];
}

export function ResumeComposer({
  profile,
  roles,
  projects,
  certifications,
  skillLine,
  tools,
}: ResumeComposerProps) {
  const [open, setOpen] = useState(false);
  const [logged, setLogged] = useState(false);
  /**
   * The selection being EDITED, or null when it matches what is saved.
   *
   * Null rather than a copy, so a selection saved in ANOTHER tab still shows
   * up here — holding a copy would silently pin this tab to a stale value.
   */
  const [draftOverride, setDraftOverride] = useState<readonly string[] | null>(null);

  const rawSelection = useSyncExternalStore(
    subscribeSelection,
    getSelectionSnapshot,
    getServerSelectionSnapshot,
  );
  const saved = useMemo(() => parseStoredSelection(rawSelection), [rawSelection]);
  const draft = draftOverride ?? saved;
  const setDraft = setDraftOverride;

  const presets = useMemo(
    () => buildPresets({ skills: skillLine, tools }),
    [skillLine, tools],
  );

  const savedSet = useMemo(() => new Set(saved), [saved]);
  const draftSet = useMemo(() => new Set(draft), [draft]);

  // The resume shows the SAVED selection; the panel previews the draft. Those
  // differing is the point of having a save step at all.
  const shown = open ? draftSet : savedSet;

  const filtered = useMemo(
    () => applySelection({ roles, projects, certifications }, shown),
    [roles, projects, certifications, shown],
  );

  const orderedSkills = useMemo(() => orderSkillLine(skillLine, shown), [skillLine, shown]);

  const activePreset = useMemo(() => {
    if (draft.length === 0) return EVERYTHING.id;
    const match = presets.find(
      (p) => p.skills.length === draft.length && p.skills.every((s) => draftSet.has(s)),
    );
    return match?.id ?? "custom";
  }, [draft, draftSet, presets]);

  const saveAndClose = useCallback(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
      // `storage` does not fire in the tab that wrote the value, so the store
      // is poked explicitly or this tab would not see its own save.
      window.dispatchEvent(new Event(SELECTION_EVENT));
    } catch {
      // Private browsing, or a full quota. Losing the persistence is not worth
      // an error dialog — but then the draft must be KEPT rather than cleared,
      // or the selection would silently revert on close.
      setOpen(false);
      return;
    }
    // Cleared, so the view follows the saved value from here on.
    setDraftOverride(null);
    setOpen(false);
  }, [draft]);

  const cancel = useCallback(() => {
    // Dropping the override reverts to what is saved, so closing without
    // saving really does discard.
    setDraftOverride(null);
    setOpen(false);
  }, []);

  const onDownload = useCallback(async () => {
    if (!logged) {
      try {
        await fetch("/api/resume/log", { method: "POST" });
        setLogged(true);
      } catch {
        // Never block the download on telemetry.
      }
    }
    window.print();
  }, [logged]);

  const allSkills = useMemo(() => orderSkillLine(skillLine, new Set()), [skillLine]);

  return (
    <>
      {/* ---------------------------------------------------------- controls */}
      <div className="mb-8 print:hidden">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onDownload}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-on-accent transition-opacity hover:opacity-90"
          >
            Download PDF
          </button>
          <button
            type="button"
            onClick={() => (open ? cancel() : setOpen(true))}
            aria-expanded={open}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-surface-raised"
          >
            {open ? "Cancel" : "Tailor to a skill set"}
          </button>
          {saved.length > 0 && !open ? (
            <span className="font-mono text-[11px] text-accent">
              tailored · {saved.length} skill{saved.length === 1 ? "" : "s"}
              {filtered.hidden > 0 ? ` · ${filtered.hidden} of ${filtered.total} entries hidden` : ""}
            </span>
          ) : null}
          {saved.length === 0 && !open ? (
            <span className="text-xs text-text-faint">
              Opens your browser’s print dialog — choose “Save as PDF”.
            </span>
          ) : null}
        </div>

        {open ? (
          <div className="mt-4 rounded-md border border-border bg-surface p-4">
            <h2 className="font-mono text-[11px] uppercase tracking-wider text-text-faint">
              tailor this resume
            </h2>
            <p className="mt-1 text-xs text-text-muted">
              Pick a preset, or toggle individual skills. Entries that mention none of them are
              hidden — <strong>except</strong> entries with no skills listed, which are always kept,
              because an untagged role should not vanish from a resume.
            </p>

            {/* Presets, derived from the tool categories that have evidence. */}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {presets.map((preset) => {
                const active = activePreset === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setDraft(preset.skills)}
                    aria-pressed={active}
                    className={[
                      "rounded-sm border px-2 py-1 font-mono text-[11px] transition-colors",
                      active
                        ? "border-accent bg-accent/15 text-text"
                        : "border-border text-text-muted hover:bg-surface-raised",
                    ].join(" ")}
                  >
                    {preset.label}
                    {preset.skills.length > 0 ? (
                      <span className="ml-1 text-text-faint">{preset.skills.length}</span>
                    ) : null}
                  </button>
                );
              })}
              {activePreset === "custom" ? (
                <span className="rounded-sm border border-accent bg-accent/15 px-2 py-1 font-mono text-[11px]">
                  custom {draft.length}
                </span>
              ) : null}
            </div>

            {allSkills.length > 0 ? (
              <>
                <h3 className="mt-4 font-mono text-[11px] uppercase tracking-wider text-text-faint">
                  skills
                </h3>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {allSkills.map((skill) => {
                    const on = draftSet.has(skill);
                    return (
                      <button
                        key={skill}
                        type="button"
                        // Built from the RESOLVED draft rather than the
                        // updater's previous value: the override starts as
                        // null (meaning "same as saved"), so `prev` would be
                        // null on the first toggle.
                        onClick={() =>
                          setDraft(
                            draft.includes(skill)
                              ? draft.filter((s) => s !== skill)
                              : [...draft, skill],
                          )
                        }
                        aria-pressed={on}
                        className={[
                          "rounded-sm border px-2 py-0.5 text-[11px] transition-colors",
                          on
                            ? "border-accent bg-accent/15 text-text"
                            : "border-border text-text-muted hover:bg-surface-raised",
                        ].join(" ")}
                      >
                        {skill}
                      </button>
                    );
                  })}
                </div>
              </>
            ) : null}

            {/* Said plainly, because a filtered resume that does not say it is
                filtered is how you send out the wrong one. */}
            <p className="mt-4 text-xs text-text-muted">
              {draft.length === 0
                ? "No filter — the full resume."
                : `Showing ${filtered.roles.length} of ${roles.length} roles, ${filtered.projects.length} of ${projects.length} projects, ${filtered.certifications.length} of ${certifications.length} certifications.`}
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={saveAndClose}
                className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-on-accent transition-opacity hover:opacity-90"
              >
                Save and close
              </button>
              <button
                type="button"
                onClick={cancel}
                className="rounded-md border border-border px-3 py-1.5 text-sm transition-colors hover:bg-surface-raised"
              >
                Cancel
              </button>
              {draft.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setDraft([])}
                  className="rounded-md px-2 py-1.5 text-xs text-text-faint transition-colors hover:text-text"
                >
                  Clear
                </button>
              ) : null}
              <span className="font-mono text-[11px] text-text-faint">
                saved in this browser only — nothing is uploaded
              </span>
            </div>
          </div>
        ) : null}
      </div>

      {/* ------------------------------------------------------- the resume */}
      <article className="resume space-y-7">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">{profile.name}</h1>
          <p className="mt-1 text-sm text-text-muted">{profile.tagline}</p>
          <p className="mt-2 font-mono text-[11px] text-text-faint">
            {profile.contact.join(" · ")}
          </p>
        </header>

        {profile.bio ? (
          <section>
            <h2 className="resume-h2">Summary</h2>
            <p className="mt-1 text-sm">{profile.bio}</p>
          </section>
        ) : null}

        {orderedSkills.length > 0 ? (
          <section>
            <h2 className="resume-h2">Skills</h2>
            {/* Reordered, not filtered: you do still know the others, and
                dropping them would be a lie by omission. */}
            <p className="mt-1 text-sm">{orderedSkills.join(" · ")}</p>
          </section>
        ) : null}

        {filtered.roles.length > 0 ? (
          <section>
            <h2 className="resume-h2">Experience</h2>
            <ul className="mt-2 space-y-4">
              {byRecencyDesc(filtered.roles).map((r, i) => (
                <li key={`${r.company}-${i}`} className="break-inside-avoid">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <h3 className="text-sm font-medium">
                      {r.role} · {r.company}
                    </h3>
                    <span className="font-mono text-[11px] text-text-faint">
                      {formatPartialDate(r.startDate)}
                      {r.endDate ? ` — ${formatPartialDate(r.endDate)}` : " — present"}
                    </span>
                  </div>
                  {r.summary ? <p className="mt-1 text-sm">{r.summary}</p> : null}
                  {r.highlights && r.highlights.length > 0 ? (
                    <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-text-muted">
                      {r.highlights.map((h) => (
                        <li key={h}>{h}</li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {filtered.projects.length > 0 ? (
          <section>
            <h2 className="resume-h2">Projects</h2>
            <ul className="mt-2 space-y-3">
              {filtered.projects.map((p) => (
                <li key={p.title} className="break-inside-avoid">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <h3 className="text-sm font-medium">{p.title}</h3>
                    {p.period ? (
                      <span className="font-mono text-[11px] text-text-faint">{p.period}</span>
                    ) : null}
                  </div>
                  {p.summary ? <p className="mt-0.5 text-sm">{p.summary}</p> : null}
                  {p.skills && p.skills.length > 0 ? (
                    <p className="mt-0.5 font-mono text-[11px] text-text-faint">
                      {p.skills.join(" · ")}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {filtered.certifications.length > 0 ? (
          <section>
            <h2 className="resume-h2">Certifications</h2>
            <ul className="mt-2 space-y-1.5">
              {byRecencyDesc(filtered.certifications).map((c, i) => (
                <li
                  key={`${c.title}-${i}`}
                  className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm"
                >
                  <span>
                    {c.title} <span className="text-text-muted">· {c.issuer}</span>
                  </span>
                  <span className="font-mono text-[11px] text-text-faint">
                    {formatPartialDate(c.issuedAt)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* 🛑 Only when a filter is active AND something was hidden. A resume
            that has been narrowed should say so on the page — including in the
            print output, which is why this is not `print:hidden`. */}
        {shown.size > 0 && filtered.hidden > 0 ? (
          <p className="font-mono text-[10px] text-text-faint">
            Tailored to {[...shown].join(", ")} — {filtered.hidden} further{" "}
            {filtered.hidden === 1 ? "entry" : "entries"} omitted.
          </p>
        ) : null}
      </article>
    </>
  );
}
