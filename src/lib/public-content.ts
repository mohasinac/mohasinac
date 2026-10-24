import "server-only";

import { getDb, toPlain } from "@/lib/firestore";
import { RESOURCES, type ResourceKey } from "@/lib/resources";

/**
 * Published-content reads for the public pages.
 *
 * Returns `null` — not an empty array — when a collection is unreachable or
 * genuinely empty, so callers can tell "nothing published yet" apart from
 * "Firestore is not answering" and fall back to the bundled content files
 * instead of rendering a blank page that looks like a bug.
 */

export interface PublicDoc {
  id: string;
  slug: string;
  [key: string]: unknown;
}

export async function listPublished(
  key: ResourceKey,
  { limit = 100 }: { limit?: number } = {},
): Promise<PublicDoc[] | null> {
  const def = RESOURCES[key];
  try {
    const snap = await getDb()
      .collection(def.collection)
      .where("status", "==", "published")
      .orderBy(def.orderBy.field, def.orderBy.direction)
      .limit(limit)
      .get();
    if (snap.empty) return null;
    return snap.docs.map((d) => toPlain<PublicDoc>(d.id, d.data()));
  } catch (error) {
    /*
     * Most often a missing composite index (status + orderBy field). A public
     * page must not 500 because an index has not been built yet, so log it and
     * let the caller fall back.
     */
    console.error(`[public-content] ${def.collection} read failed; falling back`, error);
    return null;
  }
}

export async function getPublishedBySlug(key: ResourceKey, slug: string): Promise<PublicDoc | null> {
  const def = RESOURCES[key];
  try {
    const snap = await getDb()
      .collection(def.collection)
      .where("slug", "==", slug)
      .where("status", "==", "published")
      .limit(1)
      .get();
    const doc = snap.docs[0];
    return doc ? toPlain<PublicDoc>(doc.id, doc.data()) : null;
  } catch (error) {
    console.error(`[public-content] ${def.collection}/${slug} read failed`, error);
    return null;
  }
}

/** Children of a parent, by the parent's slug (modules of a track, etc.). */
export async function listChildren(
  key: ResourceKey,
  parentField: string,
  parentSlug: string,
): Promise<PublicDoc[]> {
  const def = RESOURCES[key];
  try {
    const snap = await getDb()
      .collection(def.collection)
      .where(parentField, "==", parentSlug)
      .where("status", "==", "published")
      .get();
    return snap.docs
      .map((d) => toPlain<PublicDoc>(d.id, d.data()))
      // Sorted in memory: adding an orderBy to two equality filters needs yet
      // another composite index, and these sets are small by construction.
      .sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0));
  } catch (error) {
    console.error(`[public-content] children of ${parentSlug} failed`, error);
    return [];
  }
}
