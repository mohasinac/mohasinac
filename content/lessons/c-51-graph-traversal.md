---
slug: graph-traversal-patterns
moduleSlug: graph-patterns
title: Graph traversal patterns
sortOrder: 10
status: published
summary: BFS versus DFS as a decision, topological order, and Dijkstra — the three templates that cover most graph problems.
---

## BFS or DFS — a decision, not a preference

| Need | Use |
|---|---|
| Shortest path, unweighted | **BFS** — only BFS gives this |
| Any path, reachability, components | Either; DFS is shorter |
| Cycle detection | DFS with a recursion-stack marker |
| Topological order | DFS post-order, or Kahn's BFS |
| Shortest path, weighted non-negative | Dijkstra (BFS with a priority queue) |
| Level-by-level processing | BFS with the level-size snapshot |

Swapping BFS for DFS when you need a shortest path gives *a* path, not the shortest — a wrong answer that passes the sample.

BFS from node 0, one layer at a time:

```viz
{ "demo": "bfs", "graph": [[1, 2], [0, 3], [0, 3], [1, 2, 4], [3]], "start": 0, "title": "BFS, layer by layer" }
```

## Counting components (flood fill)

```cpp
#include <bits/stdc++.h>
using namespace std;

int count_islands(vector<string> grid) {
    if (grid.empty()) return 0;
    int rows = (int)grid.size(), cols = (int)grid[0].size(), islands = 0;
    const int dr[] = {-1, 1, 0, 0}, dc[] = {0, 0, -1, 1};

    for (int r = 0; r < rows; ++r) {
        for (int c = 0; c < cols; ++c) {
            if (grid[r][c] != '1') continue;
            ++islands;

            // Iterative flood fill. Recursion would overflow the stack on a
            // 1000x1000 all-land grid — 10^6 deep.
            stack<pair<int, int>> st;
            st.push({r, c});
            grid[r][c] = '0';                  // mark at PUSH time

            while (!st.empty()) {
                auto [cr, cc] = st.top();
                st.pop();
                for (int d = 0; d < 4; ++d) {
                    int nr = cr + dr[d], nc = cc + dc[d];
                    if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
                    if (grid[nr][nc] != '1') continue;
                    grid[nr][nc] = '0';        // mark before pushing
                    st.push({nr, nc});
                }
            }
        }
    }
    return islands;
}

int main() {
    cout << count_islands({"11000", "11000", "00100", "00011"}) << '\n';   // 3
    cout << count_islands({"000", "000"}) << '\n';                         // 0
}
```

Marking at push time rather than pop time keeps each cell out of the stack more than once. With pop-time marking the stack can grow to O(4n) and the same cell is processed repeatedly.

## Topological sort (Kahn's algorithm)

Only a **DAG** has a topological order, so this doubles as cycle detection: if fewer than `n` vertices come out, the leftovers are in a cycle.

```cpp
#include <bits/stdc++.h>
using namespace std;

/** Topological order, or empty if a cycle exists. */
vector<int> topo_sort(int n, const vector<pair<int, int>>& edges) {
    vector<vector<int>> adj(n);
    vector<int> in_degree(n, 0);
    for (auto [u, v] : edges) {              // u must come before v
        adj[u].push_back(v);
        ++in_degree[v];
    }

    queue<int> ready;
    for (int v = 0; v < n; ++v)
        if (in_degree[v] == 0) ready.push(v);     // nothing blocks these

    vector<int> order;
    while (!ready.empty()) {
        int u = ready.front();
        ready.pop();
        order.push_back(u);
        for (int v : adj[u])
            if (--in_degree[v] == 0) ready.push(v);   // last blocker removed
    }

    // Short order => some vertices never reached in-degree 0 => cycle.
    if ((int)order.size() != n) return {};
    return order;
}

int main() {
    auto a = topo_sort(4, {{0, 1}, {0, 2}, {1, 3}, {2, 3}});
    for (int v : a) cout << v << ' ';
    cout << '\n';                            // 0 1 2 3  (0 2 1 3 also valid)

    auto cyclic = topo_sort(2, {{0, 1}, {1, 0}});
    cout << (cyclic.empty() ? "cycle detected\n" : "ordered\n");
}
```

