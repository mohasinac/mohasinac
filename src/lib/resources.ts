import "server-only";

import { z } from "zod";

/**
 * The admin resource registry.
 *
 * Every CMS collection is declared ONCE here — collection name, Zod schema,
 * which fields are searchable, and how a row is labelled. The generic CRUD
 * routes and the admin console are both driven off this table, so adding a
 * resource is a registry entry rather than another hand-rolled endpoint and
 * another list page that drifts from its siblings.
 */

/** Fields every CMS document carries. */
const base = {
  slug: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "lowercase words separated by single hyphens"),
  status: z.enum(["draft", "published", "archived"]).default("draft"),
  sortOrder: z.number().int().default(0),
  isFeatured: z.boolean().default(false),
  metaTitle: z.string().max(120).optional(),
  metaDescription: z.string().max(320).optional(),
};

const projectSchema = z.object({
  ...base,
  title: z.string().min(1).max(160),
  role: z.string().max(120).default(""),
  period: z.string().max(60).default(""),
  summary: z.string().max(2000).default(""),
  stack: z.array(z.string().max(40)).max(40).default([]),
  highlights: z.array(z.string().max(400)).max(20).default([]),
  repoUrl: z.string().url().optional(),
  liveUrl: z.string().url().optional(),
});

const toolSchema = z.object({
  ...base,
  name: z.string().min(1).max(80),
  category: z.enum(["language", "framework", "infra", "data", "tooling"]),
  note: z.string().max(400).default(""),
  proficiency: z.enum(["learning", "working", "fluent"]).default("working"),
  yearsUsed: z.number().min(0).max(50).optional(),
});

const certificationSchema = z.object({
  ...base,
  title: z.string().min(1).max(160),
  issuer: z.string().min(1).max(120),
  issuedAt: z.string().max(40),
  expiresAt: z.string().max(40).optional(),
  credentialId: z.string().max(120).optional(),
  credentialUrl: z.string().url().optional(),
  skills: z.array(z.string().max(40)).max(30).default([]),
});

const hobbySchema = z.object({
  ...base,
  name: z.string().min(1).max(80),
  note: z.string().max(600).default(""),
});

const businessSchema = z.object({
  ...base,
  name: z.string().min(1).max(160),
  legalName: z.string().max(200).optional(),
  summary: z.string().max(2000).default(""),
  services: z.array(z.string().max(120)).max(30).default([]),
  liveUrl: z.string().url().optional(),
});

const postSchema = z.object({
  ...base,
  title: z.string().min(1).max(200),
  excerpt: z.string().max(400).default(""),
  content: z.string().max(200_000).default(""),
  tags: z.array(z.string().max(40)).max(20).default([]),
  publishedAt: z.string().max(40).optional(),
  readTimeMinutes: z.number().int().min(0).max(240).default(0),
});

const trackSchema = z.object({
  ...base,
  title: z.string().min(1).max(160),
  summary: z.string().max(2000).default(""),
});

const moduleSchema = z.object({
  ...base,
  trackSlug: z.string().min(1).max(120),
  title: z.string().min(1).max(160),
  summary: z.string().max(2000).default(""),
});

const lessonSchema = z.object({
  ...base,
  moduleSlug: z.string().min(1).max(120),
  title: z.string().min(1).max(200),
  summary: z.string().max(1000).default(""),
  content: z.string().max(200_000).default(""),
});

const problemSchema = z.object({
  ...base,
  title: z.string().min(1).max(200),
  difficulty: z.enum(["easy", "medium", "hard"]),
  patterns: z.array(z.string().max(60)).max(12).default([]),
  /** A problem can belong to several sheets at once. */
  sheets: z.array(z.enum(["blind75", "neetcode150", "neetcode250"])).max(3).default([]),
  /** Original wording. Statements are never copied from the source. */
  statement: z.string().max(20_000).default(""),
  constraints: z.string().max(4000).default(""),
  starterCode: z.string().max(20_000).default(""),
  editorial: z.string().max(60_000).default(""),
  /** Attribution link to wherever the problem originates. */
  sourceUrl: z.string().url().optional(),
  sourceName: z.string().max(80).optional(),
});

