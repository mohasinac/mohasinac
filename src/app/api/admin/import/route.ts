import "server-only";

import { NextResponse } from "next/server";
import { errorResponse, resolveResource } from "@/lib/admin-crud";
import { buildSearchTokens, getDb } from "@/lib/firestore";
import { getResource } from "@/lib/resources";
import { requireAdmin } from "@/lib/session";

/**
 * Bulk import — the practical escape from form fatigue.
 *
 *   POST /api/admin/import
 *   { resource: "problems", dryRun: true, items: [ … ] }
 *
 * Authoring 250 problems through a web form is not a realistic plan; this is.
 * Upserts by `slug`, so re-running the same payload corrects records instead of
 * duplicating them — which matters because an import is usually run more than
 * once while the data is still being cleaned up.
 *
 * `dryRun` is the default. An import that silently writes on the first attempt
 * is the wrong default for a tool whose whole purpose is bulk mutation.
 */

/** Firestore batches cap at 500 writes; stay under it with room for retries. */
const MAX_ITEMS = 400;

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const user = await requireAdmin();

    const body = (await request.json().catch(() => null)) as
      | { resource?: string; items?: unknown[]; dryRun?: boolean }
      | null;

    if (!body?.resource || !Array.isArray(body.items)) {
      return NextResponse.json(
        { success: false, error: "Expected { resource, items: [...] }" },
        { status: 400 },
      );
    }
    if (body.items.length === 0) {
      return NextResponse.json({ success: false, error: "items is empty" }, { status: 400 });
    }
    if (body.items.length > MAX_ITEMS) {
      return NextResponse.json(
        { success: false, error: `At most ${MAX_ITEMS} items per import (got ${body.items.length})` },
        { status: 400 },
      );
    }

    const key = resolveResource(body.resource);
    const def = getResource(key);
    // Opt IN to writing. Anything other than an explicit false stays a dry run.
    const dryRun = body.dryRun !== false;

    // ---- validate everything before writing anything ----------------------
    const valid: Array<Record<string, unknown>> = [];
    const invalid: Array<{ index: number; slug?: string; issues: unknown }> = [];

    body.items.forEach((item, index) => {
      const parsed = def.schema.safeParse(item);
      if (parsed.success) valid.push(parsed.data as Record<string, unknown>);
      else {
        invalid.push({
          index,
          slug: (item as { slug?: string })?.slug,
          issues: parsed.error.issues,
        });
      }
    });

    // A partially-valid import is almost always a malformed file rather than an
    // intent to import the good half, so refuse the whole payload and say why.
    if (invalid.length) {
      return NextResponse.json(
        {
          success: false,
          error: `${invalid.length} of ${body.items.length} items failed validation; nothing was written`,
          invalid: invalid.slice(0, 20),
        },
        { status: 400 },
      );
    }

    // Duplicate slugs inside the payload itself would make the upsert
    // order-dependent — last one silently wins.
    const seen = new Map<string, number>();
    const dupes: string[] = [];
    valid.forEach((item, i) => {
      const slug = String(item.slug);
      if (seen.has(slug)) dupes.push(slug);
      else seen.set(slug, i);
    });
    if (dupes.length) {
      return NextResponse.json(
        { success: false, error: `Duplicate slugs within the payload: ${[...new Set(dupes)].join(", ")}` },
        { status: 400 },
      );
    }

    // ---- work out what would change --------------------------------------
    const db = getDb();
    const col = db.collection(def.collection);
    const slugs = valid.map((v) => String(v.slug));

    const existing = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
    // `in` accepts at most 30 values per query, so chunk the lookup.
    for (let i = 0; i < slugs.length; i += 30) {
      const snap = await col.where("slug", "in", slugs.slice(i, i + 30)).get();
      snap.docs.forEach((d) => existing.set(String(d.data().slug), d));
    }

    const creates = valid.filter((v) => !existing.has(String(v.slug)));
    const updates = valid.filter((v) => existing.has(String(v.slug)));

    if (dryRun) {
      return NextResponse.json({
        success: true,
        dryRun: true,
        data: {
          resource: key,
          collection: def.collection,
          wouldCreate: creates.length,
          wouldUpdate: updates.length,
          createSlugs: creates.map((c) => c.slug).slice(0, 50),
          updateSlugs: updates.map((u) => u.slug).slice(0, 50),
        },
        message: "Nothing written. Re-send with dryRun:false to apply.",
      });
    }

    // ---- apply -------------------------------------------------------------
    const now = new Date().toISOString();
    const batch = db.batch();

    for (const item of valid) {
      const slug = String(item.slug);
      const tokens = buildSearchTokens(...def.searchFields.map((f) => stringify(item[f])));
      const found = existing.get(slug);

      if (found) {
        batch.update(found.ref, { ...item, searchTokens: tokens, updatedAt: now, updatedBy: user.uid });
      } else {
        batch.set(col.doc(), {
          ...item,
          searchTokens: tokens,
          createdAt: now,
          createdBy: user.uid,
          updatedAt: now,
          updatedBy: user.uid,
        });
      }
    }

    await batch.commit();

    void db
      .collection("auditLog")
      .add({
        at: now,
        actorUid: user.uid,
        actorEmail: user.email,
        action: "import",
        resource: def.collection,
        docId: `${valid.length} rows`,
        before: null,
        after: { created: creates.length, updated: updates.length },
      })
      .catch((err) => console.error("[admin] audit write failed for import", err));

    return NextResponse.json({
      success: true,
      dryRun: false,
      data: { resource: key, created: creates.length, updated: updates.length },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

function stringify(value: unknown): string {
  if (Array.isArray(value)) return value.join(" ");
  return value == null ? "" : String(value);
}
