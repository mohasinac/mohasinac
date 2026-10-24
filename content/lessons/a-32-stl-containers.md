---
slug: stl-containers
moduleSlug: cpp-for-cp
title: STL containers — picking the right one
sortOrder: 20
status: published
summary: What each container guarantees, what it costs, and the decision procedure for choosing between them under time pressure.
---

Choosing the container is most of the algorithm. Get it right and the code writes itself; get it wrong and you are fighting the structure.

## The comparison

| Container | Lookup | Insert | Ordered? | Use it when |
|---|---|---|---|---|
| `vector<T>` | O(1) by index | O(1) amortised at back | Insertion order | The default. Always start here |
| `array<T, N>` | O(1) | — | Fixed | Size known at compile time |
| `deque<T>` | O(1) by index | O(1) at both ends | Insertion order | You push at the front too |
| `set<T>` | O(log n) | O(log n) | Sorted | You need sorted order *and* membership |
| `map<K, V>` | O(log n) | O(log n) | Sorted by key | Sorted key-value, or you need `lower_bound` |
| `unordered_set<T>` | O(1) avg | O(1) avg | No | Membership only, no ordering needed |
| `unordered_map<K, V>` | O(1) avg | O(1) avg | No | Counting, lookup tables |
| `priority_queue<T>` | O(1) peek max | O(log n) | Partial | You repeatedly need the extreme element |
| `stack` / `queue` | O(1) ends | O(1) | — | You want the restriction documented |

## The decision procedure

Ask in this order:

1. **Do I need to look things up by key?** No → `vector`.
2. **Do I need the elements in sorted order, or range queries like "smallest element ≥ x"?** Yes → `map`/`set`. No → `unordered_map`/`unordered_set`.
3. **Do I only ever need the largest (or smallest)?** → `priority_queue`.
4. **Do I push and pop at both ends?** → `deque`.

Step 1 catches more cases than people expect. If you are going to iterate everything anyway, a `vector` of pairs that you sort once beats a `map` on both constant factor and cache behaviour.

## `vector` is the default for a reason

```cpp
#include <bits/stdc++.h>
using namespace std;

int main() {
    vector<int> v{5, 3, 8, 1};

    v.push_back(9);                      // O(1) amortised
    v.pop_back();                        // O(1)
    cout << v.size() << ' ' << v[0] << ' ' << v.back() << '\n';

    sort(v.begin(), v.end());            // O(n log n)
    for (int x : v) cout << x << ' ';
    cout << '\n';

    // 2-D: n rows, m columns, all zero.
    int n = 3, m = 4;
    vector<vector<int>> grid(n, vector<int>(m, 0));
    grid[1][2] = 7;
    cout << grid[1][2] << ' ' << grid.size() << 'x' << grid[0].size() << '\n';

    // Erasing from the middle is O(n) — it shifts everything after it.
    v.erase(v.begin() + 1);
    for (int x : v) cout << x << ' ';
    cout << '\n';
}
```

Contiguous memory makes it cache-friendly, which is why it beats `list` even for workloads that look like they want a linked list.

## `map` versus `unordered_map`

```cpp
#include <bits/stdc++.h>
using namespace std;

int main() {
    // Counting: the canonical unordered_map job.
    unordered_map<string, int> freq;
    for (string w : {"a", "b", "a", "c", "a"}) ++freq[w];
    // operator[] DEFAULT-CONSTRUCTS a missing key (int -> 0), which is what
    // makes ++freq[w] work. It also means a lookup can insert.
    cout << "a appears " << freq["a"] << " times\n";
    cout << "size after reading a missing key: ";
    (void)freq["zzz"];                  // inserted zzz = 0
    cout << freq.size() << '\n';

    // Use .count() or .find() when you must not insert.
    if (freq.count("qqq") == 0) cout << "qqq absent, and still absent\n";

    // map keeps keys sorted and supports range queries.
    map<int, string> events{{10, "ten"}, {30, "thirty"}, {20, "twenty"}};
    for (auto& [k, v] : events) cout << k << '=' << v << ' ';
    cout << '\n';

    // First key >= 15. unordered_map cannot do this at all.
    auto it = events.lower_bound(15);
    cout << "first >= 15 is " << it->first << '\n';
}
```

Two things there cause real bugs. **`operator[]` inserts** — reading a missing key grows the container, which is why `freq.size()` is 2 after the loop but 3 after one innocent-looking read. And **`unordered_map` has no ordering**, so iteration order is unspecified and may differ between runs; never print it directly and expect a stable answer.

The worst-case warning from the complexity lesson applies: `unordered_map` with integer keys is vulnerable to crafted input that collides every key into one bucket, turning your O(n) into O(n²). On a judge that permits hacks, mix the key (`x * 0x9E3779B1u`) or use `map` and accept the log.

## `priority_queue` defaults to a max-heap

The single most common surprise in the STL:

```cpp
#include <bits/stdc++.h>
using namespace std;

int main() {
    // Default: LARGEST on top.
    priority_queue<int> mx;
    for (int x : {3, 1, 4, 1, 5}) mx.push(x);
    cout << "max: " << mx.top() << '\n';

    // Min-heap: the incantation to memorise.
    priority_queue<int, vector<int>, greater<int>> mn;
    for (int x : {3, 1, 4, 1, 5}) mn.push(x);
    cout << "min: " << mn.top() << '\n';

    // Pairs compare lexicographically: first element, then second. Handy for
    // Dijkstra, where you push {distance, node}.
    priority_queue<pair<int, int>, vector<pair<int, int>>, greater<>> pq;
    pq.push({5, 100});
    pq.push({2, 200});
    cout << "closest: node " << pq.top().second << " at " << pq.top().first << '\n';
}
```

Also note `top()` returns the element and `pop()` returns nothing — you must read before popping.

## Iterator invalidation

Modifying a container while iterating it is undefined behaviour, and the symptom is a crash far from the cause:

```cpp
#include <bits/stdc++.h>
using namespace std;

int main() {
    vector<int> v{1, 2, 3, 4, 5, 6};

    // WRONG: push_back may reallocate, leaving `it` dangling.
    // for (auto it = v.begin(); it != v.end(); ++it) v.push_back(*it);

    // Right way to remove while iterating: erase returns the next valid
    // iterator.
    for (auto it = v.begin(); it != v.end(); ) {
        if (*it % 2 == 0) it = v.erase(it);
        else ++it;
    }
    for (int x : v) cout << x << ' ';
    cout << '\n';

    // Better: erase-remove, one pass, no iterator bookkeeping.
    vector<int> w{1, 2, 3, 4, 5, 6};
    w.erase(remove_if(w.begin(), w.end(), [](int x) { return x % 2 == 0; }), w.end());
    for (int x : w) cout << x << ' ';
    cout << '\n';
}
```

The rules in brief: `vector` invalidates everything on reallocation and everything after the point of an insert or erase; `map`/`set` invalidate only the erased element; `deque` invalidates all iterators on insertion but keeps references to elements valid.
