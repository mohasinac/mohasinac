import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AZ_TRACE_HEADER,
  AZ_CEILINGS,
  AZ_DEFAULTS,
  clampLimits,
  limitsPrelude,
} from "../src/trace/az-trace-header.ts";

/*
 * 🛑 This is the guard for a mistake I made three times: a backtick inside a
 * String.raw template literal terminates the string, and the rest of the C++ is
 * then parsed as TypeScript. It breaks tsc repo-wide, and the error points at a
 * line number with no obvious relationship to the cause.
 */
test("the C++ header contains no backtick or ${ sequence", () => {
  assert.ok(!AZ_TRACE_HEADER.includes("`"), "a backtick would terminate the String.raw literal");
  assert.ok(!AZ_TRACE_HEADER.includes("${"), "a ${ would interpolate even in String.raw");
});

test("the header declares the single if-constexpr entry point, not an overload set", () => {
  // An overload set is ambiguous for every type — "call to 'v' is ambiguous" —
  // so the shape of this function is load-bearing, not stylistic.
  assert.match(AZ_TRACE_HEADER, /template <class T>\s*\nvoid v\(const T& x\)/);
  assert.ok(AZ_TRACE_HEADER.includes("if constexpr"));
  // Exactly one definition of v(...).
  assert.equal((AZ_TRACE_HEADER.match(/^void v\(/gm) ?? []).length, 1);
});

test("it uses cstdio and never iostream", () => {
  // <iostream> would let the emitter perturb the learner's own stream state.
  assert.ok(AZ_TRACE_HEADER.includes("#include <cstdio>"));
  assert.ok(!AZ_TRACE_HEADER.includes("<iostream>"));
  assert.ok(!AZ_TRACE_HEADER.includes("std::cerr"));
});

test("it compiles under -fno-exceptions: no throw, try or catch", () => {
  assert.ok(!/\bthrow\b/.test(AZ_TRACE_HEADER));
  assert.ok(!/\btry\b/.test(AZ_TRACE_HEADER));
  assert.ok(!/\bcatch\b/.test(AZ_TRACE_HEADER));
});

test("frames are bracketed by 0x01 and terminated by a newline", () => {
  // Both halves matter: lineBuffered drops an unterminated final line, and the
  // learner's own stderr may be mid-line when a frame is emitted.
  // The header is a String.raw literal, so it holds the four characters
  // backslash-x-0-1 literally rather than one control byte.
  const BACKSLASH = String.fromCharCode(92);
  assert.ok(AZ_TRACE_HEADER.includes(`SOH = '${BACKSLASH}x01'`));
  assert.ok(AZ_TRACE_HEADER.includes(`put('${BACKSLASH}n')`));
});

test("every control byte is escaped, so a record can never contain a raw 0x01", () => {
  // This is what keeps 0x01 usable as the delimiter.
  assert.match(AZ_TRACE_HEADER, /\(unsigned char\)c < 0x20/);
  assert.ok(AZ_TRACE_HEADER.includes("\\u%04x"));
});

test("caps have #ifndef defaults so the header is usable without a prelude", () => {
  for (const name of [
    "AZ_MAX_STEPS",
    "AZ_MAX_LOOP",
    "AZ_MAX_DEPTH",
    "AZ_MAX_ELEMS",
    "AZ_MAX_CHARS",
    "AZ_SITES",
  ]) {
    assert.ok(AZ_TRACE_HEADER.includes(`#ifndef ${name}`), `${name} has no default`);
  }
});

test("clampLimits falls back on garbage and never exceeds a ceiling", () => {
  assert.deepEqual(clampLimits(undefined), AZ_DEFAULTS);
  assert.deepEqual(clampLimits({}), AZ_DEFAULTS);
  assert.equal(clampLimits({ maxSteps: 0 }).maxSteps, AZ_DEFAULTS.maxSteps);
  assert.equal(clampLimits({ maxSteps: -5 }).maxSteps, AZ_DEFAULTS.maxSteps);
  assert.equal(clampLimits({ maxSteps: NaN }).maxSteps, AZ_DEFAULTS.maxSteps);
  // The ceiling exists because the run is synchronous: an unbounded trace
  // hangs the worker until the 30 s watchdog.
  assert.equal(clampLimits({ maxSteps: 1_000_000 }).maxSteps, AZ_CEILINGS.maxSteps);
  assert.equal(clampLimits({ maxLoopIterations: 9999 }).maxLoopIterations, AZ_CEILINGS.maxLoopIterations);
});

test("a raised cap is honoured below the ceiling", () => {
  assert.equal(clampLimits({ maxSteps: 2000 }).maxSteps, 2000);
});

test("the prelude defines every cap and includes the header", () => {
  const p = limitsPrelude(clampLimits({ maxSteps: 123 }), 7);
  assert.match(p, /#define AZ_MAX_STEPS 123/);
  assert.match(p, /#define AZ_SITES 7/);
  assert.match(p, /#include "az_trace\.h"/);
  // Realigns compiler line numbers after the prelude's own lines.
  assert.match(p, /#line 1/);
  // 🛑 No -D anywhere: the preprocessor state is part of the PCH hash, so a
  // command-line define is the classic PCH-mismatch trigger.
  assert.ok(!p.includes("-D"));
});

test("AZ_SITES is at least 1, so the counter array is never zero-length", () => {
  assert.match(limitsPrelude(AZ_DEFAULTS, 0), /#define AZ_SITES 1/);
});
