---
slug: big-o
moduleSlug: complexity
title: Big-O without the hand-waving
sortOrder: 10
status: published
summary: What the notation actually claims, how to read a complexity off a loop nest, and the cases where the formula misleads you.
---

Big-O describes how the cost of an algorithm **grows** as the input grows. It deliberately throws away constants and lower-order terms, because those are the parts that depend on the machine rather than the algorithm.

## What the notation claims

`f(n) = O(g(n))` means: there exist constants `c > 0` and `n₀` such that for all `n ≥ n₀`, `f(n) ≤ c · g(n)`.

Three consequences worth internalising:

- It is an **upper bound**, and a loose one is still true. An O(n) algorithm is genuinely O(n²). People say O(n²) meaning "tight", but the notation does not promise that; Θ(n²) does.
- **Constants are discarded.** `3n + 500` is O(n). This is a feature — it makes the notation portable across machines — and a trap, because a 500-element constant matters enormously when `n = 10`.
- **It says nothing about small inputs.** Insertion sort beats merge sort below roughly 50 elements. Real sort implementations exploit exactly this.

## Reading it off the code

The mechanical rules, in order:

1. **Sequential blocks add**, and the larger wins: O(n) then O(n²) is O(n²).
2. **Nested loops multiply.**
3. **A loop whose variable is halved or doubled is logarithmic.**

```cpp
#include <bits/stdc++.h>
using namespace std;

int main() {
    int n = 8;
    long long ops = 0;

    for (int i = 0; i < n; ++i)                      // O(n)
        ++ops;

    for (int i = 0; i < n; ++i)                      // O(n^2)
        for (int j = 0; j < n; ++j)
            ++ops;

    // The classic one people misread: j starts at i, so the inner loop runs
    // n, then n-1, then n-2 ... = n(n+1)/2 iterations. Still O(n^2).
    for (int i = 0; i < n; ++i)
        for (int j = i; j < n; ++j)
            ++ops;

    for (int i = 1; i < n; i *= 2)                   // O(log n)
        ++ops;

    for (int i = 0; i < n; ++i)                      // O(n log n)
        for (int j = 1; j < n; j *= 2)
            ++ops;

    cout << ops << '\n';
}
```

The third loop is the one that catches people. Halving the work is not changing the class — `n²/2` is O(n²).

The difference between O(n) and O(log n) is easier to watch than to read. Same array, same target, both searches:

```viz
{ "demo": "linearSearch", "values": [1, 3, 5, 7, 9, 11, 13], "target": 13, "title": "linear search — every element" }
```

And the same thing, halving:

```viz
{ "demo": "binarySearch", "values": [1, 3, 5, 7, 9, 11, 13], "target": 13, "title": "binary search — three comparisons" }
```

## Where the formula lies to you

**Cache behaviour.** These two are both O(n²) and differ by roughly a factor of ten on a large matrix:

```cpp
#include <bits/stdc++.h>
using namespace std;

int main() {
    const int N = 512;
    static int m[N][N];
    long long s = 0;

    // Row-major traversal: consecutive addresses, so each cache line that is
    // fetched gets fully used.
    for (int i = 0; i < N; ++i)
        for (int j = 0; j < N; ++j)
            s += m[i][j];

    // Column-major over a row-major array: every step jumps N ints forward,
    // so each fetched cache line contributes one useful value.
    for (int j = 0; j < N; ++j)
        for (int i = 0; i < N; ++i)
            s += m[i][j];

    cout << s << '\n';
}
```

Same complexity, very different wall-clock. **Iterate in memory order.**

**Hidden costs inside operations.** Big-O counts *operations*, and an operation can itself be expensive:

- `std::map` lookup is O(log n) but with pointer chasing; `unordered_map` is O(1) *average* with a worse constant than you expect and O(n) worst case.
- Comparing strings of length `L` is O(L), not O(1). Sorting `n` strings is O(n · L · log n).
- `vector::insert` at the front is O(n) — it moves everything.

**The adversary.** `unordered_map` with `int` keys uses an identity-ish hash in libstdc++, so hand-crafted inputs can force every key into one bucket and turn O(n) into O(n²). Competitive judges genuinely do this. If you need a hash map against an adversary, mix the key first or use `map`.

## Space complexity

Counted the same way, and it is frequently the binding constraint. A 10⁵ × 10⁵ `int` table is 40 GB — the DP is correct and unimplementable. That is the signal to look for a rolling array: two-dimensional DP where row `i` depends only on row `i-1` needs two rows, not `n`.

## Summary

| You wrote | Cost | Reality check |
|---|---|---|
| Single pass | O(n) | The target for `n ≥ 10⁶` |
| Sort, then one pass | O(n log n) | Almost always acceptable |
| Nested loop | O(n²) | Fine to `n ≈ 5000`, fatal at 10⁵ |
| Recursion branching twice, depth `n` | O(2ⁿ) | Only to `n ≈ 20` |
| Recursion branching twice, memoised | Often O(n²) | Memoisation is the whole lesson of DP |
