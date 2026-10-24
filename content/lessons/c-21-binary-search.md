---
slug: binary-search-on-the-answer
moduleSlug: search
title: Binary search on the answer
sortOrder: 10
status: published
summary: The technique that applies when there is no sorted array in sight — searching the space of possible answers instead of the input.
---

## Part 1: get plain binary search right

Write it with **half-open bounds** `[lo, hi)` and the bug class disappears.

```cpp
#include <bits/stdc++.h>
using namespace std;

/** Index of target, or -1. Half-open [lo, hi). */
int bsearch(const vector<int>& a, int target) {
    int lo = 0, hi = (int)a.size();          // hi is ONE PAST the end
    while (lo < hi) {
        // lo + (hi - lo) / 2, not (lo + hi) / 2: the latter overflows when
        // both are near INT_MAX. Harmless here, a real bug on large bounds.
        int mid = lo + (hi - lo) / 2;
        if (a[mid] == target) return mid;
        if (a[mid] < target) lo = mid + 1;   // mid is ruled out — hence +1
        else hi = mid;                       // mid is ruled out, and hi is
                                             // exclusive, so no -1
    }
    return -1;
}

int main() {
    vector<int> a{1, 3, 5, 7, 9, 11};
    for (int t : {1, 7, 11, 4}) cout << bsearch(a, t) << ' ';
    cout << '\n';                            // 0 3 5 -1
}
```

The two asymmetric updates — `mid + 1` versus `mid` — are what guarantee progress. As the [dry-running lesson](/learn/foundations/edge-cases-and-dry-running) showed, writing `lo = mid` is an infinite loop.

In a contest, use `lower_bound` and `upper_bound` instead; write this only when the predicate is custom.

## Watch the range halve

Play this before reading on. Every step strikes out the half that has just been ruled out — that elimination is the whole algorithm, and the step count is the thing to notice.

```viz
{ "demo": "binarySearch", "values": [1, 3, 5, 7, 9, 11, 13, 15], "target": 13, "title": "binary search for 13" }
```

For contrast, the same search checking every position in turn:

```viz
{ "demo": "linearSearch", "values": [1, 3, 5, 7, 9, 11, 13, 15], "target": 13, "title": "linear search for 13" }
```

## Part 2: searching the answer space

Here is the real power. Some problems have no sorted array at all, but the *answer* has a monotonic property:

> If `x` works, then everything larger than `x` also works (or everything smaller does).

When that holds, the answers form a sorted boolean sequence `false false … false true true … true`, and you can binary search for the boundary — even though nothing in the input is sorted.

The template:

```cpp
#include <bits/stdc++.h>
using namespace std;

/**
 * Minimum ship capacity to move all weights within `days` days, loading in
 * order. Classic shape: a feasibility check that is monotonic in capacity.
 */
int least_capacity(const vector<int>& weights, int days) {
    // The predicate: can we finish within `days` using this capacity?
    auto feasible = [&](long long capacity) {
        int used = 1;
        long long load = 0;
        for (int w : weights) {
            if (w > capacity) return false;      // one item never fits
            if (load + w > capacity) {           // start a new day
                ++used;
                load = 0;
            }
            load += w;
        }
        return used <= days;
    };

    // Bounds matter: lo must be a capacity that might work (the largest single
    // item), hi one that certainly does (everything in one day).
    long long lo = *max_element(weights.begin(), weights.end());
    long long hi = accumulate(weights.begin(), weights.end(), 0LL);

    // Find the FIRST capacity that is feasible — the boundary of the
    // false...true sequence.
    while (lo < hi) {
        long long mid = lo + (hi - lo) / 2;
        if (feasible(mid)) hi = mid;             // mid might be the answer
        else lo = mid + 1;                       // mid is definitely too small
    }
    return (int)lo;
}

int main() {
    cout << least_capacity({1, 2, 3, 4, 5, 6, 7, 8, 9, 10}, 5) << '\n';   // 15
    cout << least_capacity({3, 2, 2, 4, 1, 4}, 3) << '\n';                // 6
    cout << least_capacity({1, 2, 3, 1, 1}, 4) << '\n';                   // 3
}
```

Every problem of this shape is the same four decisions:

1. **What is the answer's type and range?** Here, a capacity in `[max weight, total weight]`.
2. **Write `feasible(x)`** — a function answering "is `x` good enough?" This is usually a straightforward greedy simulation.
3. **Verify monotonicity.** If capacity `x` suffices, does `x + 1`? Obviously yes here. *If this fails, binary search is invalid* — this is the step people skip.
4. **Search for the boundary** with the template above.

The cost is O(log(range) × cost of `feasible`), which turns an intractable search over answers into a handful of simulations.

## Recognition signals

The giveaway phrases:

- "minimum/maximum value such that …"
- "minimise the largest …" or "maximise the smallest …"
- A huge answer range (`10⁹`, `10¹²`) with a small `n`
- Checking a candidate answer is easy, but constructing the best one directly is not

## The rotated-array variant

A different use: the array is sorted but rotated, so you binary search on *which half is ordered*.

```cpp
#include <bits/stdc++.h>
using namespace std;

int search_rotated(const vector<int>& a, int target) {
    int lo = 0, hi = (int)a.size() - 1;
    while (lo <= hi) {
        int mid = lo + (hi - lo) / 2;
        if (a[mid] == target) return mid;

        // One half is always properly sorted. Identify it, then decide
        // whether the target lies inside it.
        if (a[lo] <= a[mid]) {                     // left half is sorted
            if (a[lo] <= target && target < a[mid]) hi = mid - 1;
            else lo = mid + 1;
        } else {                                   // right half is sorted
            if (a[mid] < target && target <= a[hi]) lo = mid + 1;
            else hi = mid - 1;
        }
    }
    return -1;
}

int main() {
    vector<int> a{4, 5, 6, 7, 0, 1, 2};
    for (int t : {0, 4, 2, 3}) cout << search_rotated(a, t) << ' ';
    cout << '\n';                                  // 4 0 6 -1
}
```

This one uses closed bounds `[lo, hi]`, because the comparisons reference `a[hi]`. That is fine — what matters is choosing a convention per function and being consistent inside it.

## Pitfalls

- **`(lo + hi) / 2` overflowing.** Use `lo + (hi - lo) / 2` by habit.
- **`lo = mid` instead of `mid + 1`.** Infinite loop.
- **Mismatched bounds and loop condition.** `[lo, hi)` pairs with `lo < hi`; `[lo, hi]` pairs with `lo <= hi`.
- **Not verifying monotonicity.** Binary searching a non-monotonic predicate returns an arbitrary answer, confidently.
- **Wrong initial bounds.** `lo` too high excludes the answer; too low makes `feasible` wrong rather than merely slow. In the ship problem, starting `lo` at 1 would be fine only because `feasible` explicitly rejects an item larger than the capacity — without that guard it would loop forever on a day.
- **Floating-point binary search.** Do not use `lo < hi`; iterate a fixed 100 times, or until `hi - lo < 1e-9`.

## Problems that use it

Binary search · search a 2D matrix · search in rotated sorted array · find minimum in rotated sorted array · koko eating bananas · capacity to ship packages · split array largest sum · median of two sorted arrays · time-based key-value store · find peak element.
