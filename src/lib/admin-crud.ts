import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getDb, toPlain, buildSearchTokens } from "@/lib/firestore";
import { getResource, isResourceKey, type ResourceKey } from "@/lib/resources";
import { ForbiddenError, UnauthorizedError, requireAdmin, type SessionUser } from "@/lib/session";

/**
 * Shared machinery for the admin CRUD routes.
 *
 * One implementation serves every resource in the registry, so list, create,
 * update, archive and delete behave identically across collections instead of
 * ten near-copies drifting apart.
 */

export function errorResponse(error: unknown): NextResponse {
  if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
    return NextResponse.json({ success: false, error: error.message }, { status: error.status });
  }
  console.error("[admin]", error);
  return NextResponse.json({ success: false, error: "Request failed" }, { status: 500 });
}

/** Resolve and validate the :resource path segment. */
export function resolveResource(raw: string): ResourceKey {
  if (!isResourceKey(raw)) throw new ForbiddenError(`Unknown resource "${raw}"`);
  return raw;
}

/** Fields the server owns. A client must never be able to set these. */
function auditFields(user: SessionUser, creating: boolean) {
  const now = new Date().toISOString();
  return creating
    ? { createdAt: now, createdBy: user.uid, updatedAt: now, updatedBy: user.uid }
    : { updatedAt: now, updatedBy: user.uid };
}

/**
 * Append an audit entry.
 *
 * Fire-and-forget on purpose: an audit write failing must not roll back the
 * mutation the admin actually asked for, but it must still be visible, so the
 * failure is logged rather than swallowed.
 */
function recordAudit(
  user: SessionUser,
  action: string,
  resource: string,
  docId: string,
  before: unknown,
  after: unknown,
): void {
  void getDb()
    .collection("auditLog")
    .add({
      at: new Date().toISOString(),
      actorUid: user.uid,
      actorEmail: user.email,
      action,
      resource,
      docId,
      before: before ?? null,
      after: after ?? null,
    })
    .catch((err) => console.error("[admin] audit write failed", { action, resource, docId, err }));
}

export interface ListQuery {
  page: number;
  pageSize: number;
  status?: string;
  q?: string;
}

export function parseListQuery(url: URL): ListQuery {
  const num = (key: string, fallback: number, max: number) => {
    const raw = Number(url.searchParams.get(key));
    return Number.isFinite(raw) && raw > 0 ? Math.min(raw, max) : fallback;
  };
  return {
    page: num("page", 1, 10_000),
    // Capped so a crafted pageSize cannot pull an entire collection in one read.
    pageSize: num("pageSize", 25, 100),
    status: url.searchParams.get("status") ?? undefined,
    q: url.searchParams.get("q")?.trim().toLowerCase() || undefined,
  };
}

export async function listDocuments(key: ResourceKey, query: ListQuery) {
  const def = getResource(key);
  let ref = getDb().collection(def.collection) as FirebaseFirestore.Query;

  if (query.status) ref = ref.where("status", "==", query.status);
  if (query.q) ref = ref.where("searchTokens", "array-contains", query.q);

  /*
   * Ordering is skipped while searching. Firestore cannot combine
   * array-contains with an orderBy on a different field without a composite
   * index per resource, and silently dropping the filter would be worse than
   * returning unsorted matches.
   */
  if (!query.q) ref = ref.orderBy(def.orderBy.field, def.orderBy.direction);

  const total = (await ref.count().get()).data().count;
  const snap = await ref
    .offset((query.page - 1) * query.pageSize)
    .limit(query.pageSize)
    .get();

  return {
    items: snap.docs.map((d) => toPlain(d.id, d.data())),
    meta: {
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      sorted: !query.q,
    },
  };
}

export async function createDocument(key: ResourceKey, body: unknown) {
  const user = await requireAdmin();
  const def = getResource(key);
  const parsed = def.schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const data = parsed.data as Record<string, unknown>;
  const col = getDb().collection(def.collection);

  // Slug is the human-facing identifier and must stay unique per collection.
  const clash = await col.where("slug", "==", data.slug).limit(1).get();
  if (!clash.empty) {
    return NextResponse.json(
      { success: false, error: `slug "${String(data.slug)}" is already used in ${def.collection}` },
      { status: 409 },
    );
  }

  const doc = {
    ...data,
    searchTokens: buildSearchTokens(...def.searchFields.map((f) => stringify(data[f]))),
    ...auditFields(user, true),
  };
  const ref = await col.add(doc);
  recordAudit(user, "create", def.collection, ref.id, null, doc);

  return NextResponse.json({ success: true, data: toPlain(ref.id, doc) }, { status: 201 });
}

