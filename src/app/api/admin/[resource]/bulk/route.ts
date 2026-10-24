import "server-only";

import { NextResponse } from "next/server";
import { bulkAction, errorResponse, reorder, resolveResource } from "@/lib/admin-crud";

/**
 * Multi-row admin operations.
 *
 *   POST /api/admin/:resource/bulk
 *     { action: "publish"|"draft"|"archive"|"delete"|"feature"|"unfeature", ids: [...] }
 *     { action: "reorder", order: [{ id, sortOrder }, ...] }
 *
 * Both paths are batched, so a partial failure rolls the whole set back rather
 * than leaving half the selection in a new state.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ resource: string }> },
): Promise<NextResponse> {
  try {
    const key = resolveResource((await params).resource);
    const body = (await request.json().catch(() => null)) as
      | { action?: string; ids?: string[]; order?: Array<{ id: string; sortOrder: number }> }
      | null;

    if (!body?.action) {
      return NextResponse.json({ success: false, error: "action is required" }, { status: 400 });
    }

    if (body.action === "reorder") {
      return await reorder(key, body.order ?? []);
    }
    return await bulkAction(key, body.action, body.ids ?? []);
  } catch (error) {
    return errorResponse(error);
  }
}
