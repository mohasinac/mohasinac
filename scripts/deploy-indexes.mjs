/**
 * Create the composite indexes declared in firestore.indexes.json.
 *
 * Why this exists rather than `firebase deploy --only firestore:indexes`: the
 * Firebase CLI needs an interactive login, and this project's credential is a
 * service account. The Firestore Admin REST API accepts the same index
 * definitions and authenticates with the service-account access token we
 * already have.
 *
 * Without these indexes every public list query fails with FAILED_PRECONDITION
 * and listPublished() falls back to the bundled content files — the site
 * renders but silently serves stale data, which is invisible without reading
 * the server logs.
 *
 * Index creation is asynchronous: this returns once each index is ACCEPTED,
 * and Firestore finishes building it in the background (fast on small
 * collections). Re-running is safe — an existing index returns 409, which is
 * reported as "exists" rather than an error.
 *
 *   node scripts/deploy-indexes.mjs
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { initializeApp, cert } from "firebase-admin/app";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const env = {};
for (const line of readFileSync(join(ROOT, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)="?([\s\S]*?)"?$/);
  if (m && !line.trim().startsWith("#")) env[m[1]] = m[2];
}

const projectId = env.FIREBASE_ADMIN_PROJECT_ID;

const app = initializeApp({
  credential: cert({
    projectId,
    clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/^﻿/, "")
      .replace(/^["']|["']$/g, "")
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "")
      .trim(),
  }),
});

const { access_token: token } = await app.options.credential.getAccessToken();

const config = JSON.parse(readFileSync(join(ROOT, "firestore.indexes.json"), "utf8"));
// Strip the "//" comment keys — they document the file but are not valid API
// fields, and the endpoint rejects unknown properties.
const indexes = config.indexes.map(({ collectionGroup, queryScope, fields }) => ({
  collectionGroup,
  queryScope,
  fields,
}));

console.log(`\nCreating ${indexes.length} composite indexes in "${projectId}"\n`);

let created = 0;
let existing = 0;
let failed = 0;

for (const index of indexes) {
  const label = `${index.collectionGroup}(${index.fields.map((f) => f.fieldPath).join(", ")})`;
  const url =
    `https://firestore.googleapis.com/v1/projects/${projectId}` +
    `/databases/(default)/collectionGroups/${index.collectionGroup}/indexes`;

  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ queryScope: index.queryScope, fields: index.fields }),
  });

  if (res.ok) {
    console.log(`  CREATED  ${label}`);
    created++;
  } else if (res.status === 409) {
    console.log(`  exists   ${label}`);
    existing++;
  } else {
    const body = await res.text();
    console.log(`  FAILED   ${label} — ${res.status} ${body.slice(0, 200)}`);
    failed++;
  }
}

console.log(`\n  ${created} created, ${existing} already present, ${failed} failed`);
console.log(
  failed
    ? "\nSome indexes could not be created. Check the service account's permissions\n" +
        "(it needs roles/datastore.owner or Cloud Datastore Index Admin).\n"
    : "\nIndexes accepted. Firestore builds them in the background — a minute or\n" +
        "two on collections this size.\n",
);

process.exit(failed ? 1 : 0);
