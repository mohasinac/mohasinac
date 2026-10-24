---
slug: heaps
moduleSlug: trees
title: Heaps and priority queues
sortOrder: 20
status: published
summary: A tree stored in a flat array with no pointers at all — and the structure behind "top k" and Dijkstra.
---

## The problem it solves

You repeatedly need the smallest (or largest) element, and the collection keeps changing. A sorted array gives O(1) access to the minimum but O(n) insertion. Sorting after every insertion is worse.

A heap gives **O(1) peek** and **O(log n) insert and extract**. It achieves this by maintaining much less order than a sorted array — only enough to know where the extreme element is.

## The invariant

> **Heap property:** every node's key is `<=` both of its children's keys (a min-heap). Nothing is promised about siblings.
>
> **Shape:** the tree is *complete* — every level is full except possibly the last, which fills left to right.

The shape invariant is what allows the pointer-free representation. A complete binary tree maps onto an array with pure arithmetic:

```
parent(i) = (i - 1) / 2
left(i)   = 2i + 1
right(i)  = 2i + 2
```

No `Node` struct, no allocation per element, perfect cache locality.

## The implementation

```cpp
#include <bits/stdc++.h>
using namespace std;

/** A min-heap over ints. Invariant: heap_[i] <= heap_[2i+1], heap_[2i+2]. */
class MinHeap {
public:
    MinHeap() = default;

    /** Build from an unsorted array in O(n) — not O(n log n). */
    explicit MinHeap(vector<int> values) : heap_(std::move(values)) {
        // Sift down from the last internal node backwards. Leaves are already
        // valid heaps, so they need no work — which is why this is linear.
        for (int i = (int)heap_.size() / 2 - 1; i >= 0; --i) sift_down(i);
    }

    void push(int value) {
        heap_.push_back(value);
        sift_up((int)heap_.size() - 1);
    }

    optional<int> top() const {
        if (heap_.empty()) return nullopt;
        return heap_[0];                       // the root is the minimum
    }

    optional<int> pop() {
        if (heap_.empty()) return nullopt;
        int smallest = heap_[0];
        // Move the last element to the root, shrink, then restore the
        // property downwards. Moving the last element is what keeps the
        // shape complete.
        heap_[0] = heap_.back();
        heap_.pop_back();
        if (!heap_.empty()) sift_down(0);
        return smallest;
    }

    bool empty() const { return heap_.empty(); }
    size_t size() const { return heap_.size(); }

    /** Verify the invariant — useful while learning, and in tests. */
    bool valid() const {
        for (size_t i = 0; i < heap_.size(); ++i) {
            size_t l = 2 * i + 1, r = 2 * i + 2;
            if (l < heap_.size() && heap_[i] > heap_[l]) return false;
            if (r < heap_.size() && heap_[i] > heap_[r]) return false;
        }
        return true;
    }

private:
    void sift_up(int i) {
        // Walk toward the root while smaller than the parent. At most the
        // height of the tree, so O(log n).
        while (i > 0) {
            int parent = (i - 1) / 2;
            if (heap_[parent] <= heap_[i]) break;
            swap(heap_[parent], heap_[i]);
            i = parent;
        }
    }

    void sift_down(int i) {
        int n = (int)heap_.size();
        while (true) {
            int smallest = i;
            int l = 2 * i + 1, r = 2 * i + 2;
            if (l < n && heap_[l] < heap_[smallest]) smallest = l;
            if (r < n && heap_[r] < heap_[smallest]) smallest = r;
            if (smallest == i) break;          // property restored
            swap(heap_[i], heap_[smallest]);
            i = smallest;
        }
    }

    vector<int> heap_;
};

int main() {
    MinHeap h;
    for (int x : {5, 3, 8, 1, 9, 2}) h.push(x);
    cout << "min " << *h.top() << " valid " << boolalpha << h.valid() << '\n';

    // Popping repeatedly yields sorted order — that is heapsort.
    while (auto x = h.pop()) cout << *x << ' ';
    cout << '\n';                                  // 1 2 3 5 8 9

    // O(n) construction from an existing array.
    MinHeap built{{9, 4, 7, 1, 8, 3, 6}};
    cout << "built min " << *built.top() << " valid " << built.valid() << '\n';
}
```

