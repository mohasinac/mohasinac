---
slug: monotonic-stacks-and-intervals
moduleSlug: stack-patterns
title: Monotonic stacks and intervals
sortOrder: 10
status: published
summary: Next-greater-element in O(n), and the sort-then-sweep template that solves every interval problem.
---

## Monotonic stack: the idea

"For each element, find the next element to its right that is larger." The obvious solution scans right from each position: O(n²).

A **monotonic stack** keeps its contents in sorted order by popping anything that violates the order. Each element is pushed once and popped at most once, so the total work is O(n) despite the nested loop.

The insight: when you pop an element, you have just found its answer.

```cpp
#include <bits/stdc++.h>
using namespace std;

/** For each i, the index of the next strictly greater element, or -1. */
vector<int> next_greater(const vector<int>& a) {
    int n = (int)a.size();
    vector<int> result(n, -1);
    vector<int> stack;                       // holds INDICES, decreasing values

    for (int i = 0; i < n; ++i) {
        // Everything smaller than a[i] has just found its next greater
        // element: it is a[i]. Pop and record.
        while (!stack.empty() && a[stack.back()] < a[i]) {
            result[stack.back()] = i;
            stack.pop_back();
        }
        stack.push_back(i);
    }
    // Whatever remains has no greater element to its right; already -1.
    return result;
}

int main() {
    vector<int> a{2, 1, 2, 4, 3};
    for (int x : next_greater(a)) cout << x << ' ';
    cout << '\n';                            // 3 2 3 -1 -1
}
```

Storing **indices**, not values, is what makes the answer usable — you usually need the distance or the position, not just the value.

## The four variants

One template, four conditions. Get the comparison and the direction right and you have all of them:

| Want | Iterate | Pop while |
|---|---|---|
| Next greater to the right | left → right | `a[top] < a[i]` |
| Next smaller to the right | left → right | `a[top] > a[i]` |
| Previous greater to the left | right → left | `a[top] < a[i]` |
| Previous smaller to the left | right → left | `a[top] > a[i]` |

A worked application — "how many days until a warmer day":

```cpp
#include <bits/stdc++.h>
using namespace std;

vector<int> days_until_warmer(const vector<int>& temps) {
    int n = (int)temps.size();
    vector<int> wait(n, 0);
    vector<int> stack;

    for (int i = 0; i < n; ++i) {
        while (!stack.empty() && temps[stack.back()] < temps[i]) {
            // The distance is why we stored indices.
            wait[stack.back()] = i - stack.back();
            stack.pop_back();
        }
        stack.push_back(i);
    }
    return wait;
}

int main() {
    for (int x : days_until_warmer({73, 74, 75, 71, 69, 72, 76, 73})) cout << x << ' ';
    cout << '\n';                            // 1 1 4 2 1 1 0 0
}
```

## Largest rectangle in a histogram

The hardest common application, and worth working through because the same shape recurs. For each bar, the widest rectangle of that bar's height extends until a strictly shorter bar on each side — exactly "previous smaller" and "next smaller".

```cpp
#include <bits/stdc++.h>
using namespace std;

long long largest_rectangle(vector<int> heights) {
    // A sentinel 0 at the end forces every remaining bar to be popped, which
    // removes the separate drain loop after the main pass.
    heights.push_back(0);

    vector<int> stack;                       // indices, increasing heights
    long long best = 0;

    for (int i = 0; i < (int)heights.size(); ++i) {
        while (!stack.empty() && heights[stack.back()] >= heights[i]) {
            int height = heights[stack.back()];
            stack.pop_back();
            // Left boundary is the new stack top: the previous smaller bar.
            // An empty stack means no smaller bar exists, so the rectangle
            // reaches index 0 and the width is simply i.
            int left = stack.empty() ? -1 : stack.back();
            long long width = i - left - 1;
            best = max(best, (long long)height * width);
        }
        stack.push_back(i);
    }
    return best;
}

int main() {
    cout << largest_rectangle({2, 1, 5, 6, 2, 3}) << '\n';   // 10  (5 and 6)
    cout << largest_rectangle({2, 4}) << '\n';               // 4
}
```

The sentinel trick is worth stealing generally: appending a value that forces the loop to flush saves you an easily-forgotten cleanup pass.

## Intervals: sort, then sweep

