import { notFound } from "next/navigation";
import { getDb, toPlain } from "@/lib/firestore";
import { RESOURCES, isResourceKey } from "@/lib/resources";
import { AdminResourceTable } from "@/components/admin/AdminResourceTable";

/**
 * Generic list view — one page component serves every resource in the
 * registry, so filtering, selection and bulk actions behave identically
 * everywhere rather than being reimplemented per collection.
 */
export default async function AdminResourcePage({
  params,
  searchParams,
}: {
  params: Promise<{ resource: string }>;
  searchParams: Promise<{ status?: string; q?: string; page?: string }>;
}) {
  const { resource } = await params;
  if (!isResourceKey(resource)) notFound();

  const def = RESOURCES[resource];
  const { status, q, page: rawPage } = await searchParams;
  const page = Math.max(1, Number(rawPage) || 1);
  const pageSize = 25;

  let ref = getDb().collection(def.collection) as FirebaseFirestore.Query;
  if (status) ref = ref.where("status", "==", status);
  if (q) ref = ref.where("searchTokens", "array-contains", q.toLowerCase());
  // See admin-crud.listDocuments: array-contains cannot be combined with an
  // orderBy on another field without a per-resource composite index.
  if (!q) ref = ref.orderBy(def.orderBy.field, def.orderBy.direction);

  let items: Array<Record<string, unknown> & { id: string }> = [];
  let total = 0;
  let failure: string | null = null;

  try {
    total = (await ref.count().get()).data().count;
    const snap = await ref.offset((page - 1) * pageSize).limit(pageSize).get();
    items = snap.docs.map((d) => toPlain(d.id, d.data()));
  } catch (error) {
    // Usually a missing composite index. Surface the real message — Firestore
    // includes a console link that creates the index in one click.
    failure = error instanceof Error ? error.message : String(error);
  }

  return (
    <AdminResourceTable
      resourceKey={resource}
      label={def.label}
      titleField={def.titleField}
      items={items}
      total={total}
      page={page}
      pageSize={pageSize}
      status={status ?? ""}
      query={q ?? ""}
      failure={failure}
    />
  );
}
