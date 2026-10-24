/**
 * Stage `az_trace.h` into `public/trace/` so the sandbox worker can fetch it.
 *
 * The header lives in TypeScript as a string constant — that is where the unit
 * tests and the toolchain verifier read it from — so this writes the SAME
 * source to disk rather than maintaining a second copy. Run from `prebuild`.
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src/packages/dsa/src/trace/az-trace-header.ts");
const OUT_DIR = join(ROOT, "public/trace");
const OUT = join(OUT_DIR, "az_trace.h");

const { AZ_TRACE_HEADER } = await import(pathToFileURL(SRC).href);

mkdirSync(OUT_DIR, { recursive: true });

// Idempotent: only write when the content actually differs, so a no-op build
// does not churn the file's mtime.
const existing = existsSync(OUT) ? readFileSync(OUT, "utf8") : null;
if (existing === AZ_TRACE_HEADER) {
  console.log("az_trace.h already staged and current");
} else {
  writeFileSync(OUT, AZ_TRACE_HEADER, "utf8");
  console.log(`staged az_trace.h (${AZ_TRACE_HEADER.length} bytes)`);
}
