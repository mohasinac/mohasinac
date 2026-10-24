import "server-only";

import { NextResponse } from "next/server";
import { deleteDocument, errorResponse, resolveResource, updateDocument } from "@/lib/admin-crud";
import { getDb, toPlain } from "@/lib/firestore";
import { getResource } from "@/lib/resources";
import { requireAdmin } from "@/lib/session";

/**
 * Single-document admin endpoint.
 *
 *   GET    /api/admin/:resource/:id
 *   PATCH  /api/admin/:resource/:id            partial update
 *   DELETE /api/admin/:resource/:id            archive (reversible)
 *   DELETE /api/admin/:resource/:id?hard=true  permanent
 */

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ resource: string; id: string }> },
): Promise<NextResponse> {
  try {
    await requireAdmin();
    const { resource, id } = await params;
    const def = getResource(resolveResource(resource));
    const snap = await getDb().collection(def.collection).doc(id).get();
    if (!snap.exists) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    const response = NextResponse.json({ success: true, data: toPlain(snap.id, snap.data() ?? {}) });
    response.headers.set("Cache-Control", "no-store, private");
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ resource: string; id: string }> },
): Promise<NextResponse> {
  try {
    const { resource, id } = await params;
    const key = resolveResource(resource);
    const body = await request.json().catch(() => null);
    if (body === null) {
      return NextResponse.json({ success: false, error: "Malformed JSON body" }, { status: 400 });
    }
    return await updateDocument(key, id, body);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ resource: string; id: string }> },
): Promise<NextResponse> {
  try {
    const { resource, id } = await params;
    const key = resolveResource(resource);
    // Hard delete must be opted into explicitly — archive is the default so a
    // misclick in a list view stays recoverable.
    const hard = new URL(request.url).searchParams.get("hard") === "true";
    return await deleteDocument(key, id, hard);
  } catch (error) {
    return errorResponse(error);
  }
}
