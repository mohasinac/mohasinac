---
slug: graph-representations
moduleSlug: graphs
title: Graph representations
sortOrder: 10
status: published
summary: Adjacency list versus matrix — a choice made by density, and the one that decides whether your solution fits in memory.
---

## The problem it solves

A graph is a set of vertices and edges. Before any algorithm, you must decide how to store it, and the choice is driven by two numbers: `n` vertices and `m` edges.

## The three representations

```cpp
#include <bits/stdc++.h>
using namespace std;

int main() {
    const int n = 4;
    vector<pair<int, int>> edges{{0, 1}, {0, 2}, {1, 3}};

    // 1. EDGE LIST — just the edges. O(m) memory. Useless for "neighbours of
    // u" (O(m) scan), but it is exactly what Kruskal's MST wants, because
    // Kruskal sorts edges and never asks for neighbours.
    for (auto [u, v] : edges) cout << u << '-' << v << ' ';
    cout << "| edge list\n";

    // 2. ADJACENCY LIST — the default. O(n + m) memory, neighbours in O(deg).
    vector<vector<int>> adj(n);
    for (auto [u, v] : edges) {
        adj[u].push_back(v);
        adj[v].push_back(u);              // omit this line for a DIRECTED graph
    }
    for (int u = 0; u < n; ++u) {
        cout << u << ": ";
        for (int v : adj[u]) cout << v << ' ';
        cout << "| ";
    }
    cout << "adjacency list\n";

    // 3. ADJACENCY MATRIX — O(n^2) memory, O(1) "is u-v an edge?".
    vector<vector<int>> mat(n, vector<int>(n, 0));
    for (auto [u, v] : edges) mat[u][v] = mat[v][u] = 1;
    cout << "mat[0][1]=" << mat[0][1] << " mat[1][2]=" << mat[1][2]
         << " | adjacency matrix\n";

    // Weighted: store the weight alongside the destination.
    vector<vector<pair<int, long long>>> wadj(n);
    wadj[0].push_back({1, 7});
    wadj[1].push_back({0, 7});
    for (auto [v, w] : wadj[0]) cout << "0 -> " << v << " cost " << w << '\n';
}
```

An adjacency list, drawn as the graph it describes:

```viz
{ "demo": "bfs", "graph": [[1, 2], [0, 3], [0, 3], [1, 2, 4], [3]], "title": "the list, as a graph" }
```

## Choosing between them

The deciding question is **density**. A graph is dense when `m` approaches `n²`, sparse when `m` is closer to `n`. Real problem graphs are almost always sparse.

| | Adjacency list | Adjacency matrix |
|---|---|---|
| Memory | O(n + m) | O(n²) |
| Neighbours of `u` | O(deg u) | O(n) |
| Is `u–v` an edge? | O(deg u) | **O(1)** |
| Add an edge | O(1) | O(1) |
| Best when | Sparse (almost always) | Dense, or `n` small |

The memory column settles it. With `n = 10⁵`, a matrix is 10¹⁰ entries — 40 GB. Not an optimisation question; it simply does not fit. **Use an adjacency list unless `n ≤ ~1000`**, or the algorithm itself is matrix-shaped (Floyd–Warshall).

## Grids are graphs

Many problems are graphs in disguise. A grid needs no adjacency structure at all — the neighbours are computed:

```cpp
#include <bits/stdc++.h>
using namespace std;

int main() {
    vector<string> grid{
        "1100",
        "1000",
        "0010",
    };
    int rows = (int)grid.size(), cols = (int)grid[0].size();

    // The four directions, as parallel arrays. Writing them as one array of
    // pairs you iterate is less error-prone than four copy-pasted blocks.
    const int dr[] = {-1, 1, 0, 0};
    const int dc[] = {0, 0, -1, 1};

    // Flood fill one component with BFS.
    vector<vector<bool>> seen(rows, vector<bool>(cols, false));
    queue<pair<int, int>> q;
    q.push({0, 0});
    seen[0][0] = true;
    int cells = 0;

    while (!q.empty()) {
        auto [r, c] = q.front();
        q.pop();
        ++cells;
        for (int d = 0; d < 4; ++d) {
            int nr = r + dr[d], nc = c + dc[d];
            // The bounds check must come BEFORE the grid access, or you read
            // out of range. Short-circuit && guarantees the order.
            if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
            if (seen[nr][nc] || grid[nr][nc] != '1') continue;
            seen[nr][nc] = true;
            q.push({nr, nc});
        }
    }
    cout << "component size " << cells << '\n';     // 3
}
```

That bounds-check-then-access ordering is the single most common source of crashes in grid problems.

## Directed, weighted, and the vocabulary

- **Directed** — edges have direction. Add only `adj[u].push_back(v)`.
- **Weighted** — edges carry a cost. Store `pair<int, weight>`.
- **In-degree** — count of incoming edges. Central to topological sort.
- **Connected component** — a maximal set of mutually reachable vertices.
- **Cycle** — a path returning to its start. A connected undirected graph with no cycle is a **tree**, and has exactly `n - 1` edges.
- **DAG** — a directed acyclic graph; the only kind with a topological order.

## Reading input, with the trap

```cpp
#include <bits/stdc++.h>
using namespace std;

int main() {
    int n, m;
    if (!(cin >> n >> m)) return 0;
    vector<vector<int>> adj(n);
    for (int i = 0; i < m; ++i) {
        int u, v;
        cin >> u >> v;
        // Statements usually number vertices from 1. Converting to 0-based on
        // input means every array is sized n, not n+1, and one convention
        // holds everywhere.
        --u;
        --v;
        adj[u].push_back(v);
        adj[v].push_back(u);
    }
    for (int u = 0; u < n; ++u) cout << adj[u].size() << ' ';
    cout << '\n';
}
```

Mixing 1-based input with 0-based arrays is a guaranteed off-by-one. Convert once, at the read.

## Pitfalls

- **A matrix when `n` is large.** Out of memory, or a silent allocation failure.
- **Forgetting the reverse edge** on an undirected graph. Traversal then finds half the graph.
- **Self-loops and duplicate edges.** The statement often permits them; a visited check handles both, but degree counts will surprise you.
- **Mixed indexing.** Convert at input.
- **Grid bounds checked after access.**
- **Recursive DFS on a 10⁵-vertex path graph.** Stack overflow; use an explicit stack.

## Problems that use it

Number of islands · clone graph · course schedule · pacific atlantic water flow · graph valid tree · number of connected components · word ladder · rotting oranges · surrounded regions.
