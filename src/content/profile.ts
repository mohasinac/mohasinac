/**
 * Profile content — PLACEHOLDERS.
 *
 * 🛑 Every entry marked TODO is invented scaffolding, not fact. It exists so
 * the pages have real shape and spacing to render; replace it with your own
 * details before the site is shared. Nothing here is published as a claim
 * about you until you edit it.
 *
 * This is a staging step, not the final home for this content. The agreed
 * design is a Firestore-backed CMS with admin CRUD (`features/portfolio`), at
 * which point these modules are replaced by repository reads and this file is
 * deleted. Typed the same shape as the planned documents, so the swap is
 * mechanical.
 */

export interface Project {
  slug: string;
  title: string;
  role: string;
  period: string;
  summary: string;
  stack: readonly string[];
  highlights: readonly string[];
  repoUrl?: string;
  liveUrl?: string;
  /** false while the entry is still placeholder text. */
  verified: boolean;
}

export interface Tool {
  name: string;
  category: "language" | "framework" | "infra" | "data" | "tooling";
  note: string;
  /** Mirrors toolSchema so the fallback has the same shape as a Firestore doc. */
  proficiency?: string;
  yearsUsed?: number;
}

export interface Certification {
  title: string;
  issuer: string;
  issuedAt: string;
  /** Absent means the credential does not lapse. */
  expiresAt?: string;
  credentialId?: string;
  credentialUrl?: string;
  skills?: readonly string[];
  verified: boolean;
}

export interface Experience {
  company: string;
  role: string;
  /** `YYYY-MM` or `YYYY-MM-DD` — see partialDate in lib/resources.ts. */
  startDate: string;
  /** Absent means "present", and sorts first. */
  endDate?: string;
  location?: string;
  summary?: string;
  highlights?: readonly string[];
  skills?: readonly string[];
  verified: boolean;
}

export interface Hobby {
  name: string;
  note: string;
}

export const PROFILE = {
  name: "Mohasin A C",
  tagline: "engineer · builder · course author",
  // TODO(profile): replace with your own bio.
  bio: `I build web products end to end — the data model, the server, the interface, and the
boring operational parts that decide whether any of it survives contact with real users.`,
  location: "India",
  email: "", // TODO(profile): public contact address, if you want one listed
  links: {
    github: "https://github.com/mohasinac",
    // TODO(profile): add linkedin / x / elsewhere
  },
} as const;

/** TODO(profile): letitrip.in is real; the rest is scaffolding. */
export const PROJECTS: readonly Project[] = [
  {
    slug: "letitrip-in",
    title: "letitrip.in",
    role: "Solo engineer",
    period: "2025 — present",
    summary:
      "A collectibles marketplace: listings, auctions, pre-orders, payments, shipping and an admin console, built on a shared toolkit I maintain separately.",
    stack: ["Next.js", "TypeScript", "Firebase", "Tailwind", "Vercel"],
    highlights: [
      "Backend-only Firestore — every read and write goes through an API route using the Admin SDK, with security rules denying client access outright",
      "Extracted the reusable half into @mohasinac/appkit, now consumed by more than one project",
      "Payments through PhonePe and Razorpay behind one provider interface",
    ],
    liveUrl: "https://letitrip.in",
    verified: true,
  },
  {
    slug: "appkit",
    title: "@mohasinac/appkit",
    role: "Author",
    period: "2025 — present",
    summary:
      "A Next.js + Firebase application toolkit: UI primitives, a feature-module system, RBAC, rate limiting, CSP helpers and a runtime theme system.",
    stack: ["TypeScript", "React", "Firebase Admin", "Tailwind"],
    highlights: [
      "Feature modules ship their own schemas, repositories, API handlers and views",
      "Runtime theme presets applied as CSS custom properties, admin-editable",
      "Published to npm and consumed by letitrip.in and this site",
    ],
    repoUrl: "https://github.com/mohasinac/appkit",
    verified: true,
  },
  {
    slug: "mohasinac-com",
    title: "mohasinac.com",
    role: "Author",
    period: "2026",
    summary:
      "This site: portfolio, technical blog, a C++ sandbox that compiles in the browser, and a competitive-programming course.",
    stack: ["Next.js 16", "WebAssembly", "Clang", "Firebase"],
    highlights: [
      "Clang 22 compiled to WebAssembly — C++ compiles and runs client-side with no judge server",
      "A precompiled header cuts a cold ~5s compile to roughly a second",
      "Nonce-based CSP with 'wasm-unsafe-eval', no 'unsafe-eval' anywhere",
    ],
    repoUrl: "https://github.com/mohasinac/mohasinac",
    liveUrl: "https://www.mohasinac.com",
    verified: true,
  },
];

export const TOOLS: readonly Tool[] = [
  { name: "TypeScript", category: "language", note: "Primary language, strict mode everywhere" },
  { name: "C++", category: "language", note: "Competitive programming and the course" },
  { name: "Next.js", category: "framework", note: "App Router, server components" },
  { name: "React", category: "framework", note: "19, with server components" },
  { name: "Firebase", category: "data", note: "Auth, Firestore, Storage — Admin SDK server-side" },
  { name: "Tailwind", category: "tooling", note: "v4, driven by design tokens" },
  { name: "Vercel", category: "infra", note: "Hosting and preview deployments" },
  { name: "WebAssembly", category: "tooling", note: "Clang toolchain in the browser" },
  // TODO(profile): add the rest of your stack
];

/** TODO(profile): entirely placeholder — replace or delete. */
export const CERTIFICATIONS: readonly Certification[] = [];

/**
 * TODO(profile): your roles. Dates must be `YYYY-MM` or `YYYY-MM-DD` — the
 * timeline sorts them lexicographically, so "March 2024" would order wrongly
 * and look plausible while doing it.
 */
export const EXPERIENCE: readonly Experience[] = [];

/** TODO(profile): replace with your actual interests. */
export const HOBBIES: readonly Hobby[] = [
  { name: "Competitive programming", note: "The reason the course on this site exists" },
  { name: "Collectibles", note: "The domain behind letitrip.in" },
];