export async function updateDocument(key: ResourceKey, id: string, body: unknown) {
  const user = await requireAdmin();
  const def = getResource(key);

  // Partial update: validate only the fields actually supplied.
  const partial = (def.schema as unknown as { partial(): typeof def.schema }).partial();
  const parsed = partial.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const ref = getDb().collection(def.collection).doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }

  const before = snap.data() ?? {};
  const data = parsed.data as Record<string, unknown>;
  const merged = { ...before, ...data };

  const patch = {
    ...data,
    searchTokens: buildSearchTokens(...def.searchFields.map((f) => stringify(merged[f]))),
    ...auditFields(user, false),
  };

  await ref.update(patch);
  recordAudit(user, "update", def.collection, id, before, patch);

  return NextResponse.json({ success: true, data: toPlain(id, merged) });
}

/**
 * Delete.
 *
 * Archive is the default and a hard delete must be asked for explicitly
 * (`?hard=true`): an accidental click in a list view should be recoverable.
 */
export async function deleteDocument(key: ResourceKey, id: string, hard: boolean) {
  const user = await requireAdmin();
  const def = getResource(key);
  const ref = getDb().collection(def.collection).doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }
  const before = snap.data() ?? {};

  if (hard) {
    await ref.delete();
    recordAudit(user, "delete", def.collection, id, before, null);
    return NextResponse.json({ success: true, data: { id, deleted: true } });
  }

  await ref.update({ status: "archived", ...auditFields(user, false) });
  recordAudit(user, "archive", def.collection, id, before, { status: "archived" });
  return NextResponse.json({ success: true, data: { id, status: "archived" } });
}

/** Bulk status change or delete over selected rows. */
export async function bulkAction(key: ResourceKey, action: string, ids: string[]) {
  const user = await requireAdmin();
  const def = getResource(key);

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ success: false, error: "No ids supplied" }, { status: 400 });
  }
  // Firestore caps a batch at 500 writes.
  if (ids.length > 500) {
    return NextResponse.json({ success: false, error: "At most 500 rows per bulk action" }, { status: 400 });
  }

  const allowed = ["publish", "draft", "archive", "delete", "feature", "unfeature"];
  if (!allowed.includes(action)) {
    return NextResponse.json(
      { success: false, error: `Unknown action "${action}" (expected: ${allowed.join(", ")})` },
      { status: 400 },
    );
  }

  const db = getDb();
  const batch = db.batch();
  const audit = auditFields(user, false);

  for (const id of ids) {
    const ref = db.collection(def.collection).doc(id);
    if (action === "delete") batch.delete(ref);
    else if (action === "feature") batch.update(ref, { isFeatured: true, ...audit });
    else if (action === "unfeature") batch.update(ref, { isFeatured: false, ...audit });
    else {
      const status = action === "publish" ? "published" : action === "draft" ? "draft" : "archived";
      batch.update(ref, { status, ...audit });
    }
  }

  await batch.commit();
  recordAudit(user, `bulk:${action}`, def.collection, `${ids.length} rows`, { ids }, null);

  return NextResponse.json({ success: true, data: { action, affected: ids.length } });
}

/** Persist a new manual ordering. */
export async function reorder(key: ResourceKey, order: Array<{ id: string; sortOrder: number }>) {
  const user = await requireAdmin();
  const def = getResource(key);
  if (!Array.isArray(order) || order.length === 0) {
    return NextResponse.json({ success: false, error: "No order supplied" }, { status: 400 });
  }
  if (order.length > 500) {
    return NextResponse.json({ success: false, error: "At most 500 rows per reorder" }, { status: 400 });
  }

  const db = getDb();
  const batch = db.batch();
  for (const { id, sortOrder } of order) {
    batch.update(db.collection(def.collection).doc(id), {
      sortOrder,
      updatedAt: new Date().toISOString(),
      updatedBy: user.uid,
    });
  }
  await batch.commit();
  recordAudit(user, "reorder", def.collection, `${order.length} rows`, null, { order });

  return NextResponse.json({ success: true, data: { reordered: order.length } });
}

function stringify(value: unknown): string {
  if (Array.isArray(value)) return value.join(" ");
  return value == null ? "" : String(value);
}

export { FieldValue };
