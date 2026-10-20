import "server-only";

import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";

/**
 * Who am I? Returns the verified session user, or `null` when signed out.
 *
 * Deliberately 200-with-null rather than 401 for the signed-out case: this is
 * the endpoint a client calls to *discover* its state, and a 401 would make
 * every anonymous page load log a console error.
 */
export async function GET(): Promise<NextResponse> {
  const user = await getSessionUser();

  const response = NextResponse.json({ success: true, data: { user } });
  // Per-user content. `private` keeps it out of the shared CDN cache — caching
  // this publicly would serve one visitor's identity to the next.
  response.headers.set("Cache-Control", "no-store, private");
  return response;
}