This is exactly the "course schedule" problem: can all courses be taken given prerequisites? Equivalent to asking whether the prerequisite graph is a DAG.

## Dijkstra — weighted shortest paths

BFS with a priority queue in place of the queue. Requires **non-negative** weights; with negative edges it silently returns wrong answers and you need Bellman–Ford.

```cpp
#include <bits/stdc++.h>
using namespace std;

vector<long long> dijkstra(int n, const vector<vector<pair<int, int>>>& adj, int src) {
    const long long kInf = LLONG_MAX / 4;              // /4 leaves headroom
    vector<long long> dist(n, kInf);
    // Min-heap of {distance, vertex}.
    priority_queue<pair<long long, int>, vector<pair<long long, int>>, greater<>> pq;

    dist[src] = 0;
    pq.push({0, src});

    while (!pq.empty()) {
        auto [d, u] = pq.top();
        pq.pop();
        // A heap has no decrease-key, so we push duplicates and discard the
        // stale ones here. This check is what keeps the complexity right.
        if (d > dist[u]) continue;

        for (auto [v, w] : adj[u]) {
            if (d + w < dist[v]) {
                dist[v] = d + w;
                pq.push({dist[v], v});
            }
        }
    }
    return dist;
}

int main() {
    int n = 4;
    vector<vector<pair<int, int>>> adj(n);
    auto edge = [&](int u, int v, int w) {
        adj[u].push_back({v, w});
        adj[v].push_back({u, w});
    };
    edge(0, 1, 1);
    edge(1, 2, 2);
    edge(0, 2, 5);
    edge(2, 3, 1);

    for (long long d : dijkstra(n, adj, 0)) cout << d << ' ';
    cout << '\n';                            // 0 1 3 4
}
```

Two details that matter: `kInf` as `LLONG_MAX / 4` so `d + w` cannot overflow, and the `if (d > dist[u]) continue;` stale check without which the queue degenerates.

## Cycle detection in a directed graph

Needs three states, not two. A vertex already finished is fine to revisit; a vertex still on the current path is a cycle.

```cpp
#include <bits/stdc++.h>
using namespace std;

bool has_cycle_directed(int n, const vector<pair<int, int>>& edges) {
    vector<vector<int>> adj(n);
    for (auto [u, v] : edges) adj[u].push_back(v);

    // 0 = unvisited, 1 = on the current path, 2 = fully explored.
    vector<int> state(n, 0);

    function<bool(int)> visit = [&](int u) {
        state[u] = 1;
        for (int v : adj[u]) {
            if (state[v] == 1) return true;          // back edge: a cycle
            if (state[v] == 0 && visit(v)) return true;
            // state[v] == 2: already done, and acyclic. Not a cycle.
        }
        state[u] = 2;
        return false;
    };

    for (int v = 0; v < n; ++v)
        if (state[v] == 0 && visit(v)) return true;
    return false;
}

int main() {
    cout << boolalpha;
    cout << has_cycle_directed(3, {{0, 1}, {1, 2}}) << '\n';            // false
    cout << has_cycle_directed(3, {{0, 1}, {1, 2}, {2, 0}}) << '\n';    // true
    // A "diamond" revisits vertex 3 but is acyclic — the two-state version
    // would wrongly report a cycle here.
    cout << has_cycle_directed(4, {{0, 1}, {0, 2}, {1, 3}, {2, 3}}) << '\n';  // false
}
```

The diamond case is why two states are not enough: a simple `visited` flag reports a cycle for any re-reached vertex, including a legitimately shared descendant.

## Pitfalls

- **DFS when the problem says shortest.**
- **Marking visited at pop time** in BFS — admits duplicates and non-shortest distances.
- **Two-state cycle detection on a directed graph.**
- **Recursive DFS on 10⁵+ vertices.** Stack overflow; iterate.
- **Dijkstra with negative weights.** Use Bellman–Ford.
- **Infinity overflowing.** `LLONG_MAX + w` is UB.
- **Forgetting disconnected components** — loop over all start vertices, not just vertex 0.

## Problems that use it

Number of islands · clone graph · pacific atlantic water flow · surrounded regions · rotting oranges · course schedule I and II · alien dictionary · word ladder · network delay time · cheapest flights within k stops · graph valid tree.
