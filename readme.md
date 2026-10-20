# mohasinac.com

Personal site, technical blog, an in-browser C++ sandbox, and a competitive-programming
course taught from first principles.

> This repository is also the GitHub profile repo for [@mohasinac](https://github.com/mohasinac),
> so this file renders on the profile page.

## What it is

| Area | What it does |
|---|---|
| **Portfolio** | Projects, tools, certifications, business and hobbies — Firestore-backed, edited from an admin CMS |
| **Blog** | Technical writing, authored in-browser |
| **Sandbox** | Compiles and runs C++ **entirely in your browser** — no judge server, nothing leaves your machine |
| **Course** | C++ from first principles → data structures built as classes → Blind 75 → NeetCode 150/250 |

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript, Tailwind 4
- [`@mohasinac/appkit`](https://github.com/mohasinac/appkit) — UI primitives, Firebase auth, RBAC,
  rate limiting, CSP, SEO
- Firebase (Auth, Firestore, Storage) — **backend-only**: `firestore.rules` denies all client
  access and every read/write goes through an API route using the Admin SDK
- [`@yowasp/clang`](https://github.com/YoWASP/clang) (Clang 22 → WebAssembly) +
  [`browser_wasi_shim`](https://github.com/bjorn3/browser_wasi_shim) for the sandbox

## The sandbox, briefly

Clang itself is compiled to WebAssembly and runs in a Web Worker. Your C++ is compiled there, and
the resulting wasm runs under a WASI shim whose filesystem is in-memory and whose network does not
exist. Measured: **~1.1 s warm compile**, program runs in single-digit milliseconds, after a
one-time ~30 MB toolchain download that the browser caches.

Three constraints are inherent to that toolchain and worth knowing:

- Compilation is pinned to `-std=c++20 -O2 -fno-exceptions`. `-fno-exceptions` is forced, not
  chosen: the bundled `libc++abi` was built without exceptions, so `__cxa_throw` does not exist and
  `-fexceptions` cannot link. `throw` / `try` / `catch` will not compile.
- `<bits/stdc++.h>` is supplied by the sandbox — libc++ has no such header.
- A precompiled header is built at deploy time; it is what turns a 4.9 s compile into a 1.1 s one.

## Local development

```bash
npm install
cp .env.example .env.local      # fill in Firebase + Resend + Upstash
npm run toolchain:build         # stage clang + build the PCH (~30 s, one time)
npm run dev
```

`npm run check` runs type-checking and lint.

### Working on appkit at the same time

appkit cannot be built standalone — its `postinstall` deletes its own peer deps on purpose, relying
on resolution walking up to a consumer. It therefore builds inside a small build host:

```bash
git -C <appkit-repo> worktree add ../appkit-build/appkit -b <branch>
cd ../appkit-build && npm install
cd appkit && npm install && npm run build
cd ../../mohasinac.com && npm run sync:appkit
```

`npm run sync:appkit:check` fails if the installed copy has drifted from the build host.

## License

Source is MIT. Course prose, problem statements and editorials are original work, not reproduced
from any published sheet; each problem links to its source for attribution.
