/**
 * Part 7's derivations, including every case the plan calls out by name.
 *
 *   npm run verify:portfolio
 */
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const {
  byRecencyDesc,
  buildSkillIndex,
  credentialStatus,
  dateKey,
  formatPartialDate,
  normaliseSkill,
  yearOf,
} = await import(pathToFileURL(join(ROOT, "src/lib/portfolio.ts")).href);

const results = [];
const check = (name, cond, detail = "") => results.push({ name, ok: Boolean(cond), detail });

/* ------------------------------------------------------------------ dates */

check("a month-only date is padded so it sorts against dated entries", dateKey("2024-06") === "2024-06-00", dateKey("2024-06"));
check("a full date keeps its day", dateKey("2024-06-15") === "2024-06-15", dateKey("2024-06-15"));
check("an unparseable date sorts last rather than throwing", dateKey("June 2024") === "0000-00-00", dateKey("June 2024"));
check("an absent date is empty, not NaN", dateKey(undefined) === "");

check("a month-only date formats without a phantom day", formatPartialDate("2024-06") === "June 2024", formatPartialDate("2024-06"));
check("a full date formats with its day", formatPartialDate("2024-06-15") === "15 June 2024", formatPartialDate("2024-06-15"));
check("a leading zero is not printed as '05'", formatPartialDate("2024-06-05") === "5 June 2024", formatPartialDate("2024-06-05"));

check("yearOf groups by year", yearOf("2021-03-02") === "2021", yearOf("2021-03-02"));

/* --------------------------------------------------- timeline ordering */

{
  // 🛑 The plan's case: MIXED YYYY-MM and YYYY-MM-DD, plus an entry with no
  // endDate which must sort FIRST as "present".
  const entries = [
    { id: "old", startDate: "2019-04", endDate: "2021-06-30" },
    { id: "present", startDate: "2023-01-15" },
    { id: "mid", startDate: "2021-07-01", endDate: "2022-12" },
    { id: "recent-closed", startDate: "2022-12-01", endDate: "2022-12-31" },
  ];
  const order = byRecencyDesc(entries).map((e) => e.id);
  check(
    "an open-ended entry sorts first as 'present'",
    order[0] === "present",
    order.join(" > "),
  );
  check(
    "the rest are newest-first with mixed date precision",
    order.join(",") === "present,recent-closed,mid,old",
    order.join(","),
  );
}

{
  const certs = [
    { id: "a", issuedAt: "2020-01" },
    { id: "b", issuedAt: "2024-11-02" },
    { id: "c", issuedAt: "2022-06-15" },
  ];
  check(
    "certifications order by issuedAt when there is no startDate",
    byRecencyDesc(certs).map((c) => c.id).join(",") === "b,c,a",
    byRecencyDesc(certs).map((c) => c.id).join(","),
  );
}

{
  // An open-ended CERT has no endDate either, but issuedAt is not a start —
  // so a cert must not be hoisted to the top merely for lacking endDate.
  const mixed = [
    { id: "cert-old", issuedAt: "2018-01" },
    { id: "job-now", startDate: "2024-01" },
  ];
  check(
    "a cert is not treated as 'present' just for having no endDate",
    byRecencyDesc(mixed).map((e) => e.id).join(",") === "job-now,cert-old",
    byRecencyDesc(mixed).map((e) => e.id).join(","),
  );
}

/* ----------------------------------------------------- credential status */

{
  const now = new Date("2026-10-24T12:00:00Z");
  check("no expiry is permanent, not expired", credentialStatus(undefined, now) === "permanent");
  check(
    "an expiry in the past is expired",
    credentialStatus("2025-03-01", now) === "expired",
    credentialStatus("2025-03-01", now),
  );
  check(
    "an expiry inside 90 days is expiring",
    credentialStatus("2026-12-01", now) === "expiring",
    credentialStatus("2026-12-01", now),
  );
  check(
    "an expiry beyond 90 days is active",
    credentialStatus("2028-01-01", now) === "active",
    credentialStatus("2028-01-01", now),
  );
  // A month-only expiry means "through the end of that month". Padding it to
  // -00 naively would mark it expired on the 1st.
  check(
    "a month-only expiry is valid until that month ENDS",
    credentialStatus("2026-10", now) === "expiring",
    credentialStatus("2026-10", now),
  );
  check(
    "and the month before it has genuinely expired",
    credentialStatus("2026-09", now) === "expired",
    credentialStatus("2026-09", now),
  );
  check(
    "a malformed expiry does not render as expired",
    credentialStatus("whenever", now) === "permanent",
    credentialStatus("whenever", now),
  );
}

/* ------------------------------------------------------------------ skills */

// 🛑 The plan's case, verbatim: three spellings must collapse to ONE skill.
check(
  "Node / node.js / NodeJS collapse to one skill",
  normaliseSkill("Node") === normaliseSkill("node.js") &&
    normaliseSkill("node.js") === normaliseSkill("NodeJS"),
  `${normaliseSkill("Node")} / ${normaliseSkill("node.js")} / ${normaliseSkill("NodeJS")}`,
);
check("an unknown skill passes through rather than being dropped", normaliseSkill("  Rust ") === "Rust", normaliseSkill("  Rust "));
check("whitespace is collapsed", normaliseSkill("Google   Cloud Platform") === "Google Cloud", normaliseSkill("Google   Cloud Platform"));
check("c++ survives its punctuation", normaliseSkill("cpp") === "C++" && normaliseSkill("C++") === "C++");

{
  const index = buildSkillIndex({
    projects: [
      { title: "letitrip", stack: ["TypeScript", "Node", "PostgreSQL"] },
      { title: "appkit", stack: ["typescript", "React"] },
      { title: "mohasinac.com", stack: ["TS", "Next"] },
    ],
    experience: [
      { role: "Engineer", company: "Acme", skills: ["NodeJS", "typescript"] },
      { role: "Lead", company: "Globex", skills: ["TypeScript"] },
    ],
    certifications: [{ title: "Cloud cert", skills: ["Google Cloud Platform", "node.js"] }],
  });

  const ts = index.find((s) => s.skill === "TypeScript");
  check(
    "TypeScript is counted across every spelling and source",
    ts?.projects.length === 3 && ts?.roles.length === 2,
    `${ts?.projects.length} projects, ${ts?.roles.length} roles`,
  );
  const node = index.find((s) => s.skill === "Node.js");
  check(
    "Node.js aggregates a project, a role and a certification",
    node?.projects.length === 1 && node?.roles.length === 1 && node?.certifications.length === 1,
    JSON.stringify(node),
  );
  check(
    "there is exactly ONE Node entry, not three",
    index.filter((s) => /node/i.test(s.skill)).length === 1,
    index.filter((s) => /node/i.test(s.skill)).map((s) => s.skill).join(","),
  );
  check(
    "the index is ranked by evidence, most first",
    index[0]?.skill === "TypeScript",
    index.slice(0, 3).map((s) => `${s.skill}:${s.count}`).join(" "),
  );
  check(
    "the same project twice does not double-count",
    buildSkillIndex({ projects: [{ title: "p", stack: ["Node", "nodejs"] }] })[0]?.count === 1,
  );
  check("an empty input yields an empty index, not a throw", buildSkillIndex({}).length === 0);
}

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
