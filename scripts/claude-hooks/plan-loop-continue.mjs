#!/usr/bin/env node
/**
 * plan-loop-continue — a Stop hook that refuses to let a session stop while it
 * has declared work left.
 *
 * Exit 2 BLOCKS the turn and feeds this script's **stderr** back to the
 * assistant as the instruction for what to do next. Exit 0 lets the turn end.
 *
 * ## 🛑 Three ways this kind of hook goes wrong. All three are designed out.
 *
 * ### 1. It writes to stdout and delivers nothing
 *
 * Exit 2 surfaces **stderr**, not stdout. Its sibling
 * `tester-loop-continue.mjs` used `console.log` for all five of its messages,
 * so for the entire life of that file every continuation blocked the turn and
 * handed the assistant NO instruction — and it looked like it was working,
 * because a blocked turn re-invokes regardless. Root Cause #97. Everything
 * here goes through `block()`, which is the only exit-2 path.
 *
 * ### 2. It fires in every session in the repo
 *
 * `.claude/settings.json` is committed and shared, so a Stop hook declared
 * there runs for EVERY Claude session in this checkout — including parallel
 * sessions working on something else entirely, and the user's own later
 * unrelated work. A hook that blocks on "is the todo list empty" would trap
 * all of them in a loop driven by one session's plan.
 *
 * 🛑 So this hook is OPT-IN and SESSION-SCOPED:
 *   - no state file            -> stand down (the default for every session)
 *   - state file for a DIFFERENT session id -> stand down
 * Only the session that armed it is ever blocked.
 *
 * ### 3. It cannot be escaped
 *
 * A loop with no stand-down is a hang. There are four, and each prints why:
 *   - `active: false`                  (the explicit off switch)
 *   - `tasks` empty                    (the work is done)
 *   - `continuations >= maxContinuations` (the hard cap)
 *   - a malformed/unreadable state file (fail OPEN, never trap)
 *
 * ## Arming it
 *
 *   node scripts/claude-hooks/plan-loop-continue.mjs --arm \
 *     --session <id> --max 25 --task "0d footer ownership" --task "0a toolbar"
 *
 * Disarm:  `--disarm`, or delete the state file, or set `active: false`.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const REPO = resolve(new URL("../..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const STATE = resolve(REPO, ".claude/plan-loop/state.json");

/** Hard ceiling regardless of what the state file asks for. */
const ABSOLUTE_MAX_CONTINUATIONS = 100;

// ── exits ────────────────────────────────────────────────────────────────────

/** Let the turn end. `reason` is operator-facing only, so stdout is correct. */
function standDown(reason) {
  if (reason) process.stdout.write(`[plan-loop] ${reason}\n`);
  process.exit(0);
}

/**
 * 🛑 THE ONLY EXIT-2 PATH, and it writes to STDERR.
 *
 * Centralised deliberately: the sibling hook had five separate emitters and
 * every one of them used the wrong stream. One function cannot drift from
 * itself, so a sixth message cannot reintroduce the bug.
 */
function block(message) {
  process.stderr.write(message.endsWith("\n") ? message : `${message}\n`);
  process.exit(2);
}

// ── state ────────────────────────────────────────────────────────────────────

function readState() {
  try {
    return JSON.parse(readFileSync(STATE, "utf8"));
  } catch {
    return null;
  }
}

function writeState(state) {
  mkdirSync(dirname(STATE), { recursive: true });
  writeFileSync(STATE, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

// ── arm / disarm (operator CLI, not the hook path) ───────────────────────────

const argv = process.argv.slice(2);

if (argv.includes("--disarm")) {
  const state = readState();
  if (!state) standDown("nothing to disarm.");
  writeState({ ...state, active: false });
  standDown("disarmed — the session may now stop.");
}

if (argv.includes("--arm")) {
  const valueOf = (flag) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const tasks = argv.reduce((acc, a, i) => {
    if (a === "--task" && argv[i + 1]) acc.push(argv[i + 1]);
    return acc;
  }, []);
  const max = Number(valueOf("--max") ?? 25);
  const sessionId = valueOf("--session") ?? "";

  if (!sessionId) {
    process.stderr.write(
      "[plan-loop] --session <id> is REQUIRED.\n" +
        "A state file with no session id would block every session in this repo,\n" +
        "which is the single thing this hook is designed not to do.\n",
    );
    process.exit(1);
  }
  if (!tasks.length) {
    process.stderr.write("[plan-loop] at least one --task is required.\n");
    process.exit(1);
  }

  writeState({
    active: true,
    sessionId,
    tasks,
    continuations: 0,
    maxContinuations: Math.min(max, ABSOLUTE_MAX_CONTINUATIONS),
    armedAt: new Date().toISOString(),
  });
  standDown(`armed for session ${sessionId}: ${tasks.length} task(s), max ${max} continuations.`);
}

// ── hook path ────────────────────────────────────────────────────────────────

/**
 * Claude Code sends the hook a JSON payload on stdin. `session_id` is what
 * makes the scoping possible; `stop_hook_active` is true when a previous fire
 * of THIS hook caused the current continuation.
 */
function readPayload() {
  try {
    const raw = readFileSync(0, "utf8");
    return raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

const payload = readPayload();
const state = readState();

// Default for every session in this repo: do nothing at all.
if (!state) standDown();
if (state.active !== true) standDown("inactive.");

/*
 * 🛑 THE SESSION GATE. Without it, one session's plan would hold every other
 * session in the checkout hostage — and this repo routinely has several at
 * once, which is why CLAUDE.md's parallel-session rules exist in the first
 * place.
 *
 * Fails OPEN on a missing session id in the payload: an unidentifiable session
 * is let go rather than trapped.
 */
const currentSession = String(payload.session_id ?? "");
if (!currentSession) standDown("no session id in the hook payload — standing down.");
if (currentSession !== String(state.sessionId)) {
  standDown(`armed for a different session (${state.sessionId}) — standing down.`);
}

const tasks = Array.isArray(state.tasks) ? state.tasks.filter(Boolean) : [];
if (!tasks.length) standDown("no tasks left — the work is done.");

const cap = Math.min(Number(state.maxContinuations ?? 25), ABSOLUTE_MAX_CONTINUATIONS);
const used = Number(state.continuations ?? 0);

if (used >= cap) {
  /*
   * Stand DOWN at the cap rather than blocking forever. A hook that can only
   * be escaped by killing the process is a hang, and the cap exists precisely
   * so a misjudged task list cannot become one.
   */
  standDown(
    `continuation cap reached (${used}/${cap}). Standing down so the session can stop. ` +
      `Raise maxContinuations in ${STATE} to keep going.`,
  );
}

writeState({ ...state, continuations: used + 1, lastContinuedAt: new Date().toISOString() });

const [next, ...rest] = tasks;

block(
  [
    `Do not stop — ${tasks.length} task(s) remain on the plan loop ` +
      `(continuation ${used + 1}/${cap}).`,
    "",
    `NEXT: ${next}`,
    rest.length ? `THEN: ${rest.map((t) => `\n  - ${t}`).join("")}` : "",
    "",
    "Work the NEXT item now. When an item is finished, remove it from `tasks` in",
    `${STATE} so this hook can tell real progress from a loop.`,
    "",
    "🛑 If the item is genuinely blocked, say so plainly and run",
    "`node scripts/claude-hooks/plan-loop-continue.mjs --disarm` rather than",
    "pretending it is done — a loop that is fed false completions is worse than",
    "one that stops.",
  ]
    .filter(Boolean)
    .join("\n"),
);
