---
slug: queues-and-deques
moduleSlug: adapters
title: Queues and deques
sortOrder: 20
status: published
summary: First in, first out — and the circular buffer that makes it O(1) without ever shifting an element.
---

## The problem it solves

A stack models "what am I inside". A queue models "who is next". That difference is the difference between depth-first and breadth-first search, and therefore between "a path" and "the shortest path".

The naive implementation is a `vector` where you `erase(begin())` to dequeue. That is O(n) per dequeue — every remaining element shifts down — so `n` dequeues cost O(n²). The fix is to stop moving the data and move the *indices* instead.

## The invariant

> `head_` is the index of the front element, `count_` is how many elements are live. The live elements occupy `buffer_[(head_ + i) % capacity_]` for `i` in `[0, count_)`, and `count_ <= capacity_`.

That modulo is the whole idea: the queue wraps around the end of the buffer rather than running off it. Hence **circular buffer**, or ring buffer.

## The implementation

```cpp
#include <bits/stdc++.h>
using namespace std;

template <typename T>
class Queue {
public:
    explicit Queue(size_t capacity = 4) : buffer_(max<size_t>(capacity, 1)) {}

    void push(const T& value) {
        if (count_ == buffer_.size()) grow();
        // Wrap to the front of the buffer when we run off the end.
        buffer_[(head_ + count_) % buffer_.size()] = value;
        ++count_;
    }

    optional<T> pop() {
        if (count_ == 0) return nullopt;
        T value = std::move(buffer_[head_]);
        // Advance the head rather than shifting n elements down. This single
        // line is the difference between O(1) and O(n).
        head_ = (head_ + 1) % buffer_.size();
        --count_;
        return value;
    }

    optional<T> front() const {
        if (count_ == 0) return nullopt;
        return buffer_[head_];
    }

    optional<T> back() const {
        if (count_ == 0) return nullopt;
        return buffer_[(head_ + count_ - 1) % buffer_.size()];
    }

    bool empty() const { return count_ == 0; }
    size_t size() const { return count_; }

private:
    void grow() {
        // Unwrap into a fresh buffer: linear order, head back at 0. Doubling
        // keeps push O(1) amortised, exactly as for the dynamic array.
        vector<T> fresh(buffer_.size() * 2);
        for (size_t i = 0; i < count_; ++i)
            fresh[i] = std::move(buffer_[(head_ + i) % buffer_.size()]);
        buffer_ = std::move(fresh);
        head_ = 0;
    }

    vector<T> buffer_;
    size_t head_ = 0;
    size_t count_ = 0;
};

int main() {
    Queue<int> q{3};
    for (int x : {1, 2, 3}) q.push(x);

    cout << *q.pop() << ' ' << *q.pop() << '\n';     // 1 2
    q.push(4);
    q.push(5);                                        // wraps around
    cout << "front " << *q.front() << " back " << *q.back()
         << " size " << q.size() << '\n';

    while (auto x = q.pop()) cout << *x << ' ';
    cout << '\n';                                     // 3 4 5 — FIFO preserved
}
```

## The canonical application: BFS gives shortest paths

```cpp
#include <bits/stdc++.h>
using namespace std;

int main() {
    // 0 - 1 - 3
    // |
    // 2
    vector<vector<int>> adj{{1, 2}, {0, 3}, {0}, {1}};

    vector<int> dist(adj.size(), -1);
    queue<int> q;
    dist[0] = 0;
    q.push(0);

    while (!q.empty()) {
        int u = q.front();
        q.pop();
        for (int v : adj[u]) {
            if (dist[v] != -1) continue;
            // Marking at PUSH time, not pop time. A node reached twice would
            // otherwise be enqueued twice and could get a longer distance.
            dist[v] = dist[u] + 1;
            q.push(v);
        }
    }

    for (size_t i = 0; i < dist.size(); ++i) cout << i << ':' << dist[i] << ' ';
    cout << '\n';                     // 0:0 1:1 2:1 3:2
}
```

Why BFS gives *shortest* paths on an unweighted graph: the queue processes vertices in non-decreasing distance order, so the first time you reach a vertex is by a shortest route. Swap the queue for a stack and that property vanishes immediately.

Contrast the marking discipline with iterative DFS from the stack lesson: BFS marks at push, DFS checks at pop. Both are correct for their structure, and swapping them produces subtle bugs.

## Deque — both ends

A **deque** (double-ended queue) allows push and pop at both ends in O(1). `std::deque` is a sequence of fixed-size blocks, so it also offers O(1) indexing — unlike a linked list.

```cpp
#include <bits/stdc++.h>
using namespace std;

int main() {
    deque<int> d{2, 3};
    d.push_front(1);
    d.push_back(4);
    for (int x : d) cout << x << ' ';
    cout << '\n';                             // 1 2 3 4

    cout << d.front() << ' ' << d.back() << ' ' << d[2] << '\n';
    d.pop_front();
    d.pop_back();
    cout << d.size() << '\n';                 // 2
}
```

Its killer application is the **sliding-window maximum** — a monotonic deque that answers "maximum of the current window" in O(1) amortised, giving O(n) overall where the naive approach is O(n·k). The pattern is covered in Track C; the structure is why it is possible.

## Complexity

| Operation | `Queue` (ring) | `std::deque` | `vector` + `erase(begin())` |
|---|---|---|---|
| Push back | O(1) amortised | O(1) | O(1) amortised |
| Pop front | **O(1)** | O(1) | **O(n)** |
| Push front | — | O(1) | O(n) |
| Index | O(1) | O(1) | O(1) |
| Memory | Contiguous | Blocks | Contiguous |

## Pitfalls

- **Dequeuing with `erase(begin())`.** The accidental O(n²) that times out at `n = 10⁵`.
- **Forgetting the modulo** on either `push` or `pop`. The queue then quietly writes outside the live region and loses elements.
- **`head_` versus `tail_` with no count.** A ring buffer using two indices alone cannot distinguish full from empty — both give `head == tail`. Storing `count_` avoids the ambiguity; the alternative is wasting one slot.
- **Not unwrapping on growth.** Copying the raw buffer rather than iterating `(head_ + i) % size` scrambles the order.
- **Marking visited at pop time in BFS.** Admits duplicates and can record a non-shortest distance.
- **Iterating a queue.** `std::queue` offers no iterators, on purpose. If you need to look through it, it was the wrong structure.

## Problems that use it

Binary tree level-order traversal · number of islands · rotting oranges · word ladder · shortest path in a binary matrix · sliding window maximum (deque) · implement a stack using queues · design a hit counter.
