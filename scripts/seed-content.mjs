/**
 * Seed the Firestore CMS from the authored JSON in `content/`.
 *
 * Why this exists alongside `POST /api/admin/import`:
 *
 *   - The API route can only write top-level registry collections. Problem test
 *     cases live in a `problems/{id}/testCases` SUBcollection, so importing a
 *     problem through the route leaves it unsolvable ("no test cases yet").
 *   - Seeding happens from a terminal before anyone has signed in, so there is
 *     no admin session cookie for the route to authenticate against.
 *
 * It upserts by `slug`, so re-running corrects records rather than duplicating
 * them, and it is a DRY RUN unless `--apply` is passed.
 *
 *   node scripts/seed-content.mjs            # report what would change
 *   node scripts/seed-content.mjs --apply    # write it
 *   node scripts/seed-content.mjs --only=problems --apply
 *
 * 🛑 Hidden test cases are written as a SHA-256 of the expected output and the
 * plaintext is dropped. Writing both would defeat the point: the problem page
 * reads this subcollection and ships every field of a sample case to the
 * browser, so a plaintext expectation on a hidden case is one refactor away
 * from being served to the learner.
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONTENT = join(ROOT, "content");

const APPLY = process.argv.includes("--apply");
const ONLY = process.argv.find((a) => a.startsWith("--only="))?.slice(7);

/* ------------------------------------------------------------------ env ---- */

const env = {};
for (const line of readFileSync(join(ROOT, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)="?([\s\S]*?)"?$/);
  if (m && !line.trim().startsWith("#")) env[m[1]] = m[2];
}

const app = initializeApp({
  credential: cert({
    projectId: env.FIREBASE_ADMIN_PROJECT_ID,
    clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
    // A private key that has been through a shell is usually mangled; the same
    // normalisation as scripts/verify-firebase.mjs.
    privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/^﻿/, "")
      .replace(/^["']|["']$/g, "")
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "")
      .trim(),
  }),
});
const db = getFirestore(app);
db.settings({ ignoreUndefinedProperties: true });

/* --------------------------------------------------------------- schema ---- */

/*
 * Deliberately NOT importing src/lib/resources.ts: it is a `server-only` TS
 * module and this is a plain node script. These checks are the structural
 * subset that catches an authoring mistake — the API route remains the full
 * Zod-validated path. Keep the enums here in step with that file.
 */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const COLLECTIONS = {
  tracks: { collection: "courseTracks", required: ["slug", "title"], search: ["title", "summary"] },
  modules: {
    collection: "courseModules",
    required: ["slug", "title", "trackSlug"],
    search: ["title", "summary", "trackSlug"],
  },
  lessons: {
    collection: "lessons",
    required: ["slug", "title", "moduleSlug"],
    search: ["title", "summary", "moduleSlug"],
  },
  problems: {
    collection: "problems",
    required: ["slug", "title", "difficulty"],
    search: ["title", "patterns", "difficulty"],
    enums: { difficulty: ["easy", "medium", "hard"] },
  },
  projects: { collection: "projects", required: ["slug", "title"], search: ["title", "summary", "role"] },
  tools: {
    collection: "tools",
    required: ["slug", "name", "category"],
    search: ["name", "note", "category"],
    enums: { category: ["language", "framework", "infra", "data", "tooling"] },
  },
  posts: {
    collection: "blogPosts",
    required: ["slug", "title"],
    search: ["title", "excerpt", "tags"],
  },
};

/** Mirrors buildSearchTokens in src/lib/firestore.ts — list search breaks if they diverge. */
function buildSearchTokens(...parts) {
  const words = parts
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1);
  const tokens = new Set();
  for (const w of words) {
    for (let i = 2; i <= Math.min(w.length, 20); i++) tokens.add(w.slice(0, i));
  }
  return [...tokens].slice(0, 120);
}

const stringify = (v) => (Array.isArray(v) ? v.join(" ") : v == null ? "" : String(v));
const sha256 = (s) => createHash("sha256").update(s).digest("hex");

/** Trailing whitespace is not a wrong answer — normalise exactly as the client does. */
const normalise = (s) => String(s).replace(/[ \t]+$/gm, "").trimEnd();

/* ----------------------------------------------------------------- load ---- */

function loadJson(name) {
  const path = join(CONTENT, name);
  if (!existsSync(path)) return [];
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(parsed)) throw new Error(`${name}: expected a JSON array`);
  return parsed;
}

/**
 * Front matter for a `.md` content file.
 *
 * Markdown bodies, not JSON strings: a lesson is mostly C++ and prose, and
 * escaping that into a JSON string literal is how typos get introduced into
 * teaching material. Keys are `key: value` lines before a `---` separator;
 * `[a, b]` is read as a list and bare numbers as numbers.
 */
