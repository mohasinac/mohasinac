import type { Metadata } from "next";
import { Sandbox } from "@/components/Sandbox";

export const metadata: Metadata = {
  title: "C++ sandbox",
  description:
    "Compile and run C++ entirely in your browser. Clang is compiled to WebAssembly — no server sees your code.",
};

/** Public by design: the sandbox needs no account, because it needs no server. */
export default function SandboxPage() {
  return (
    <main className="mx-auto max-w-5xl px-5 py-12">
      <header className="mb-8">
        <p className="text-xs uppercase tracking-[0.2em] text-text-faint">clang 22 · webassembly</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">C++ sandbox</h1>
        <p className="prose-editorial mt-3 max-w-prose text-text-muted">
          A real Clang toolchain compiled to WebAssembly, running in a worker on this page. Your
          code is compiled and executed locally — there is no judge server, so nothing you type is
          transmitted anywhere.
        </p>
      </header>

      <Sandbox />

      <section className="prose-editorial mt-10 max-w-prose space-y-3 border-t border-border pt-6 text-sm text-text-muted">
        <h2 className="font-mono text-xs uppercase tracking-wider text-text-faint">
          Three things worth knowing
        </h2>
        <p>
          <strong className="text-text">Exceptions are unavailable.</strong> The bundled{" "}
          <code>libc++abi</code> was built without them, so <code>throw</code>, <code>try</code> and{" "}
          <code>catch</code> will not compile, and <code>vector::at()</code> traps instead of
          throwing. Everything else in C++20 works.
        </p>
        <p>
          <strong className="text-text">
            <code>&lt;bits/stdc++.h&gt;</code> is provided.
          </strong>{" "}
          libc++ has no such header — it is a GCC extension — so the sandbox supplies one, because
          competitive programmers type it reflexively.
        </p>
        <p>
          <strong className="text-text">Flags are fixed</strong> at{" "}
          <code>-std=c++20 -O2 -fno-exceptions</code>. A precompiled header does the heavy lifting
          that turns a ~5s compile into about a second, and Clang rejects a precompiled header
          whose flags differ even slightly from the compile using it.
        </p>
      </section>
    </main>
  );
}
