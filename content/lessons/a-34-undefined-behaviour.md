---
slug: undefined-behaviour
moduleSlug: cpp-for-cp
title: Undefined behaviour and how it bites
sortOrder: 40
status: published
summary: The traps that produce a wrong answer on the judge while working perfectly on your machine — and the error-handling style to use instead of exceptions.
---

Undefined behaviour is the category of mistake where the standard imposes no requirement at all on what happens. The program may crash, may produce a wrong answer, may work — and crucially, **may work differently under `-O2` than `-O0`**, which is exactly the difference between your machine and the judge.

## Signed integer overflow

```cpp
#include <bits/stdc++.h>
using namespace std;

int main() {
    // Signed overflow is UB. The compiler is entitled to assume it cannot
    // happen, and will optimise accordingly.
    int big = 2'000'000'000;
    long long safe = 1LL * big + big;          // widen BEFORE adding
    cout << safe << '\n';

    // Unsigned overflow is well-defined (it wraps), which creates a different
    // trap: this loop never terminates, because an unsigned i is never < 0.
    // for (unsigned i = 5; i >= 0; --i) { }

    // And this is the classic: size() is UNSIGNED, so an empty vector gives
    // 0 - 1 = a huge positive number.
    vector<int> v;
    cout << "v.size() - 1 = " << v.size() - 1 << '\n';
    // Guard with a signed cast or an emptiness check.
    cout << "safe: " << (int)v.size() - 1 << '\n';
}
```

That last one is a genuine source of wrong answers: `for (int i = 0; i < v.size() - 1; ++i)` on an empty vector loops about four billion times.

## Out-of-bounds access

```cpp
#include <bits/stdc++.h>
using namespace std;

int main() {
    vector<int> v{1, 2, 3};

    // UB, and typically does NOT crash — it reads adjacent memory and gives a
    // plausible-looking wrong answer. The worst possible failure mode.
    // cout << v[3] << '\n';

    // In this sandbox .at() traps rather than throws (the runtime is built
    // with -fno-exceptions), so bounds-check explicitly.
    size_t i = 3;
    if (i < v.size()) cout << v[i] << '\n';
    else cout << "out of range\n";

    // Strings have the same issue, plus an off-by-one magnet in the loop.
    string s = "abc";
    for (size_t j = 0; j + 1 < s.size(); ++j)
        cout << s[j] << s[j + 1] << ' ';     // adjacent pairs, no overrun
    cout << '\n';
}
```

Prefer `j + 1 < s.size()` over `j < s.size() - 1`: the first is correct on an empty string, the second underflows.

## Uninitialised variables

```cpp
#include <bits/stdc++.h>
using namespace std;

int global_counter;              // zero-initialised: statics are

int main() {
    int local;                   // NOT initialised: contains whatever was there
    // cout << local;            // UB. Often 0 in a debug build, garbage in -O2

    int ok = 0;                  // always initialise
    vector<int> v(5);            // vector DOES value-initialise: five zeroes

    cout << global_counter << ' ' << ok << ' ' << v[0] << '\n';
}
```

The cruelty here is that unoptimised builds often leave a zeroed stack, so the bug appears only on the judge's `-O2` build.

## Unspecified evaluation order

```cpp
#include <bits/stdc++.h>
using namespace std;

int main() {
    int i = 0;
    vector<int> v{10, 20, 30};

    // UB before C++17, and still confusing after: do not modify a variable
    // and read it in the same expression.
    // v[i] = i++;

    // Say what you mean in two statements.
    v[i] = i;
    ++i;

    // Function arguments have NO guaranteed evaluation order even in C++20.
    // f(g(), h()) may call h() first.
    cout << v[0] << ' ' << i << '\n';
}
```

## Error handling without exceptions

Since `throw` is unavailable here — and is avoided in competitive C++ anyway — use one of these three:

```cpp
#include <bits/stdc++.h>
using namespace std;

// 1. Sentinel return value. Fine when one value is impossible as an answer.
int find_index(const vector<int>& a, int target) {
    for (int i = 0; i < (int)a.size(); ++i)
        if (a[i] == target) return i;
    return -1;                                  // documented "not found"
}

// 2. std::optional — self-documenting, and impossible to use accidentally.
optional<int> safe_divide(int a, int b) {
    if (b == 0) return nullopt;
    return a / b;
}

// 3. A precondition you assert. Says "the caller must guarantee this", and
// crashes loudly during development rather than silently later.
int element_at(const vector<int>& a, size_t i) {
    assert(i < a.size());
    return a[i];
}

int main() {
    vector<int> a{4, 8, 15};
    cout << find_index(a, 8) << ' ' << find_index(a, 99) << '\n';

    if (auto q = safe_divide(10, 2)) cout << "10/2 = " << *q << '\n';
    if (!safe_divide(10, 0)) cout << "10/0 rejected\n";

    cout << element_at(a, 2) << '\n';
}
```

`std::optional` is the one to reach for by default. It makes "there might be no answer" part of the type, so a caller cannot forget to check — whereas a `-1` sentinel is only a convention, and conventions get violated at 2am.

## The checklist

Before submitting, scan for:

- `int` arithmetic that could exceed 2·10⁹ → use `long long` or `1LL *`
- `.size() - 1` → rewrite as `i + 1 < size()`
- array indexing with a computed index → is it bounds-checked?
- a declared variable with no initialiser
- a comparator using `<=` → must be `<`
- `accumulate(..., 0)` → `0LL`
