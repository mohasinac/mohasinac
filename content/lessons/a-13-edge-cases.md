---
slug: edge-cases-and-dry-running
moduleSlug: approach
title: Edge cases and dry running
sortOrder: 30
status: published
summary: The checklist that catches the inputs a judge uses to separate solutions that work from solutions that happen to work.
---

Your solution is probably correct on the sample. The sample is chosen to illustrate the problem, not to break your code. Hidden tests are chosen to break it.

## The checklist

Run this against every solution before submitting. It takes under a minute and catches most wrong answers.

- **Empty input.** `n = 0`, empty string, empty array. Does your loop body assume at least one element? Does `a[0]` happen before the size check?
- **One element.** Kills two-pointer and fast-slow solutions that assume two distinct positions.
- **Two elements.** The smallest case where order matters.
- **All identical.** Breaks solutions that assume distinct values, and hash-based deduplication that was really doing the work.
- **Already sorted, and reverse sorted.** The best and worst cases for anything comparison-based. Reverse-sorted is the classic quicksort killer.
- **Maximum size with maximum values.** The overflow test and the timeout test in one.
- **Negative numbers and zero.** Does your "maximum subarray" initialise the answer to `0`? Then an all-negative array returns the wrong answer. Initialise to `a[0]` or to `LLONG_MIN`.
- **The answer is the first element. The answer is the last element.** Off-by-one detectors.
- **Duplicate answers.** If the problem says "return any", fine. If it says "return all, without duplicates", that is a different problem.

## Dry running properly

Dry running is not re-reading your code hoping to feel confident. It is executing it on paper with a table of variables, one line at a time, writing down every change.

Take this attempt at a binary search:

```cpp
#include <bits/stdc++.h>
using namespace std;

// Returns the index of `target`, or -1. There is a bug. Find it by hand
// before reading on.
int find_broken(const vector<int>& a, int target) {
    int lo = 0, hi = a.size();
    while (lo < hi) {
        int mid = (lo + hi) / 2;
        if (a[mid] == target) return mid;
        if (a[mid] < target) lo = mid;
        else hi = mid;
    }
    return -1;
}

int main() {
    vector<int> a{1, 3};
    // Dry run with target = 3:
    //   lo=0 hi=2  mid=1  a[1]==3  -> returns 1. Fine.
    // Dry run with target = 2:
    //   lo=0 hi=2  mid=1  a[1]=3 > 2 -> hi=1
    //   lo=0 hi=1  mid=0  a[0]=1 < 2 -> lo=0     <-- lo did not change
    //   lo=0 hi=1  mid=0  ... forever
    cout << find_broken(a, 3) << '\n';
}
```

The table is what finds it: `lo = mid` when `mid == lo` makes no progress, so the loop never terminates. The fix is `lo = mid + 1`, which is correct precisely because `a[mid] < target` has ruled `mid` out.

Running the loop twice on paper found a bug that reading it five times would not, because reading it you see what you meant.

## Where off-by-one errors come from

Almost all of them come from mixing two conventions for an interval. Pick one and never deviate:

- **Half-open `[lo, hi)`** — `hi` is one past the end. Size is `hi - lo`. Empty is `lo == hi`. This is what the STL uses, and it is the one to choose.
- **Closed `[lo, hi]`** — both ends included. Size is `hi - lo + 1`. Empty is `lo > hi`.

The bugs happen in code that uses `[lo, hi)` in the loop condition and `[lo, hi]` in the body. Decide at the top of the function and write it in a comment.

## Build the habit mechanically

Keep a file of adversarial inputs and paste them in before submitting:

```
0
1
5
1 1 1 1 1
3
-5 -2 -9
```

An empty case, a single element, all-identical, all-negative. Four pastes, thirty seconds, and it catches the majority of what hidden tests are testing for.