function parseFrontMatter(text, file) {
  const m = text.replace(/^﻿/, "").match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error(`${file}: expected a "---" front-matter block at the top`);

  const meta = {};
  for (const line of m[1].split("\n")) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const kv = line.match(/^([A-Za-z][A-Za-z0-9_]*)\s*:\s*([\s\S]*)$/);
    if (!kv) throw new Error(`${file}: cannot parse front-matter line "${line}"`);
    const raw = kv[2].trim().replace(/^["']|["']$/g, "");
    meta[kv[1]] =
      raw.startsWith("[") && raw.endsWith("]")
        ? raw
            .slice(1, -1)
            .split(",")
            .map((s) => s.trim().replace(/^["']|["']$/g, ""))
            .filter(Boolean)
        : /^-?\d+$/.test(raw)
          ? Number(raw)
          : raw;
  }
  meta.content = m[2].trim();
  return meta;
}

/**
 * All content files for a resource — `lessons.json`, or a `lessons/` directory
 * of `.json` batches and `.md` documents.
 */
function loadResource(key) {
  const dir = join(CONTENT, key);
  if (existsSync(dir) && readdirSync(dir).length) {
    return readdirSync(dir)
      .filter((f) => f.endsWith(".json") || f.endsWith(".md"))
      .sort()
      .flatMap((f) =>
        f.endsWith(".md")
          ? [parseFrontMatter(readFileSync(join(dir, f), "utf8"), `${key}/${f}`)]
          : loadJson(join(key, f)),
      );
  }
  return loadJson(`${key}.json`);
}

function validate(key, items) {
  const def = COLLECTIONS[key];
  const errors = [];
  const seen = new Set();
  items.forEach((item, i) => {
    const at = `${key}[${i}]${item?.slug ? ` (${item.slug})` : ""}`;
    for (const field of def.required) {
      if (item?.[field] == null || item[field] === "") errors.push(`${at}: missing "${field}"`);
    }
    if (item?.slug && !SLUG.test(item.slug)) errors.push(`${at}: slug must be lowercase-hyphenated`);
    if (item?.slug && seen.has(item.slug)) errors.push(`${at}: duplicate slug within the payload`);
    if (item?.slug) seen.add(item.slug);
    for (const [field, allowed] of Object.entries(def.enums ?? {})) {
      if (item?.[field] != null && !allowed.includes(item[field])) {
        errors.push(`${at}: ${field}="${item[field]}" is not one of ${allowed.join("|")}`);
      }
    }
    for (const c of item?.testCases ?? []) {
      if (!["sample", "hidden"].includes(c.visibility)) {
        errors.push(`${at}: test case visibility must be "sample" or "hidden"`);
      }
      if (c.expectedOutput == null) errors.push(`${at}: test case is missing expectedOutput`);
    }
  });
  return errors;
}

/* ---------------------------------------------------------------- apply ---- */

async function seed(key) {
  const def = COLLECTIONS[key];
  const items = loadResource(key);
  if (!items.length) return { key, skipped: true };

  const errors = validate(key, items);
  if (errors.length) {
    console.log(`\n  ${key}: ${errors.length} problem(s) — nothing written for this resource`);
    errors.slice(0, 15).forEach((e) => console.log(`      ${e}`));
    return { key, errors: errors.length };
  }

  const col = db.collection(def.collection);
  const slugs = items.map((i) => i.slug);
  const existing = new Map();
  // `in` takes at most 30 values.
  for (let i = 0; i < slugs.length; i += 30) {
    const snap = await col.where("slug", "in", slugs.slice(i, i + 30)).get();
    snap.docs.forEach((d) => existing.set(d.data().slug, d.ref));
  }

  const created = items.filter((i) => !existing.has(i.slug)).length;
  const updated = items.length - created;
  let cases = 0;

  if (APPLY) {
    const now = new Date().toISOString();
    for (const item of items) {
      // `testCases` is nested authoring convenience, not a document field.
      const { testCases = [], ...doc } = item;
      const ref = existing.get(item.slug) ?? col.doc();
      await ref.set(
        {
          status: "published",
          sortOrder: 0,
          isFeatured: false,
          ...doc,
          searchTokens: buildSearchTokens(...def.search.map((f) => stringify(doc[f]))),
          createdAt: existing.has(item.slug) ? undefined : now,
          updatedAt: now,
          updatedBy: "seed-script",
        },
        { merge: true },
      );

      for (const [n, c] of testCases.entries()) {
        const expected = normalise(c.expectedOutput);
        // Deterministic id so re-seeding replaces a case instead of adding one.
        await ref
          .collection("testCases")
          .doc(c.id ?? `case-${String(n + 1).padStart(2, "0")}`)
          .set(
            c.visibility === "sample"
              ? { visibility: "sample", input: c.input ?? "", expectedOutput: expected, sortOrder: n }
              : // Plaintext intentionally dropped; only the digest is stored.
                { visibility: "hidden", input: c.input ?? "", expectedHash: sha256(expected), sortOrder: n },
          );
        cases++;
      }
    }
  } else {
    cases = items.reduce((n, i) => n + (i.testCases?.length ?? 0), 0);
  }

  return { key, collection: def.collection, created, updated, cases };
}

/* ------------------------------------------------------------------ run ---- */

console.log(
  `\n${APPLY ? "Seeding" : "DRY RUN — seeding"} project "${env.FIREBASE_ADMIN_PROJECT_ID}" from content/\n`,
);

const keys = ONLY ? ONLY.split(",") : Object.keys(COLLECTIONS);
let failed = 0;

for (const key of keys) {
  if (!COLLECTIONS[key]) {
    console.log(`  ${key}: not a known resource (${Object.keys(COLLECTIONS).join(", ")})`);
    failed++;
    continue;
  }
  const r = await seed(key);
  if (r.skipped) {
    console.log(`  ${key.padEnd(14)} no content file`);
  } else if (r.errors) {
    failed++;
  } else {
    console.log(
      `  ${key.padEnd(14)} ${String(r.created).padStart(3)} new, ${String(r.updated).padStart(3)} updated` +
        (r.cases ? `, ${r.cases} test cases` : ""),
    );
  }
}

console.log(
  APPLY
    ? `\n${failed ? `Finished with ${failed} failing resource(s).` : "Done."}\n`
    : "\nNothing written. Re-run with --apply to write.\n",
);

process.exit(failed ? 1 : 0);
