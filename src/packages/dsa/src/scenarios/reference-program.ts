/**
 * Pull a runnable program out of an editorial.
 *
 * An editorial is prose with several ```cpp fences: usually a brute-force
 * sketch, then a helper or two, then the optimal solution as a complete
 * program. The reference visualization needs the one that can actually run.
 *
 * 🛑 This is why a reference trace costs ZERO new authored content — a problem
 * needs an editorial and a sample case anyway, and those two are exactly the
 * inputs. A problem added next year gets a reference visualization as a side
 * effect of being finished, which is the generalisation requirement satisfied
 * structurally rather than by convention.
 */

/** A fence that compiles on its own: it has an entry point. */
const HAS_MAIN = /\bint\s+main\s*\(/;

/**
 * Fenced code blocks tagged `cpp`.
 *
 * The fence regex matches the info string as a bare word, mirroring
 * `Markdown.tsx` — an editorial written with ```` ```cpp title=… ```` would not
 * render as code there either, so matching more here would extract something
 * the learner never saw.
 */
function cppFences(markdown: string): string[] {
  const out: string[] = [];
  const lines = markdown.split("\n");
  let inside = false;
  let buffer: string[] = [];

  for (const line of lines) {
    const fence = /^```(\w*)\s*$/.exec(line.trim());
    if (fence) {
      if (inside) {
        out.push(buffer.join("\n"));
        buffer = [];
        inside = false;
      } else if (fence[1] === "cpp") {
        inside = true;
      }
      // A fence opening in another language is skipped entirely, including its
      // body — tracked by `inside` staying false until the closing fence.
      continue;
    }
    if (inside) buffer.push(line);
  }

  // An unterminated fence still yields its content: a truncated editorial is a
  // content bug, and silently dropping the program would make it look like a
  // tracer bug instead.
  if (inside && buffer.length > 0) out.push(buffer.join("\n"));
  return out;
}

export interface ReferenceProgram {
  readonly source: string;
  /** 1-based index among the cpp fences, for an "approach 2 of 3" label. */
  readonly fenceIndex: number;
  readonly fenceCount: number;
}

/**
 * The LAST complete program in the editorial.
 *
 * Last, not first: editorials here are written brute-force-first and build to
 * the optimal solution, so the final runnable fence is the one worth showing.
 * Tracing the brute force would illustrate the approach the editorial spends
 * its length arguing against.
 */
export function extractReferenceProgram(editorial: string): ReferenceProgram | null {
  const fences = cppFences(editorial);
  if (fences.length === 0) return null;

  for (let i = fences.length - 1; i >= 0; i--) {
    const source = fences[i];
    if (source === undefined || !HAS_MAIN.test(source)) continue;
    const trimmed = source.trim();
    if (trimmed === "") continue;
    return { source: `${trimmed}\n`, fenceIndex: i + 1, fenceCount: fences.length };
  }
  return null;
}
