---
slug: range-structures
moduleSlug: ranges
title: Prefix sums, Fenwick trees and segment trees
sortOrder: 10
status: published
summary: Three answers to "sum of a range", at three points on the update-versus-query trade-off.
---

## The problem it solves

Given an array, answer many queries of the form "what is the sum of `a[l..r]`?" Reading the range costs O(r - l), so `q` queries cost O(q · n) — too slow at `n = q = 10⁵`.

Three structures solve it, and **which one you need depends entirely on whether the array changes.**

| | Build | Query | Point update |
|---|---|---|---|
| Prefix sums | O(n) | **O(1)** | O(n) — rebuild |
| Fenwick tree | O(n log n) | O(log n) | O(log n) |
| Segment tree | O(n) | O(log n) | O(log n) |

Prefix sums if the array is static. Fenwick if it changes and you only need sums. Segment tree if it changes and you need min, max, or anything else.

## 1. Prefix sums — static, O(1) queries

> **Invariant:** `prefix[i]` is the sum of the first `i` elements. `prefix[0] = 0`.

That leading zero is not decoration — it removes the `l == 0` special case entirely.

```cpp
#include <bits/stdc++.h>
using namespace std;

class PrefixSums {
public:
    explicit PrefixSums(const vector<long long>& a) : prefix_(a.size() + 1, 0) {
        for (size_t i = 0; i < a.size(); ++i) prefix_[i + 1] = prefix_[i] + a[i];
    }

    /** Sum of a[l..r] inclusive. */
    long long range(size_t l, size_t r) const {
        // The telescoping identity: (a[0..r]) - (a[0..l-1]). With the extra
        // leading zero, l = 0 needs no special handling.
        return prefix_[r + 1] - prefix_[l];
    }

private:
    vector<long long> prefix_;
};

int main() {
    vector<long long> a{3, 1, 4, 1, 5, 9};
    PrefixSums ps{a};
    cout << ps.range(0, 2) << ' '        // 3+1+4 = 8
         << ps.range(2, 4) << ' '        // 4+1+5 = 10
         << ps.range(0, 5) << '\n';      // 23
}
```

O(n) to build, O(1) per query, trivial to write. If the array is static, stop here — the other two structures are strictly worse for this case.

## 2. Fenwick tree — updates, sums only

Also called a **binary indexed tree**. Each index stores the sum of a block whose length is the lowest set bit of that index, which is why the whole structure is twenty lines of bit manipulation.

> **Invariant:** `tree_[i]` holds the sum of the `i & -i` elements ending at position `i`, in 1-based indexing.

```cpp
#include <bits/stdc++.h>
using namespace std;

class Fenwick {
public:
    explicit Fenwick(int n) : n_(n), tree_(n + 1, 0) {}

    /** Add delta at index i (0-based). */
    void add(int i, long long delta) {
        // 1-based internally. i & -i isolates the lowest set bit, which is
        // exactly the jump to the next index responsible for this position.
        for (++i; i <= n_; i += i & -i) tree_[i] += delta;
    }

    /** Sum of the first i elements, i.e. a[0..i-1]. */
    long long prefix(int i) const {
        long long total = 0;
        for (; i > 0; i -= i & -i) total += tree_[i];
        return total;
    }

    /** Sum of a[l..r] inclusive, 0-based. */
    long long range(int l, int r) const { return prefix(r + 1) - prefix(l); }

private:
    int n_;
    vector<long long> tree_;
};

int main() {
    vector<long long> a{3, 1, 4, 1, 5, 9};
    Fenwick f{(int)a.size()};
    for (int i = 0; i < (int)a.size(); ++i) f.add(i, a[i]);

    cout << f.range(0, 2) << ' ' << f.range(2, 4) << '\n';   // 8 10

    f.add(2, 10);                        // a[2] becomes 14
    cout << f.range(2, 4) << '\n';       // 20 — update was O(log n)
}
```

Both loops run at most log n times, because each step clears one bit. Note `add` takes a **delta**, not a new value: to set `a[i] = v` you must `add(i, v - current)`, and tracking `current` yourself is the usual bug.

