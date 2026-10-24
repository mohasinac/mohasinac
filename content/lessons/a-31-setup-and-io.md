---
slug: setup-and-fast-io
moduleSlug: cpp-for-cp
title: Setup and fast I/O
sortOrder: 10
status: published
summary: The boilerplate worth typing every time, why cin is slow by default, and the one constraint this sandbox imposes on your C++.
---

## The template

```cpp
#include <bits/stdc++.h>
using namespace std;

int main() {
    ios_base::sync_with_stdio(false);
    cin.tie(nullptr);

    int n;
    cin >> n;
    vector<long long> a(n);
    for (long long& x : a) cin >> x;

    long long sum = 0;
    for (long long x : a) sum += x;
    cout << sum << '\n';
}
```

Four decisions in there, each worth understanding rather than copying.

**`#include <bits/stdc++.h>`** pulls in the whole standard library. It is a GCC-specific convenience header, not standard C++ — it does not exist in Clang or MSVC by default. It is a bad habit in production code (it slows compilation and hides your real dependencies) and the right call in a contest. *This sandbox provides one*, so your muscle memory works here.

**`using namespace std;`** is likewise fine in a 60-line contest file and genuinely harmful in a 60-file project, where it causes name collisions that surface as baffling overload-resolution errors. Know that you are making a context-dependent trade, not a universal one.

**`sync_with_stdio(false)`** stops the C++ streams from staying synchronised with C's `stdio` buffers. That synchronisation exists so you can mix `printf` and `cout`; you are not going to, and turning it off is often a **2–5× speedup** on input-heavy problems. The cost: after this line, do not mix `scanf`/`printf` with `cin`/`cout`.

**`cin.tie(nullptr)`** unties `cin` from `cout`. By default every read flushes the output stream — which is what makes interactive prompts appear before the read. In batch judging that flush is pure overhead.

Together those two lines are the difference between a timeout and a pass on problems reading 10⁶ numbers.

## `'\n'` rather than `endl`

`endl` writes a newline **and flushes**. In a loop printing 10⁵ lines that is 10⁵ flushes.

```cpp
#include <bits/stdc++.h>
using namespace std;

int main() {
    ios_base::sync_with_stdio(false);
    cin.tie(nullptr);

    // Prefer this.
    for (int i = 0; i < 5; ++i) cout << i << '\n';

    // Not this, in a loop: each endl forces a flush to the OS.
    // for (int i = 0; i < 5; ++i) cout << i << endl;
}
```

Use `endl` only when you genuinely need the flush — interactive problems, where the judge is waiting for your line before it sends the next one.

## Reading until end of input

When the input has no leading count:

```cpp
#include <bits/stdc++.h>
using namespace std;

int main() {
    ios_base::sync_with_stdio(false);
    cin.tie(nullptr);

    // The stream converts to false when a read fails — EOF or a bad token.
    long long x, sum = 0;
    while (cin >> x) sum += x;
    cout << sum << '\n';
}
```

And for whole lines, including spaces:

```cpp
#include <bits/stdc++.h>
using namespace std;

int main() {
    int n;
    cin >> n;
    // `>>` leaves the newline in the buffer, so the first getline would read
    // an empty string. Consume to end of line first.
    cin.ignore(numeric_limits<streamsize>::max(), '\n');

    for (int i = 0; i < n; ++i) {
        string line;
        getline(cin, line);
        cout << line.size() << '\n';
    }
}
```

That `cin.ignore` after a `>>` and before a `getline` is one of the most common silent bugs in C++ input handling.

## One constraint in this sandbox: no exceptions

Programs here are compiled with a fixed flag set:

```
-std=c++20 -O2 -fno-exceptions
```

The `-fno-exceptions` is not a stylistic choice. The WebAssembly C++ runtime shipped with this toolchain was built without exception support — it has no `__cxa_throw` — so anything that needs to throw fails at link time rather than producing a useful error. Consequences:

- **`throw`, `try` and `catch` will not compile.** The compiler rejects them outright.
- **`vector::at()` and `stoi` on bad input trap** instead of throwing a catchable exception. Prefer `v[i]` with your own bounds check, and `from_chars` or manual parsing over `stoi` when input may be malformed.
- **`new` cannot report failure by throwing.** Irrelevant at contest sizes.

This costs you nothing for competitive programming, which does not use exceptions for control flow anyway — the convention is sentinel return values, `std::optional`, or asserting a precondition. The error-handling lesson in Track A covers that style. It does mean the exception-safety half of RAII is theory here rather than something you can run, and the [RAII lesson](/course/lessons/raii-and-the-rule-of-zero) says so where it matters.

## Debugging output

Write diagnostics to `cerr`, never `cout`. A judge compares `cout` exactly, so one stray debug line is a wrong answer; `cerr` is ignored.

```cpp
#include <bits/stdc++.h>
using namespace std;

int main() {
    int n = 3;
    cerr << "n = " << n << '\n';      // invisible to the judge
    cout << n * 2 << '\n';            // the actual answer
}
```

Better still, guard them so they vanish without edits:

```cpp
#include <bits/stdc++.h>
using namespace std;

#ifdef LOCAL
  #define dbg(x) cerr << #x << " = " << (x) << '\n'
#else
  #define dbg(x) ((void)0)
#endif

int main() {
    int total = 42;
    dbg(total);                       // prints only when compiled with -DLOCAL
    cout << total << '\n';
}
```

The `#x` stringifies the expression, so `dbg(total)` prints `total = 42` — you get the variable's name for free.
