---
slug: constraints-tell-you-the-algorithm
moduleSlug: approach
title: Constraints tell you the algorithm
sortOrder: 20
status: published
summary: The input size is a hint, not decoration. Read it first and it narrows the search space of approaches to one or two.
---

A judge typically allows about **10⁸ simple operations per second**. That number plus the input size tells you which complexities are open to you, which means the constraint line is effectively telling you the algorithm.

## The table worth memorising

| Max `n` | Allowed complexity | Typical approach |
|---|---|---|
| `n ≤ 10` | O(n!) · O(2ⁿ · n) | Permutations, brute-force search |
| `n ≤ 20` | O(2ⁿ) | Subset enumeration, bitmask DP |
| `n ≤ 100` | O(n⁴) | Four nested loops, Floyd–Warshall on 100 nodes |
| `n ≤ 500` | O(n³) | Matrix chain, Floyd–Warshall |
| `n ≤ 5000` | O(n²) | Two nested loops, 2-D DP |
| `n ≤ 10⁵` | O(n log n) | Sort, heap, binary search, balanced tree |
| `n ≤ 10⁶` | O(n) | Single pass, two pointers, counting |
| `n ≤ 10⁹` | O(log n) · O(1) | Binary search on the answer, maths |

Read it backwards and it becomes a decision procedure. `n = 10⁵` and you were about to write a nested loop? That is 10¹⁰ operations — a thousand times over budget. Do not write it. Find the log.

## Other numbers that are hints

- **`n ≤ 20`** is almost never a coincidence. `2²⁰ ≈ 10⁶`, so the intended solution enumerates subsets. If you see 20, think bitmask.
- **"the answer fits in a 32-bit integer"** is a warning that intermediate values might not. Sum of 10⁵ values each up to 10⁹ is 10¹⁴ — overflows `int`, fits `long long`.
- **Values up to 10⁹ but `n` only 10⁵** means the *values* cannot be array indices. You need coordinate compression, a map, or sorting.
- **`n ≤ 10⁹` with no array given** means the input is a number, not a list. The answer is maths or binary search on the answer, never iteration.
- **A sum of `n` over all test cases** bounded separately (`Σn ≤ 2·10⁵`) means per-test overhead matters: do not allocate a size-10⁶ array inside each test.

## The overflow trap, concretely

This is the single most common wrong answer among people who have the right algorithm.

```cpp
#include <bits/stdc++.h>
using namespace std;

int main() {
    int n;
    cin >> n;
    vector<long long> a(n);
    for (long long& x : a) cin >> x;

    // WRONG for large inputs: the multiplication happens in int, overflows,
    // and only then widens to long long.
    int bad_n = n;
    long long wrong = bad_n * bad_n;

    // Right: at least one operand is already 64-bit, so the arithmetic is.
    long long right = 1LL * n * n;

    long long sum = 0;
    for (long long x : a) sum += x;          // accumulator is 64-bit

    cout << wrong << ' ' << right << ' ' << sum << '\n';
}
```

The rule: **the type of the expression is decided by its operands, not by where you store it.** `int * int` is an `int` even when assigned to a `long long`. Write `1LL *` in front, or make the variables `long long` to begin with.

Signed overflow in C++ is *undefined behaviour*, not a wraparound you can reason about — with optimisations on, the compiler is entitled to assume it never happens and may delete the check you wrote to detect it.

## Working the other direction

The table also tells you when to stop optimising. If `n ≤ 1000` and you have an O(n²) solution, it runs in 10⁶ operations. It is done. Spending twenty minutes finding the O(n log n) version earns zero extra points and risks a bug. Correct and fast enough beats elegant.

## Exercise

For each, name the intended complexity before reading the next line:

1. `1 ≤ n ≤ 18`, find the minimum cost tour of `n` cities.
2. `1 ≤ n ≤ 2·10⁵`, count pairs `i < j` with `a[i] + a[j] == k`.
3. `1 ≤ n ≤ 10¹²`, count integers below `n` divisible by 3 or 5.
4. `1 ≤ n ≤ 400`, length of the longest common subsequence of two strings.

Answers: (1) O(2ⁿ·n²) bitmask DP — 18 is the tell. (2) O(n log n) sort or O(n) hash map; a nested loop is 4·10¹⁰. (3) O(1) arithmetic — inclusion–exclusion; nothing can iterate to 10¹². (4) O(n²) two-dimensional DP, 1.6·10⁵ states, comfortable.