## 3. Segment tree — updates, any associative operation

A Fenwick tree only does invertible operations like sums (the query is a subtraction). For **minimum**, there is no subtraction, so you need a structure that stores the answer for each node's range explicitly.

> **Invariant:** every node holds the combined value of its range; a leaf holds one element; an internal node holds `combine(left child, right child)`.

```cpp
#include <bits/stdc++.h>
using namespace std;

/** Range minimum with point updates. Iterative, in a flat array of size 2n. */
class SegmentTree {
public:
    explicit SegmentTree(const vector<long long>& a) : n_((int)a.size()), tree_(2 * a.size()) {
        // Leaves occupy [n_, 2n_); internal node i has children 2i and 2i+1.
        for (int i = 0; i < n_; ++i) tree_[n_ + i] = a[i];
        for (int i = n_ - 1; i > 0; --i) tree_[i] = combine(tree_[2 * i], tree_[2 * i + 1]);
    }

    void set(int i, long long value) {
        tree_[i += n_] = value;
        // Walk to the root recombining. Only the ancestors of one leaf change.
        for (i /= 2; i >= 1; i /= 2) tree_[i] = combine(tree_[2 * i], tree_[2 * i + 1]);
    }

    /** Minimum of a[l..r] inclusive. */
    long long range(int l, int r) const {
        long long result = kIdentity;
        // Half-open [l, r+1) internally, climbing from both ends inward.
        for (l += n_, r += n_ + 1; l < r; l /= 2, r /= 2) {
            if (l & 1) result = combine(result, tree_[l++]);
            if (r & 1) result = combine(result, tree_[--r]);
        }
        return result;
    }

private:
    // Change these two lines and the whole structure becomes a max tree, a
    // sum tree, or a gcd tree. The algorithm only needs associativity.
    static constexpr long long kIdentity = LLONG_MAX;
    static long long combine(long long a, long long b) { return min(a, b); }

    int n_;
    vector<long long> tree_;
};

int main() {
    vector<long long> a{5, 2, 8, 1, 9, 3};
    SegmentTree st{a};

    cout << st.range(0, 2) << ' '        // min(5,2,8) = 2
         << st.range(3, 5) << ' '        // min(1,9,3) = 1
         << st.range(0, 5) << '\n';      // 1

    st.set(3, 7);                        // a[3] = 7
    cout << st.range(3, 5) << '\n';      // min(7,9,3) = 3
}
```

The only requirement on `combine` is **associativity**, plus an identity element. Sum, min, max, gcd, bitwise and/or all qualify. "The average" does not, which is the standard way to test whether someone has understood the structure.

## Choosing, in practice

Ask two questions:

1. **Does the array change?** No → prefix sums. Done.
2. **Is the operation a sum (or otherwise invertible)?** Yes → Fenwick, because it is shorter and faster. No → segment tree.

## Pitfalls

- **Off-by-one at the boundary.** Prefix arrays are size `n + 1`; Fenwick is 1-based internally; the segment tree above takes an inclusive range and converts. Pick a convention per structure, write it in a comment, and never deviate — this is the [interval-convention rule](/learn/foundations/edge-cases-and-dry-running) applied.
- **Overflow.** Summing 10⁵ values of 10⁹ exceeds `int` by four orders of magnitude. Every accumulator here is `long long` deliberately.
- **Passing a value to Fenwick's `add`** when it wants a delta.
- **Using a Fenwick tree for minimum.** There is no inverse for `min`, so `prefix(r) - prefix(l)` is meaningless. Silently wrong answers.
- **The wrong identity.** A min-tree needs `LLONG_MAX`; a sum-tree needs `0`. Using `0` for a min-tree makes every query return 0.
- **Reaching for a segment tree on a static array.** Prefix sums are O(1) per query and five lines.

## Problems that use it

Range sum query — immutable (prefix sums) · range sum query — mutable (Fenwick) · count of smaller numbers after self (Fenwick over values) · subarray sum equals k (prefix sums plus a hash map) · product of array except self (prefix and suffix products) · range minimum query (segment tree) · the longest-increasing-subsequence O(n log n) solution.
