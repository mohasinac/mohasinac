import "server-only";

import { NextResponse } from "next/server";
import {
  createDocument,
  errorResponse,
  listDocuments,
  parseListQuery,
  resolveResource,
} from "@/lib/admin-crud";
import { requireAdmin } from "@/lib/session";

/**
 * Generic admin collection endpoint.
 *
 *   GET  /api/admin/:resource   list (filter, search, paginate)
 *   POST /api/admin/:resource   create
 *
 * Both require the admin role, checked server-side here — the middleware gate
 * only tests that a cookie exists and cannot verify it.
 */

export async function GET(
  request: Request,
  { params }: { params: Promise<{ resource: string }> },
): Promise<NextResponse> {
  try {
    await requireAdmin();
    const key = resolveResource((await params).resource);
    const result = await listDocuments(key, parseListQuery(new URL(request.url)));
    const response = NextResponse.json({ success: true, ...result });
    // Admin listings are per-user and must never be cached by the CDN.
    response.headers.set("Cache-Control", "no-store, private");
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ resource: string }> },
): Promise<NextResponse> {
  try {
    const key = resolveResource((await params).resource);
    const body = await request.json().catch(() => null);
    if (body === null) {
      return NextResponse.json({ success: false, error: "Malformed JSON body" }, { status: 400 });
    }
    return await createDocument(key, body);
  } catch (error) {
    return errorResponse(error);
  }
}
