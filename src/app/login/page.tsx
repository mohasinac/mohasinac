import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to track your progress through the C++ course.",
  robots: { index: false, follow: false },
};

/** Only allow relative paths — an open redirect would let a crafted
 *  /login?next=https://evil.example bounce a freshly-signed-in user off-site. */
function safeNext(raw: string | undefined): string {
  if (!raw) return "/learn";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/learn";
  return raw;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const target = safeNext(next);

  // Already signed in — don't show a sign-in form to a signed-in user.
  const user = await getSessionUser();
  if (user) redirect(target);

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-3xl flex-col items-center justify-center px-5 py-16">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="prose-editorial mt-2 max-w-prose text-sm text-text-muted">
          The course needs an account so your progress and submissions are saved. The portfolio and
          blog are open to everyone.
        </p>
      </div>
      <LoginForm next={target} />
    </main>
  );
}
