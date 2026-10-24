/**
 * Resume preset logic.
 *
 *   npm run verify:resume-presets
 */
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const {
  EVERYTHING,
  applySelection,
  buildPresets,
  matchesSelection,
  orderSkillLine,
  parseStoredSelection,
} = await import(pathToFileURL(join(ROOT, "src/lib/resume-presets.ts")).href);

const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok: Boolean(ok), detail });

/* ------------------------------------------------------------- presets */

{
  const presets = buildPresets({
    skills: ["TypeScript", "React", "PostgreSQL", "Node.js", "Tailwind CSS"],
    tools: [
      { name: "TypeScript", category: "language" },
      { name: "node", category: "language" },
      { name: "React", category: "framework" },
      { name: "postgres", category: "data" },
      { name: "tailwind", category: "tooling" },
      // In a category but evidenced by nothing on the resume.
      { name: "Kubernetes", category: "infra" },
    ],
  });

  check("Everything is always first", presets[0]?.id === "everything", presets[0]?.id);
  check(
    "a category with no evidenced skill is omitted",
    !presets.some((p) => p.id === "infra"),
    presets.map((p) => p.id).join(","),
  );
  check(
    "presets are offered in a deliberate order",
    presets.map((p) => p.id).join(",") === "everything,language,framework,data,tooling",
    presets.map((p) => p.id).join(","),
  );
  const lang = presets.find((p) => p.id === "language");
  check(
    "tool aliases are normalised into the preset",
    lang?.skills.includes("Node.js") && lang?.skills.includes("TypeScript"),
    JSON.stringify(lang?.skills),
  );
  check("Everything carries no skills, i.e. no filter", EVERYTHING.skills.length === 0);
  check("an empty portfolio still yields Everything", buildPresets({ skills: [], tools: [] }).length === 1);
}

/* ----------------------------------------------------------- filtering */

{
  const selected = new Set(["TypeScript"]);

  check("an entry tagged with a selected skill is kept", matchesSelection({ skills: ["typescript"] }, selected));
  check("an entry tagged only with others is dropped", !matchesSelection({ skills: ["Rust"] }, selected));

  // 🛑 The rule that matters most.
  check(
    "an UNTAGGED entry is always kept, never silently dropped",
    matchesSelection({ skills: [] }, selected) && matchesSelection({}, selected),
  );
  check("an empty selection keeps everything", matchesSelection({ skills: ["Rust"] }, new Set()));
}

{
  const sections = {
    roles: [
      { role: "Engineer", skills: ["TypeScript", "Node"] },
      { role: "Analyst", skills: ["Excel"] },
      { role: "Untagged", skills: [] },
    ],
    projects: [
      { title: "a", skills: ["node.js"] },
      { title: "b", skills: ["Figma"] },
    ],
    certifications: [{ title: "cert", skills: ["TypeScript"] }],
  };

  const all = applySelection(sections, new Set());
  check("no selection hides nothing", all.hidden === 0 && all.total === 6, `hidden=${all.hidden} total=${all.total}`);

  const ts = applySelection(sections, new Set(["TypeScript", "Node.js"]));
  check(
    "a selection keeps matches plus untagged entries",
    ts.roles.length === 2 && ts.projects.length === 1 && ts.certifications.length === 1,
    `${ts.roles.length} roles, ${ts.projects.length} projects, ${ts.certifications.length} certs`,
  );
  check("and reports how many it hid, so the UI can say so", ts.hidden === 2, `hidden=${ts.hidden}`);
  check(
    "the untagged role survived the filter",
    ts.roles.some((r) => r.role === "Untagged"),
  );
  check(
    "the aliased project matched (node.js vs Node.js)",
    ts.projects.some((p) => p.title === "a"),
  );
}

/* --------------------------------------------------------- skills line */

{
  const line = ["Rust", "TypeScript", "Figma", "Node.js"];
  const ordered = orderSkillLine(line, new Set(["TypeScript", "Node.js"]));
  check(
    "selected skills lead the line",
    ordered.slice(0, 2).join(",") === "TypeScript,Node.js",
    ordered.join(","),
  );
  // 🛑 Reordered, never filtered: you do still know the others, and removing
  // them would be a lie by omission.
  check("but nothing is removed from it", ordered.length === line.length, `${ordered.length} vs ${line.length}`);
  check("no selection leaves the order alone", orderSkillLine(line, new Set()).join(",") === line.join(","));
}

/* ------------------------------------------------- the stored selection */

check("a saved selection round-trips", parseStoredSelection('["TypeScript","Node.js"]').length === 2);
check("nothing stored means no filter", parseStoredSelection(null).length === 0);
// localStorage is user-editable and may hold a previous version's format. The
// safe failure is the WHOLE resume, never a blank one.
for (const junk of ["", "{}", "null", "not json", '["ok",42,null]', '[""]']) {
  const out = parseStoredSelection(junk);
  check(
    `junk ${JSON.stringify(junk)} degrades to a usable selection`,
    Array.isArray(out) && out.every((s) => typeof s === "string" && s.length > 0),
    JSON.stringify(out),
  );
}
check("a single valid entry survives alongside junk", parseStoredSelection('["ok",42]').join(",") === "ok");
check(
  "an absurdly long entry is rejected rather than rendered",
  parseStoredSelection(`["${"x".repeat(200)}"]`).length === 0,
);

/* ----------------------------------------------------------------- report */
console.log("");
let failed = 0;
for (const r of results) {
  if (r.ok) console.log(`  PASS  ${r.name}${r.detail ? `  (${r.detail})` : ""}`);
  else {
    failed++;
    console.log(`  FAIL  ${r.name}${r.detail ? `  (${r.detail})` : ""}`);
  }
}
console.log(`\n  ${results.length - failed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
