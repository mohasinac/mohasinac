import "server-only";

import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getAdminApp } from "@/lib/firebase-admin";

/**
 * Firestore access — SERVER ONLY.
 *
 * `firestore.rules` denies every client read and write, so this is the only
 * path to the data. The Admin SDK bypasses rules by design, which means the
 * authorisation decision has already been made by the caller: a route must
 * have gone through `requireUser`/`requireAdmin` before reaching here.
 */

let db: Firestore | null = null;

export function getDb(): Firestore {
  if (db) return db;
  const instance = getFirestore(getAdminApp());

  /*
   * 🛑 `settings()` may only be called once per Firestore instance, and only
   * before any other method on it. This module memoises, but the memo is
   * per-module-instance — and Next's build spins up several workers, each of
   * which can hand back an instance that something else already touched.
   *
   * It threw during `next build` and, because every caller catches and falls
   * back to bundled content, the blog silently served nothing while the build
   * reported success. That is the invisible-failure mode this codebase has
   * already been bitten by, so the throw is absorbed here rather than taking
   * out the read.
   *
   * Swallowing it is safe: the only reason it throws is that the instance is
   * already configured, and `ignoreUndefinedProperties` is set identically
   * everywhere it is set.
   */
  try {
    // Undefined is a normal shape for an optional field in a partial update;
    // without this Firestore throws instead of simply omitting it.
    instance.settings({ ignoreUndefinedProperties: true });
  } catch {
    // Already configured by an earlier caller — nothing to do.
  }

  db = instance;
  return db;
}

/** A Firestore timestamp, a JS Date or an ISO string, normalised to ISO. */
function toIso(value: unknown): unknown {
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return (value as { toDate(): Date }).toDate().toISOString();
  }
  return value;
}

/**
 * Convert a document to a plain JSON-safe object.
 *
 * Timestamps must be flattened here: a Firestore Timestamp cannot cross the
 * server/client component boundary and fails with an opaque serialisation
 * error well away from the read that produced it.
 */
export function toPlain<T extends Record<string, unknown>>(
  id: string,
  data: Record<string, unknown>,
): T & { id: string } {
  const out: Record<string, unknown> = { id };
  for (const [k, v] of Object.entries(data)) {
    out[k] = Array.isArray(v) ? v.map(toIso) : toIso(v);
  }
  return out as T & { id: string };
}

/** Build the normalised search tokens used for prefix matching in list views. */
export function buildSearchTokens(...parts: Array<string | undefined | null>): string[] {
  const text = parts.filter(Boolean).join(" ").toLowerCase();
  const words = text
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1);
  const tokens = new Set<string>();
  for (const w of words) {
    // Edge n-grams, capped: "stack" -> st, sta, stac, stack. Without a cap a
    // long slug would blow past Firestore's 1500-byte index entry limit.
    for (let i = 2; i <= Math.min(w.length, 20); i++) tokens.add(w.slice(0, i));
  }
  return [...tokens].slice(0, 120);
}