export interface ResourceDef {
  /** Firestore collection name. */
  collection: string;
  /** Human label for the admin console. */
  label: string;
  /** Domain grouping in the admin resource tree. */
  group: "Portfolio" | "Blog" | "Course" | "Site";
  schema: z.ZodTypeAny;
  /** Field rendered as the row title. */
  titleField: string;
  /** Fields concatenated into the search token index. */
  searchFields: readonly string[];
  /** Default ordering for list views. */
  orderBy: { field: string; direction: "asc" | "desc" };
}

export const RESOURCES = {
  projects: {
    collection: "projects",
    label: "Projects",
    group: "Portfolio",
    schema: projectSchema,
    titleField: "title",
    searchFields: ["title", "summary", "role"],
    orderBy: { field: "sortOrder", direction: "asc" },
  },
  tools: {
    collection: "tools",
    label: "Tools",
    group: "Portfolio",
    schema: toolSchema,
    titleField: "name",
    searchFields: ["name", "note", "category"],
    orderBy: { field: "sortOrder", direction: "asc" },
  },
  certifications: {
    collection: "certifications",
    label: "Certifications",
    group: "Portfolio",
    schema: certificationSchema,
    titleField: "title",
    searchFields: ["title", "issuer"],
    orderBy: { field: "issuedAt", direction: "desc" },
  },
  hobbies: {
    collection: "hobbies",
    label: "Hobbies",
    group: "Portfolio",
    schema: hobbySchema,
    titleField: "name",
    searchFields: ["name", "note"],
    orderBy: { field: "sortOrder", direction: "asc" },
  },
  businesses: {
    collection: "businesses",
    label: "Business",
    group: "Portfolio",
    schema: businessSchema,
    titleField: "name",
    searchFields: ["name", "legalName", "summary"],
    orderBy: { field: "sortOrder", direction: "asc" },
  },
  posts: {
    collection: "blogPosts",
    label: "Posts",
    group: "Blog",
    schema: postSchema,
    titleField: "title",
    searchFields: ["title", "excerpt", "tags"],
    orderBy: { field: "publishedAt", direction: "desc" },
  },
  tracks: {
    collection: "courseTracks",
    label: "Tracks",
    group: "Course",
    schema: trackSchema,
    titleField: "title",
    searchFields: ["title", "summary"],
    orderBy: { field: "sortOrder", direction: "asc" },
  },
  modules: {
    collection: "courseModules",
    label: "Modules",
    group: "Course",
    schema: moduleSchema,
    titleField: "title",
    searchFields: ["title", "summary", "trackSlug"],
    orderBy: { field: "sortOrder", direction: "asc" },
  },
  lessons: {
    collection: "lessons",
    label: "Lessons",
    group: "Course",
    schema: lessonSchema,
    titleField: "title",
    searchFields: ["title", "summary", "moduleSlug"],
    orderBy: { field: "sortOrder", direction: "asc" },
  },
  problems: {
    collection: "problems",
    label: "Problems",
    group: "Course",
    schema: problemSchema,
    titleField: "title",
    searchFields: ["title", "patterns", "difficulty"],
    orderBy: { field: "sortOrder", direction: "asc" },
  },
} as const satisfies Record<string, ResourceDef>;

export type ResourceKey = keyof typeof RESOURCES;

export function isResourceKey(value: string): value is ResourceKey {
  return Object.hasOwn(RESOURCES, value);
}

export function getResource(key: ResourceKey): ResourceDef {
  return RESOURCES[key];
}

/** Resources grouped for the admin console's left-hand tree. */
export function groupedResources(): Record<string, Array<{ key: ResourceKey; label: string }>> {
  const out: Record<string, Array<{ key: ResourceKey; label: string }>> = {};
  for (const [key, def] of Object.entries(RESOURCES) as [ResourceKey, ResourceDef][]) {
    (out[def.group] ??= []).push({ key, label: def.label });
  }
  return out;
}
