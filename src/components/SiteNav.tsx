import Link from "next/link";
import { getSessionUser } from "@/lib/session";
import { SignOutButton } from "@/components/SignOutButton";

const LINKS = [
  { href: "/projects", label: "Projects" },
  { href: "/blog", label: "Writing" },
  { href: "/sandbox", label: "Sandbox" },
  { href: "/course", label: "Course" },
  { href: "/about", label: "About" },
] as const;

/** Site header. Server component so it can read the session without a flash of
 *  the wrong state — a client-side auth check renders "Sign in" first and then
 *  corrects itself, which reads as a bug. */
export async function SiteNav() {
  const user = await getSessionUser();

  return (
    <header className="border-b border-border">
      <nav
        aria-label="Primary"
        className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-5 gap-y-2 px-5 py-3 text-sm"
      >
        <Link href="/" className="font-medium text-text hover:text-accent">
          mohasinac
          <span className="text-accent">.com</span>
        </Link>

        <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="text-text-muted transition-colors hover:text-accent">
              {l.label}
            </Link>
          ))}
        </span>

        <span className="ml-auto flex items-center gap-3 text-xs">
          {user ? (
            <>
              <span className="text-text-faint">
                {user.email}
                {user.role === "admin" ? (
                  <span className="ml-2 rounded-sm bg-surface-raised px-1.5 py-0.5 text-accent">admin</span>
                ) : null}
              </span>
              <SignOutButton />
            </>
          ) : (
            <Link
              href="/login"
              className="rounded-sm border border-border px-2 py-1 text-text-muted transition-colors hover:bg-surface-raised hover:text-text"
            >
              Sign in
            </Link>
          )}
        </span>
      </nav>
    </header>
  );
}
