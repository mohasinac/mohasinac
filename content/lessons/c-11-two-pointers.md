---
slug: two-pointers-and-sliding-window
moduleSlug: pointers
title: Two pointers and the sliding window
sortOrder: 10
status: published
summary: Three templates that turn an O(n²) scan into O(n) by never moving an index backwards.
---

## The idea

A nested loop re-examines elements it has already seen. Two-pointer techniques exploit a monotonic property so that each index only ever moves **forward**: both pointers together take at most `2n` steps, so the whole scan is O(n) even though it looks like a nested loop.

## Template 1 — converging pointers (sorted input)

Recognition: the array is **sorted** (or you may sort it), and you need a pair meeting a condition.

```cpp
#include <bits/stdc++.h>
using namespace std;

/** Indices of a pair summing to target in a SORTED array, or {-1,-1}. */
pair<int, int> two_sum_sorted(const vector<int>& a, int target) {
    int lo = 0, hi = (int)a.size() - 1;
    while (lo < hi) {
        int sum = a[lo] + a[hi];
        if (sum == target) return {lo, hi};
        // The correctness argument: if the sum is too small, no pair using
        // a[lo] can work, because a[hi] is already the largest available.
        // So lo can be discarded forever. Symmetrically for hi.
        if (sum < target) ++lo;
        else --hi;
    }
    return {-1, -1};
}

int main() {
    vector<int> a{1, 3, 4, 6, 8, 11};
    auto [i, j] = two_sum_sorted(a, 10);
    cout << i << ' ' << j << '\n';                  // 1 4  (3 + 8)
    auto [p, q] = two_sum_sorted(a, 100);
    cout << p << ' ' << q << '\n';                  // -1 -1
}
```

The comment is the proof. Without an argument for why discarding an index is safe, you have a guess, not an algorithm.

## Watch them converge

```viz
{ "demo": "twoPointers", "values": [1, 3, 4, 6, 8, 11], "target": 10, "title": "two pointers for a sum of 10" }
```

Each step discards one index permanently, which is why the whole scan is O(n) despite looking like a nested loop.

## Template 2 — fixed-size window

Recognition: "subarray of size `k`".

```cpp
#include <bits/stdc++.h>
using namespace std;

long long max_sum_window(const vector<int>& a, int k) {
    if ((int)a.size() < k) return 0;

    long long sum = 0;
    for (int i = 0; i < k; ++i) sum += a[i];
    long long best = sum;

    // Slide: add the entering element, remove the leaving one. O(1) per step
    // instead of re-summing k elements.
    for (int i = k; i < (int)a.size(); ++i) {
        sum += a[i] - a[i - k];
        best = max(best, sum);
    }
    return best;
}

int main() {
    cout << max_sum_window({2, 1, 5, 1, 3, 2}, 3) << '\n';   // 9  (5+1+3)
}
```

## Template 3 — variable window (the one worth memorising)

Recognition: "longest" or "shortest" subarray/substring satisfying a condition, where extending the window can only make the condition worse and shrinking can only make it better.

```cpp
#include <bits/stdc++.h>
using namespace std;

/** Length of the longest substring with no repeated character. */
int longest_unique(const string& s) {
    vector<int> count(128, 0);
    int best = 0, left = 0;

    for (int right = 0; right < (int)s.size(); ++right) {
        ++count[(unsigned char)s[right]];            // 1. grow right

        // 2. shrink from the left until the window is valid again.
        while (count[(unsigned char)s[right]] > 1) {
            --count[(unsigned char)s[left]];
            ++left;
        }

        best = max(best, right - left + 1);          // 3. record
    }
    return best;
}

int main() {
    for (string s : {"abcabcbb", "bbbbb", "pwwkew", ""})
        cout << '"' << s << "\" -> " << longest_unique(s) << '\n';
    // 3, 1, 3, 0
}
```

Grow, shrink, record. `left` never decreases, so although the `while` is nested it executes at most `n` times in total — hence O(n), not O(n²).

The shortest-window variant swaps the structure: shrink *while valid*, and record inside the shrink loop.

```cpp
#include <bits/stdc++.h>
using namespace std;

/** Length of the shortest subarray with sum >= target, or 0. */
int shortest_at_least(const vector<int>& a, long long target) {
    long long sum = 0;
    int best = INT_MAX, left = 0;

    for (int right = 0; right < (int)a.size(); ++right) {
        sum += a[right];
        // Record and shrink while the window still satisfies the condition.
        while (sum >= target) {
            best = min(best, right - left + 1);
            sum -= a[left++];
        }
    }
    return best == INT_MAX ? 0 : best;
}

int main() {
    cout << shortest_at_least({2, 3, 1, 2, 4, 3}, 7) << '\n';   // 2  (4+3)
    cout << shortest_at_least({1, 1}, 7) << '\n';               // 0
}
```

## Template 4 — fast and slow (linked lists and cycles)

Recognition: a linked list where you need the middle, or must detect a cycle, with O(1) memory.

```cpp
#include <bits/stdc++.h>
using namespace std;

struct ListNode {
    int val;
    ListNode* next = nullptr;
    explicit ListNode(int v) : val(v) {}
};

bool has_cycle(ListNode* head) {
    ListNode* slow = head;
    ListNode* fast = head;
    // Floyd's algorithm: in a cycle, fast gains one position per step on
    // slow, so it must eventually land on it. The fast->next check is what
    // keeps this safe on an even-length list.
    while (fast && fast->next) {
        slow = slow->next;
        fast = fast->next->next;
        if (slow == fast) return true;
    }
    return false;
}

ListNode* middle(ListNode* head) {
    ListNode* slow = head;
    ListNode* fast = head;
    while (fast && fast->next) {
        slow = slow->next;
        fast = fast->next->next;
    }
    return slow;            // fast travelled 2x, so slow is at the midpoint
}

int main() {
    ListNode* a = new ListNode(1);
    a->next = new ListNode(2);
    a->next->next = new ListNode(3);
    cout << boolalpha << has_cycle(a) << ' ' << middle(a)->val << '\n';   // false 2

    a->next->next->next = a;                       // close a cycle
    cout << has_cycle(a) << '\n';                  // true
}
```

## Recognising which to reach for

| Signal in the statement | Template |
|---|---|
| Sorted array, find a pair | Converging pointers |
| "Subarray of size k" | Fixed window |
| "Longest substring such that…" | Variable window, grow then shrink |
| "Shortest subarray such that…" | Variable window, record inside the shrink |
| "In-place, O(1) extra memory" on an array | Read and write pointers |
| Linked list: cycle, middle, nth from end | Fast and slow |

## Pitfalls

- **Using a sliding window where the condition is not monotonic.** With negative numbers, growing the window can *decrease* the sum, so "shortest subarray with sum ≥ k" is no longer a window problem — it needs prefix sums. The window's correctness depends on monotonicity; check it.
- **Forgetting to sort** before using converging pointers.
- **`right - left` instead of `right - left + 1`** for an inclusive window length.
- **Not checking `fast->next`** before `fast->next->next`, which dereferences null on even-length lists.
- **Duplicates.** In three-sum, the pointers must skip equal neighbours or the output repeats.

## Problems that use it

Two sum II · 3sum · container with most water · trapping rain water · valid palindrome · longest substring without repeating characters · longest repeating character replacement · minimum window substring · permutation in string · linked list cycle · remove nth node from end · reorder list.
