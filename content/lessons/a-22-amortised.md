---
slug: amortised-cost
moduleSlug: complexity
title: Amortised cost
sortOrder: 20
status: published
summary: Why push_back is O(1) even though it sometimes copies the entire array — and why that argument is not available to you in the worst case.
---

`std::vector::push_back` sometimes has to allocate a bigger block and copy every existing element. That single call is O(n). Yet `push_back` is described as O(1) *amortised*, and the description is accurate. Understanding why is what lets you reason about dynamic arrays, hash tables and union-find.

## The argument

Suppose the vector doubles its capacity when full. Starting from capacity 1 and pushing `n` elements, the copies happen at sizes 1, 2, 4, 8, … up to `n`:

```
1 + 2 + 4 + 8 + ... + n  =  2n - 1
```

A geometric series with ratio 2 sums to less than twice its largest term. So `n` pushes cost fewer than `2n` element copies in total — an average of **under 2 copies per push**, independent of `n`. That is what O(1) amortised means: not that every operation is cheap, but that the total over any sequence of `n` operations is O(n).

## Why doubling, and not adding a constant

This is the part that makes it click. Suppose capacity grew by a fixed 10 instead:

```
10 + 20 + 30 + ... + n  =  O(n^2)
```

An arithmetic series, so `n` pushes cost O(n²) in total — O(n) per push. **Growth must be multiplicative** for amortisation to work. Any constant factor greater than 1 works; the choice of 2 (libstdc++) or 1.5 (MSVC) is a memory-versus-copies trade-off, not a correctness one.

You can watch it happen:

```cpp
#include <bits/stdc++.h>
using namespace std;

int main() {
    vector<int> v;
    size_t cap = v.capacity();
    int reallocations = 0;

    for (int i = 0; i < 1000; ++i) {
        v.push_back(i);
        if (v.capacity() != cap) {
            cap = v.capacity();
            ++reallocations;
            cout << "size " << v.size() << " -> capacity " << cap << '\n';
        }
    }
    // ~10 reallocations for 1000 pushes: log2(1000). Not 1000.
    cout << "reallocations: " << reallocations << '\n';
}
```

Ten reallocations for a thousand pushes. The expensive case is rare in exactly the proportion that makes the average constant.

Watch the copies rather than counting them. Growth is rare, and it gets rarer — which is the whole argument:

```viz
{ "demo": "dynamicArray", "values": [3, 1, 4, 1, 5, 9, 2, 6], "title": "eight pushes, three reallocations" }
```

## When you may not use the amortised bound

Amortised O(1) is a statement about a *sequence*. It is the wrong bound when a single operation's cost matters:

- **A real-time or latency-sensitive system** cannot accept one call that pauses to copy a million elements, even if the average is fine.
- **Worst-case-per-operation guarantees** in a problem statement rule it out.

And the amortised argument **resets if you destroy the amortisation**: calling `shrink_to_fit()` after every `pop_back()` reintroduces a copy per operation and makes the sequence O(n²).

## reserve() — the one-line optimisation

If you know the final size, say so. It converts `log n` reallocations into one, and it is the cheapest speedup in competitive programming:

```cpp
#include <bits/stdc++.h>
using namespace std;

int main() {
    int n;
    cin >> n;

    vector<int> a;
    a.reserve(n);                 // exactly one allocation
    for (int i = 0; i < n; ++i) {
        int x;
        cin >> x;
        a.push_back(x);
    }

    cout << a.size() << ' ' << a.capacity() << '\n';
}
```

`reserve` changes capacity, not size. `resize` changes size and value-initialises. Confusing the two gives you `n` zeroes followed by your actual data — a bug that looks like an input-parsing error.

## Three bounds, kept apart

| Bound | Claim | Example |
|---|---|---|
| **Worst case** | Every single operation | `vector::push_back` is O(n) worst case |
| **Amortised** | Total over `n` operations ÷ `n` | `vector::push_back` is O(1) amortised |
| **Average case** | Expectation over random input | `unordered_map::find` is O(1) average, O(n) worst |

Amortised and average are different claims and are often confused. Amortised is a **guarantee** about a sequence — no probability involved, no adversary can defeat it. Average case is a probabilistic statement about inputs, and an adversary who knows your hash function absolutely can defeat it.

That distinction is why `vector` is safe against hostile input and `unordered_map` is not.
