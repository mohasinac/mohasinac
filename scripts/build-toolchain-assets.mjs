#!/usr/bin/env node
/**
 * Prebuild step: stage the in-browser C++ toolchain into `public/toolchain/<v>/`.
 *
 * Copies clang's wasm + WASI sysroot out of node_modules and builds the
 * `bits/stdc++.h` precompiled header, so the browser never pays for either.
 * Everything is served same-origin, which keeps CSP at `connect-src 'self'`.
 *
 * Measured in the Phase 0 spike (scratchpad/cpp-wasm-spike/SPIKE-RESULTS.md):
 *   - without the PCH a warm compile takes 4.9 s; with it, 1.1 s
 *   - the PCH costs 9.9 MB brotli and ~20 s to build, paid here once at build
 *     time instead of once per visitor
 *
 * Idempotent: exits early if the manifest for this toolchain version already
 * exists, unless --force is passed.
 */
import { createRequire } from "node:module";
import { mkdirSync, copyFileSync, writeFileSync, readFileSync, existsSync, rmSync, statSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FORCE = process.argv.includes("--force");

/**
 * The GCC catch-all header. libc++ does not ship one and competitive
 * programmers type it reflexively, so the sandbox supplies it.
 *
 * 🛑 Keep in sync with the PCH. The PCH is a serialised AST of exactly these
 * headers; adding one here without rebuilding the PCH means the new header is
 * re-parsed from source on every compile, silently costing ~4 s.
 */
const BITS_STDCXX = `#pragma once
// Shim for GCC's <bits/stdc++.h>, which libc++ does not provide.
#include <algorithm>
#include <array>
#include <bitset>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <deque>
#include <functional>
#include <iomanip>
#include <iostream>
#include <limits>
#include <map>
#include <numeric>
#include <queue>
#include <set>
#include <sstream>
#include <stack>
#include <string>
#include <tuple>
#include <unordered_map>
#include <unordered_set>
#include <utility>
#include <vector>
`;

/**
 * 🛑 The ONE canonical flag set, pinned here and consumed by the sandbox.
 *
 * A PCH is rejected unless the consuming compile passes identical flags
 * ("OptimizationLevel differs in precompiled file"), so -O is not a
 * user-facing knob.
 *
 * -fno-exceptions is not a preference either: the bundled libc++abi.a was
 * built without exceptions (an nm scan finds no __cxa_throw /
 * __cxa_allocate_exception), so default -fexceptions always fails at link and
 * -fwasm-exceptions fails too. Verified in the Phase 0 spike.
 */
const CXX_FLAGS = ["-std=c++20", "-O2", "-fno-exceptions"];

// `@yowasp/clang`'s exports map declares only "types" and "default", so
// require("@yowasp/clang/package.json") throws ERR_PACKAGE_PATH_NOT_EXPORTED.
// Resolve the entry point and read the manifest off disk instead.
const entry = require.resolve("@yowasp/clang"); // .../@yowasp/clang/gen/bundle.js
const GEN_DIR = dirname(entry);
const PKG_DIR = dirname(GEN_DIR);
const version = JSON.parse(readFileSync(join(PKG_DIR, "package.json"), "utf8")).version;

const OUT_DIR = join(ROOT, "public", "toolchain", version);
const MANIFEST = join(OUT_DIR, "manifest.json");

if (existsSync(MANIFEST) && !FORCE) {
  console.log(`[toolchain] ${version} already staged — nothing to do (use --force to rebuild).`);
  process.exit(0);
}

console.log(`[toolchain] staging clang ${version} -> public/toolchain/${version}/`);
if (FORCE && existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

// ---- 1. copy the toolchain binaries ---------------------------------------
// bundle.js locates its siblings via import.meta.url, so the whole gen/ set
// must land in one directory together.
const copied = [];
for (const name of [
  "bundle.js",
  "llvm-resources.tar",
  "llvm.core.wasm",
  "llvm.core2.wasm",
  "llvm.core3.wasm",
  "llvm.core4.wasm",
]) {
  const src = join(GEN_DIR, name);
  if (!existsSync(src)) {
    console.error(`[toolchain] FATAL: expected asset missing from the package: ${name}`);
    process.exit(1);
  }
  copyFileSync(src, join(OUT_DIR, name));
  copied.push({ name, bytes: statSync(src).size });
}

// ---- 2. the bits/stdc++.h shim --------------------------------------------
writeFileSync(join(OUT_DIR, "stdc++.h"), BITS_STDCXX);
copied.push({ name: "stdc++.h", bytes: Buffer.byteLength(BITS_STDCXX) });

// ---- 3. build the precompiled header --------------------------------------
const { runClang } = await import("@yowasp/clang");
const t0 = Date.now();
let stderr = "";
let pch;
try {
  const out = await runClang(
    ["clang++", ...CXX_FLAGS, "-x", "c++-header", "bits/stdc++.h", "-o", "stdcxx.pch"],
    { bits: { "stdc++.h": BITS_STDCXX } },
    { stderr: (b) => { if (b) stderr += new TextDecoder().decode(b); } },
  );
  pch = out["stdcxx.pch"];
} catch (err) {
  console.error(`[toolchain] FATAL: PCH build exited ${err?.code ?? "?"}\n${stderr}`);
  process.exit(1);
}
if (!pch) {
  console.error(`[toolchain] FATAL: PCH build produced no output\n${stderr}`);
  process.exit(1);
}
writeFileSync(join(OUT_DIR, "stdcxx.pch"), pch);
copied.push({ name: "stdcxx.pch", bytes: pch.length });
console.log(`[toolchain] PCH built in ${((Date.now() - t0) / 1000).toFixed(1)}s (${pch.length} bytes)`);

// ---- 4. manifest the client reads -----------------------------------------
// The client never hardcodes a version: it fetches /toolchain/current.json,
// which points at this directory. That makes a toolchain upgrade a one-file
// change and keeps the versioned paths immutably cacheable.
const manifest = {
  version,
  flags: CXX_FLAGS,
  base: `/toolchain/${version}`,
  files: copied.sort((a, b) => b.bytes - a.bytes),
  totalBytes: copied.reduce((s, f) => s + f.bytes, 0),
  builtAt: new Date().toISOString(),
};
writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
writeFileSync(
  join(ROOT, "public", "toolchain", "current.json"),
  JSON.stringify({ version, manifest: `/toolchain/${version}/manifest.json` }, null, 2),
);

const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;
console.log(`[toolchain] staged ${copied.length} files, ${mb(manifest.totalBytes)} raw`);
console.log(`[toolchain] (~30 MB over the wire once brotli-compressed by the CDN)`);
