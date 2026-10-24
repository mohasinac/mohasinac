import "server-only";

import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/firestore";
import { requireUser } from "@/lib/session";
import { errorResponse } from "@/lib/admin-crud";

/**
 * Record a submission and return a verdict.
 *
 * Execution happens in the browser, so the client reports what its program
 * printed. To keep the answers off the client, hidden test cases store only a
 * SHA-256 of the expected output: the client receives the inputs, runs them,
 * and posts back a hash per case, which the server compares.
 *
 * 🛑 Known and accepted limitation of the browser-only design: the verdict is
 * still client-reported, so a determined user can forge an "accepted". What
 * this prevents is reading the expected answers, which is the part that would
 * make the exercise pointless. Authoritative judging needs a server runner —
 * the CodeRunner seam exists for exactly that.
 */

const BodySchema = z.object({
  problemSlug: z.string().min(1).max(120),
  // Capped to match the sandbox's own source limit.
  source: z.string().max(64 * 1024),
  results: z
    .array(
      z.object({
        caseId: z.string().min(1).max(120),
        outputHash: z.string().regex(/^[a-f0-9]{64}$/, "expected a sha256 hex digest"),
        runMs: z.number().min(0).max(600_000).optional(),
      }),
    )
    .max(200),
  compileMs: z.number().min(0).max(600_000).optional(),
});

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const user = await requireUser();

    const body = await request.json().catch(() => null);
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Invalid submission", issues: parsed.error.issues },
        { status: 400 },
      );
    }
    const { problemSlug, source, results, compileMs } = parsed.data;

    const db = getDb();

    // Per-user daily cap. Cheap abuse control on a route that writes.
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const recent = await db
      .collection("submissions")
      .where("uid", "==", user.uid)
      .where("at", ">=", since)
      .count()
      .get();
    if (recent.data().count >= 500) {
      return NextResponse.json(
        { success: false, error: "Daily submission limit reached. Try again tomorrow." },
        { status: 429 },
      );
    }

    const problemSnap = await db
      .collection("problems")
      .where("slug", "==", problemSlug)
      .limit(1)
      .get();
    const problem = problemSnap.docs[0];
    if (!problem) {
      return NextResponse.json({ success: false, error: "Unknown problem" }, { status: 404 });
    }

    const caseSnap = await problem.ref.collection("testCases").get();
    const expected = new Map(
      caseSnap.docs.map((d) => {
        const data = d.data();
        // Authors may store a plaintext expectation for sample cases; hash it
        // on read so comparison is uniform either way.
        const hash =
          typeof data.expectedHash === "string"
            ? data.expectedHash
            : sha256(String(data.expectedOutput ?? ""));
        return [d.id, { hash, visibility: String(data.visibility ?? "hidden") }];
      }),
    );

    if (expected.size === 0) {
      return NextResponse.json(
        { success: false, error: "This problem has no test cases yet" },
        { status: 409 },
      );
    }

    const perCase = [...expected.entries()].map(([caseId, exp]) => {
      const reported = results.find((r) => r.caseId === caseId);
      return {
        caseId,
        visibility: exp.visibility,
        // A case the client simply omitted counts as failed, never as passed.
        passed: reported ? reported.outputHash === exp.hash : false,
        reported: Boolean(reported),
      };
    });

    const passedCount = perCase.filter((c) => c.passed).length;
    const verdict = passedCount === perCase.length ? "accepted" : "wrong_answer";

    const submission = {
      uid: user.uid,
      email: user.email,
      problemSlug,
      verdict,
      passed: passedCount,
      total: perCase.length,
      compileMs: compileMs ?? null,
      // Stored so a learner can review their own history.
      source,
      at: new Date().toISOString(),
      // Recorded explicitly: the verdict is client-reported by design, and a
      // future server-side runner should be able to tell the two apart.
      judgedBy: "client",
    };
    await db.collection("submissions").add(submission);

    if (verdict === "accepted") {
      // Merge so re-solving never downgrades an existing completion.
      await db
        .collection("userProgress")
        .doc(`${user.uid}_${problemSlug}`)
        .set(
          { uid: user.uid, problemSlug, solved: true, solvedAt: new Date().toISOString() },
          { merge: true },
        );
    }

    return NextResponse.json({
      success: true,
      data: {
        verdict,
        passed: passedCount,
        total: perCase.length,
        // Only sample-case detail is echoed back; naming which hidden case
        // failed leaks the shape of the hidden inputs.
        cases: perCase
          .filter((c) => c.visibility === "sample")
          .map(({ caseId, passed }) => ({ caseId, passed })),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