Interval problems look varied and are all the same algorithm. **Sort by one endpoint, then sweep once.** Which endpoint you sort by is the only real decision.

### Merging — sort by start

```cpp
#include <bits/stdc++.h>
using namespace std;

vector<pair<int, int>> merge_intervals(vector<pair<int, int>> intervals) {
    if (intervals.empty()) return {};
    sort(intervals.begin(), intervals.end());          // by start, then end

    vector<pair<int, int>> merged{intervals[0]};
    for (size_t i = 1; i < intervals.size(); ++i) {
        auto [start, end] = intervals[i];
        // Sorted by start, so an overlap can only be with the LAST merged
        // interval — which is why one pass suffices.
        if (start <= merged.back().second) {
            merged.back().second = max(merged.back().second, end);
        } else {
            merged.push_back({start, end});
        }
    }
    return merged;
}

int main() {
    for (auto [s, e] : merge_intervals({{1, 3}, {2, 6}, {8, 10}, {15, 18}}))
        cout << '[' << s << ',' << e << "] ";
    cout << '\n';                            // [1,6] [8,10] [15,18]
}
```

`max(merged.back().second, end)` rather than `end` is the bug people ship: `[1,10]` followed by `[2,3]` must stay `[1,10]`.

### Maximum non-overlapping count — sort by **end**

```cpp
#include <bits/stdc++.h>
using namespace std;

int max_non_overlapping(vector<pair<int, int>> intervals) {
    // Sort by END. The greedy argument: taking the interval that finishes
    // earliest leaves the most room for everything after it. Sorting by
    // start gives the wrong answer — one long early interval blocks many.
    sort(intervals.begin(), intervals.end(),
         [](auto& a, auto& b) { return a.second < b.second; });

    int count = 0, last_end = INT_MIN;
    for (auto [start, end] : intervals) {
        if (start >= last_end) {
            ++count;
            last_end = end;
        }
    }
    return count;
}

int main() {
    cout << max_non_overlapping({{1, 2}, {2, 3}, {3, 4}, {1, 3}}) << '\n';   // 3
}
```

### Maximum overlap — the sweep line

```cpp
#include <bits/stdc++.h>
using namespace std;

/** Minimum rooms needed = maximum number of simultaneous intervals. */
int max_overlap(const vector<pair<int, int>>& intervals) {
    vector<pair<int, int>> events;            // (time, +1 start / -1 end)
    for (auto [s, e] : intervals) {
        events.push_back({s, +1});
        events.push_back({e, -1});
    }
    // At equal times, process ends before starts: an interval ending exactly
    // when another begins does not need two rooms. The -1 sorts first.
    sort(events.begin(), events.end());

    int current = 0, best = 0;
    for (auto [time, delta] : events) {
        current += delta;
        best = max(best, current);
    }
    return best;
}

int main() {
    cout << max_overlap({{0, 30}, {5, 10}, {15, 20}}) << '\n';   // 2
    cout << max_overlap({{1, 2}, {2, 3}}) << '\n';               // 1
}
```

The tie-break comment is the whole correctness argument. `-1 < +1`, so ends process first and touching intervals do not double-count.

## Choosing

| Question | Sort by | Then |
|---|---|---|
| Merge overlapping | start | Extend the last merged |
| Maximum non-overlapping subset | **end** | Greedy take if `start >= last_end` |
| Minimum removals to de-overlap | **end** | `n -` the above |
| Maximum simultaneous | — | Sweep line with ±1 events |
| Insert into a sorted set | start | Three phases: before, merge, after |

## Pitfalls

- **Pushing values instead of indices** onto a monotonic stack.
- **`<` versus `<=`** in the pop condition. With equal elements this decides whether you find the next *strictly* greater or the next greater-or-equal, and both are needed by different problems.
- **Forgetting to drain** the stack after the main loop — or use a sentinel.
- **Sorting intervals by start when the greedy needs end.** Produces a plausible wrong answer.
- **`merged.back().second = end`** without the `max`.
- **Wrong tie-break in a sweep line.** Decide whether touching counts as overlapping; the problem always tells you.

## Problems that use it

Daily temperatures · next greater element I and II · largest rectangle in histogram · maximal rectangle · trapping rain water · car fleet · merge intervals · insert interval · non-overlapping intervals · meeting rooms I and II · minimum number of arrows.