Note that the array is **not sorted** at any point — `[1, 3, 2, 5, 9, 8]` is a perfectly valid min-heap. The heap maintains exactly enough order to find the minimum and no more, and that is why its operations are cheaper than a sorted container's.

## Why building is O(n)

Pushing `n` elements one at a time is O(n log n). Sifting down from the middle backwards is O(n), which is surprising until you count: half the nodes are leaves and do zero work, a quarter sift down at most one level, an eighth at most two. The sum `Σ n/2^(k+1) · k` converges to `n`.

So `MinHeap{values}` beats a loop of `push`. The STL equivalent is `make_heap`.

## The real-world use: top k

```cpp
#include <bits/stdc++.h>
using namespace std;

int main() {
    vector<int> data{5, 1, 9, 3, 14, 7, 11, 2};
    const int k = 3;

    // The k LARGEST, using a MIN-heap of size k. Counter-intuitive and
    // correct: the root is the smallest of the current best k, so it is
    // exactly the element to evict when something better arrives.
    priority_queue<int, vector<int>, greater<int>> keep;
    for (int x : data) {
        keep.push(x);
        if ((int)keep.size() > k) keep.pop();      // drop the weakest
    }

    vector<int> top;
    while (!keep.empty()) { top.push_back(keep.top()); keep.pop(); }
    sort(top.rbegin(), top.rend());
    for (int x : top) cout << x << ' ';
    cout << '\n';                                   // 14 11 9
}
```

O(n log k) time and O(k) memory. For `n = 10⁶` and `k = 10` that is dramatically better than sorting, and it works on a stream where you never hold all `n` elements at once.

## The STL version

Prefer this in a contest; the implementation above is for understanding.

```cpp
#include <bits/stdc++.h>
using namespace std;

int main() {
    priority_queue<int> mx;                                   // max-heap
    priority_queue<int, vector<int>, greater<int>> mn;        // min-heap

    for (int x : {4, 1, 7}) { mx.push(x); mn.push(x); }
    cout << mx.top() << ' ' << mn.top() << '\n';              // 7 1

    // Dijkstra's queue: {distance, node}, min-heap. Pairs compare on .first
    // first, which is exactly the ordering needed.
    priority_queue<pair<long long, int>, vector<pair<long long, int>>, greater<>> pq;
    pq.push({7, 1});
    pq.push({3, 2});
    cout << "nearest: node " << pq.top().second << " at " << pq.top().first << '\n';

    // Heap algorithms directly on a vector, when you need the storage.
    vector<int> v{5, 2, 8};
    make_heap(v.begin(), v.end());        // O(n)
    v.push_back(10);
    push_heap(v.begin(), v.end());        // O(log n)
    cout << v.front() << '\n';            // 10
}
```

## Complexity

| Operation | Cost |
|---|---|
| `top` | O(1) |
| `push` | O(log n) |
| `pop` | O(log n) |
| Build from array | **O(n)** |
| Build by `n` pushes | O(n log n) |
| Find an arbitrary element | O(n) — no ordering to exploit |
| Decrease a key | O(n) to find it, then O(log n) |
| Heapsort | O(n log n), in place |

## Pitfalls

- **`priority_queue` is a max-heap by default.** The `greater<int>` incantation for a min-heap is the most-looked-up line in competitive C++.
- **`pop()` returns `void`.** Read `top()` first.
- **Using a heap to find or update an arbitrary element.** There is no index; it is O(n). Dijkstra's standard workaround is to push duplicates and skip stale entries on pop (`if (d > dist[u]) continue;`).
- **Pushing `n` times when you have the array already.** Use the O(n) build.
- **A max-heap for "top k largest".** You want a *min*-heap of size k. Getting this backwards gives the k smallest.
- **Expecting sorted iteration.** Only the root is positioned. Iterating the underlying array gives heap order, not sorted order.

## Problems that use it

Kth largest element in an array · top k frequent elements · merge k sorted lists · find median from a data stream (two heaps) · task scheduler · Dijkstra's shortest path · meeting rooms II · reorganise string.
