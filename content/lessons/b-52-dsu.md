---
slug: disjoint-set-union
moduleSlug: graphs
title: Disjoint set union
sortOrder: 20
status: published
summary: Union-find — twenty lines, two optimisations, and effectively constant time. The best value-per-line structure in competitive programming.
---

## The problem it solves

You are given a stream of statements — "`a` and `b` are in the same group" — interleaved with questions — "are `x` and `y` in the same group?"

Rebuilding a graph and running BFS per query is O(q · n). DSU answers both operations in effectively O(1), and the implementation is short enough to write from memory.

## The invariant

> Each element points to a parent. Following parents from any element terminates at that element's unique **root**. Two elements are in the same set exactly when they share a root.

The root is an arbitrary representative — it has no meaning except identity. Everything DSU does is "find your root" and "make one root point at another".

## The implementation

```cpp
#include <bits/stdc++.h>
using namespace std;

/**
 * Disjoint set union with path compression and union by size.
 *
 * Both optimisations are required. With neither, a chain of unions builds a
 * linked list and find becomes O(n).
 */
class DSU {
public:
    explicit DSU(int n) : parent_(n), size_(n, 1), components_(n) {
        // Every element starts as its own root: parent_[i] = i.
        iota(parent_.begin(), parent_.end(), 0);
    }

    /** Root of x, compressing the path as it walks. */
    int find(int x) {
        // Path compression: point every node on the path directly at the
        // root, so the next find on any of them is one step. Iterative, so
        // there is no stack-depth limit.
        int root = x;
        while (parent_[root] != root) root = parent_[root];
        while (parent_[x] != root) {
            int next = parent_[x];
            parent_[x] = root;
            x = next;
        }
        return root;
    }

    /** Merge the sets of a and b. Returns false if already together. */
    bool unite(int a, int b) {
        a = find(a);
        b = find(b);
        if (a == b) return false;              // already one set

        // Union by size: attach the SMALLER tree under the larger, which
        // bounds the height at O(log n) even before compression.
        if (size_[a] < size_[b]) swap(a, b);
        parent_[b] = a;
        size_[a] += size_[b];
        --components_;
        return true;
    }

    bool same(int a, int b) { return find(a) == find(b); }

    /** Size of the set containing x. */
    int set_size(int x) { return size_[find(x)]; }

    /** How many disjoint sets remain. */
    int components() const { return components_; }

private:
    vector<int> parent_;
    vector<int> size_;
    int components_;
};

int main() {
    DSU dsu{6};
    cout << dsu.components() << '\n';                 // 6

    dsu.unite(0, 1);
    dsu.unite(1, 2);
    dsu.unite(4, 5);

    cout << boolalpha << dsu.same(0, 2) << ' ' << dsu.same(0, 3) << '\n';
    cout << dsu.set_size(0) << ' ' << dsu.set_size(3) << '\n';   // 3 1
    cout << dsu.components() << '\n';                            // 3

    cout << dsu.unite(0, 2) << '\n';                  // false — already same
}
```

## Why the two optimisations are not optional

**Path compression** flattens the tree during `find`. **Union by size** (or rank) keeps the tree shallow during `unite`. Together they give an amortised cost of O(α(n)) — the inverse Ackermann function, which is below 5 for any `n` you could store. Effectively constant.

With neither, uniting 1, 2, 3, … in order builds a path of length `n` and `find` becomes O(n). The difference is measurable at `n = 10⁵` and decisive at 10⁶:

