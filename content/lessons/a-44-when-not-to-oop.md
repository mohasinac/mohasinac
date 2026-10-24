---
slug: when-not-to-use-oop
moduleSlug: oop
title: When not to use OOP in a contest
sortOrder: 40
status: published
summary: The honest counterweight to the previous three lessons — because the design that teaches best is not always the design that scores.
---

The previous three lessons argued for classes, invariants and interfaces. This one argues against using them in a timed contest, and both positions are correct, because they optimise for different things.

- **Learning** optimises for understanding. Writing a BST as a class with its invariant stated is how you come to understand a BST.
- **A contest** optimises for correct output before the clock runs out. Nothing else scores.

Confusing the two is a real cost, in both directions.

## What a contest solution actually looks like

A graph problem, solved the way it is solved under time pressure:

```cpp
#include <bits/stdc++.h>
using namespace std;

int main() {
    ios_base::sync_with_stdio(false);
    cin.tie(nullptr);

    int n, m;
    cin >> n >> m;

    // No Graph class. No Vertex class. An adjacency list is a
    // vector<vector<int>>, and everyone reading this knows that instantly.
    vector<vector<int>> adj(n);
    for (int i = 0; i < m; ++i) {
        int u, v;
        cin >> u >> v;
        adj[u].push_back(v);
        adj[v].push_back(u);
    }

    // BFS from 0.
    vector<int> dist(n, -1);
    queue<int> q;
    dist[0] = 0;
    q.push(0);
    while (!q.empty()) {
        int u = q.front();
        q.pop();
        for (int v : adj[u]) {
            if (dist[v] == -1) {
                dist[v] = dist[u] + 1;
                q.push(v);
            }
        }
    }

    for (int d : dist) cout << d << ' ';
    cout << '\n';
}
```

Thirty lines. A `Graph` class with `addEdge`, a `Vertex` type, an iterator and a `BFSTraversal` strategy would be 150 lines, take fifteen minutes longer, and produce identical output. In a contest those fifteen minutes are the difference between solving the next problem and not.

## The specific costs of abstraction under a clock

- **Typing time is the scarcest resource.** Every line is also a chance to introduce a typo.
- **Virtual calls in an inner loop are measurably slow**, and TLE is a real failure mode. A loop over 10⁷ edges cannot afford an indirect call per edge.
- **Indirection hurts cache behaviour.** `vector<vector<int>>` is already two levels; `vector<unique_ptr<Vertex>>` is three, each a potential cache miss.
- **Encapsulation prevents the hacks you need.** When the fix is "reuse the distance array as a visited marker", a private member is an obstacle, not a protection.
- **Debugging is harder.** With twenty minutes left you want to print a variable, not navigate three layers to find where the state lives.

## Where a class still pays, even in a contest

Not never — just specifically:

```cpp
#include <bits/stdc++.h>
using namespace std;

// Worth it: the invariant is subtle, the implementation is error-prone, and
// you will reuse this verbatim in many problems. Wrapping it means you write
// path compression correctly once rather than every time.
class DSU {
public:
    explicit DSU(int n) : parent_(n), size_(n, 1) {
        iota(parent_.begin(), parent_.end(), 0);
    }

    int find(int x) {
        while (parent_[x] != x) {
            parent_[x] = parent_[parent_[x]];    // path halving
            x = parent_[x];
        }
        return x;
    }

    bool unite(int a, int b) {
        a = find(a);
        b = find(b);
        if (a == b) return false;
        if (size_[a] < size_[b]) swap(a, b);     // union by size
        parent_[b] = a;
        size_[a] += size_[b];
        return true;
    }

    bool same(int a, int b) { return find(a) == find(b); }

private:
    vector<int> parent_;
    vector<int> size_;
};

int main() {
    DSU dsu{5};
    dsu.unite(0, 1);
    dsu.unite(3, 4);
    cout << boolalpha << dsu.same(0, 1) << ' ' << dsu.same(0, 3) << '\n';
}
```

The pattern: **a class is worth it when it is a reusable component with a tricky invariant.** DSU, segment trees, modular-arithmetic types, big integers, geometry primitives — these go in your personal template library and get pasted in. A `Vertex` class for one BFS does not.

## The honest summary

| Situation | Write |
|---|---|
| Learning a structure for the first time | A full class, invariant stated, operations named |
| A reusable library component (DSU, segment tree) | A class — you will paste it for years |
| A one-off solution under time pressure | Flat functions and STL containers |
| Production software | Classes, interfaces, the rule of zero |

Both skills are real and they are separate. Track B teaches you structures by making you build them properly, because that is how understanding happens. Track C's solutions are mostly flat functions, because that is what a contest rewards.

> Learn it as a class. Solve it as a function. Keep the classes that are worth keeping.