```cpp
#include <bits/stdc++.h>
using namespace std;

// Deliberately naive: no compression, no union by size.
struct SlowDSU {
    vector<int> parent;
    explicit SlowDSU(int n) : parent(n) { iota(parent.begin(), parent.end(), 0); }
    int find(int x) {
        while (parent[x] != x) x = parent[x];       // no compression
        return x;
    }
    void unite(int a, int b) { parent[find(a)] = find(b); }   // arbitrary direction
};

int main() {
    const int n = 20000;

    SlowDSU slow{n};
    for (int i = 0; i + 1 < n; ++i) slow.unite(i, i + 1);     // builds a chain
    long long steps = 0;
    for (int x = slow.parent[0]; slow.parent[x] != x; x = slow.parent[x]) ++steps;
    cout << "naive chain depth from 0: " << steps << '\n';     // ~n, linear

    // The optimised version keeps everything within a few hops.
    vector<int> p(n), sz(n, 1);
    iota(p.begin(), p.end(), 0);
    auto find = [&](int x) {
        int r = x;
        while (p[r] != r) r = p[r];
        while (p[x] != r) { int nx = p[x]; p[x] = r; x = nx; }
        return r;
    };
    for (int i = 0; i + 1 < n; ++i) {
        int a = find(i), b = find(i + 1);
        if (a == b) continue;
        if (sz[a] < sz[b]) swap(a, b);
        p[b] = a;
        sz[a] += sz[b];
    }
    long long steps2 = 0;
    for (int x = 0; p[x] != x; x = p[x]) ++steps2;
    cout << "optimised depth from 0: " << steps2 << '\n';      // 0 or 1
}
```

## Note on `find` being non-const

`find` mutates `parent_` while compressing, so it cannot be `const`. That in turn makes `same` and `set_size` non-const. This is a genuine case where the physical state changes but the logical state does not — the standard answer is `mutable` members, which is more ceremony than a contest structure deserves. Worth recognising as a real design tension rather than an oversight.

## The two canonical applications

**Counting connected components** — one pass, no traversal:

```cpp
#include <bits/stdc++.h>
using namespace std;

int main() {
    // 0-1, 2-3-4, 5 alone
    const int n = 6;
    vector<pair<int, int>> edges{{0, 1}, {2, 3}, {3, 4}};

    vector<int> p(n), sz(n, 1);
    iota(p.begin(), p.end(), 0);
    int components = n;

    function<int(int)> find = [&](int x) {
        while (p[x] != x) { p[x] = p[p[x]]; x = p[x]; }   // path halving
        return x;
    };

    for (auto [u, v] : edges) {
        int a = find(u), b = find(v);
        if (a == b) continue;
        if (sz[a] < sz[b]) swap(a, b);
        p[b] = a;
        sz[a] += sz[b];
        --components;
    }
    cout << components << '\n';                           // 3
}
```

**Cycle detection in an undirected graph** — `unite` returning `false` means both endpoints were already connected, so this edge closes a cycle. That one fact makes DSU the heart of Kruskal's minimum spanning tree: sort edges by weight, add each one whose `unite` succeeds, skip the rest.

## Complexity

| Operation | Cost |
|---|---|
| Construction | O(n) |
| `find` | O(α(n)) amortised — effectively O(1) |
| `unite` | O(α(n)) amortised |
| `components` | O(1) |
| Memory | O(n) |

Without both optimisations: O(n) per operation, worst case.

## Pitfalls

- **Skipping either optimisation.** The structure still works and is quietly O(n).
- **`parent_[a] = b` without `find` first.** You must link *roots*, not arbitrary elements, or the invariant breaks.
- **Updating `size_` at the wrong node.** It is only meaningful at a root; `size_[a] += size_[b]` must come after both are roots and `a` is the new root.
- **Recursive `find` on 10⁶ elements** before any compression has happened. Iterate.
- **Trying to split a set.** DSU cannot un-unite. If you need deletions, you need a different structure, or you process the queries offline in reverse.
- **Mixing 1-based input with a size-`n` array.** Size it `n + 1` or convert on read.

## Problems that use it

Number of connected components in an undirected graph · graph valid tree · redundant connection · accounts merge · number of islands (the DSU alternative to flood fill) · satisfiability of equality equations · Kruskal's MST.
