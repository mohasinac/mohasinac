---
slug: dynamic-programming
moduleSlug: dp
title: Dynamic programming
sortOrder: 10
status: published
summary: Four questions — state, transition, base case, order. Answer them and the code is mechanical.
---

## What DP is

Dynamic programming applies when a problem has:

1. **Overlapping subproblems** — the same subproblem is solved many times.
2. **Optimal substructure** — the best answer is built from best answers to subproblems.

The fix for (1) is to remember results. That is the entire idea; everything else is bookkeeping.

## The four questions

Answer these, in order, before writing code:

1. **State** — what distinguishes one subproblem from another? This becomes your array's dimensions.
2. **Transition** — how does a state's answer follow from smaller states?
3. **Base case** — which states are known outright?
4. **Order** — in what sequence must states be filled so that dependencies are ready?

## From exponential to linear, in three steps

Fibonacci makes the mechanism visible.

```cpp
#include <bits/stdc++.h>
using namespace std;

// 1. NAIVE: O(2^n). fib(n-2) is recomputed in both branches, all the way down.
long long fib_naive(int n) {
    if (n <= 1) return n;
    return fib_naive(n - 1) + fib_naive(n - 2);
}

// 2. TOP-DOWN (memoised): the recursion is unchanged; we just stop
// recomputing. O(n) time, O(n) space plus O(n) stack.
long long fib_memo(int n, vector<long long>& memo) {
    if (n <= 1) return n;
    if (memo[n] != -1) return memo[n];
    return memo[n] = fib_memo(n - 1, memo) + fib_memo(n - 2, memo);
}

// 3. BOTTOM-UP: the same recurrence as a loop. No stack, no recursion.
long long fib_table(int n) {
    if (n <= 1) return n;
    vector<long long> dp(n + 1);
    dp[0] = 0;                               // base cases
    dp[1] = 1;
    for (int i = 2; i <= n; ++i) dp[i] = dp[i - 1] + dp[i - 2];
    return dp[n];
}

// 4. ROLLED: dp[i] depends only on the previous two, so keep two variables.
// O(1) space. This is the rolling-array idea, and it generalises.
long long fib_rolled(int n) {
    if (n <= 1) return n;
    long long prev = 0, cur = 1;
    for (int i = 2; i <= n; ++i) {
        long long next = prev + cur;
        prev = cur;
        cur = next;
    }
    return cur;
}

int main() {
    cout << fib_naive(20) << '\n';
    vector<long long> memo(51, -1);
    cout << fib_memo(50, memo) << '\n';
    cout << fib_table(50) << ' ' << fib_rolled(50) << '\n';
    // fib_naive(50) would take longer than this course.
}
```

Four versions of one recurrence. The progression — recursion → memoise → tabulate → roll — is the standard path for *every* DP problem, and you can stop at whichever stage passes.

The table filling in, with each cell's two dependencies lit:

```viz
{ "demo": "dpTable", "n": 8, "title": "climbing stairs, bottom-up" }
```

## One dimension: house robber

> **State:** `dp[i]` = the best total from the first `i` houses.
> **Transition:** skip house `i` (`dp[i-1]`), or take it and skip `i-1` (`dp[i-2] + a[i]`).
> **Base:** `dp[0] = 0`, `dp[1] = a[0]`.

```cpp
#include <bits/stdc++.h>
using namespace std;

long long rob(const vector<int>& houses) {
    long long skip = 0;                      // best using houses before the last
    long long take = 0;                      // best including the last
    for (int value : houses) {
        // Compute both before overwriting either — ordering bug otherwise.
        long long new_take = skip + value;
        long long new_skip = max(skip, take);
        take = new_take;
        skip = new_skip;
    }
    return max(skip, take);
}

int main() {
    cout << rob({1, 2, 3, 1}) << '\n';       // 4  (1 + 3)
    cout << rob({2, 7, 9, 3, 1}) << '\n';    // 12 (2 + 9 + 1)
    cout << rob({}) << '\n';                 // 0
}
```

## Unbounded choices: coin change

> **State:** `dp[amount]` = fewest coins making exactly `amount`.
> **Transition:** `dp[a] = 1 + min(dp[a - coin])` over all coins that fit.
> **Base:** `dp[0] = 0`. Everything else starts unreachable.

```cpp
#include <bits/stdc++.h>
using namespace std;

int coin_change(const vector<int>& coins, int amount) {
    const int kUnreachable = INT_MAX;
    vector<int> dp(amount + 1, kUnreachable);
    dp[0] = 0;

    for (int a = 1; a <= amount; ++a) {
        for (int coin : coins) {
            if (coin > a) continue;
            // Guard against adding 1 to INT_MAX — signed overflow is
            // undefined behaviour, not a large number.
            if (dp[a - coin] == kUnreachable) continue;
            dp[a] = min(dp[a], dp[a - coin] + 1);
        }
    }
    return dp[amount] == kUnreachable ? -1 : dp[amount];
}

int main() {
    cout << coin_change({1, 5, 10, 25}, 30) << '\n';   // 2  (25 + 5)
    cout << coin_change({2}, 3) << '\n';               // -1
    cout << coin_change({1, 2, 5}, 11) << '\n';        // 3  (5 + 5 + 1)
}
```

That unreachable guard is a real bug source: `INT_MAX + 1` is UB and typically yields a negative number, which then wins the `min` and produces a confidently wrong answer.

## Two dimensions: longest common subsequence

> **State:** `dp[i][j]` = LCS length of the first `i` of `a` and first `j` of `b`.
> **Transition:** characters equal → `dp[i-1][j-1] + 1`; else `max(dp[i-1][j], dp[i][j-1])`.
> **Base:** row 0 and column 0 are 0 — an empty string shares nothing.

```cpp
#include <bits/stdc++.h>
using namespace std;

int lcs(const string& a, const string& b) {
    int n = (int)a.size(), m = (int)b.size();
    // (n+1) x (m+1) so index 0 means "empty prefix" and there is no special
    // case for the first character — the same trick as a prefix-sum array.
    vector<vector<int>> dp(n + 1, vector<int>(m + 1, 0));

    for (int i = 1; i <= n; ++i)
        for (int j = 1; j <= m; ++j)
            dp[i][j] = (a[i - 1] == b[j - 1])
                         ? dp[i - 1][j - 1] + 1
                         : max(dp[i - 1][j], dp[i][j - 1]);

    return dp[n][m];
}

int main() {
    cout << lcs("abcde", "ace") << '\n';     // 3  "ace"
    cout << lcs("abc", "def") << '\n';       // 0
}
```

`a[i - 1]` with `dp[i][j]` is the standard 1-off between table index and string index. Write it once, deliberately, and keep it consistent.

## Rolling a 2-D table down to 1-D

Row `i` depends only on row `i-1`, so two rows suffice — O(m) instead of O(n·m). This is what makes a DP fit in memory when the full table would not:

```cpp
#include <bits/stdc++.h>
using namespace std;

int lcs_rolled(const string& a, const string& b) {
    int m = (int)b.size();
    vector<int> prev(m + 1, 0), cur(m + 1, 0);

    for (size_t i = 1; i <= a.size(); ++i) {
        for (int j = 1; j <= m; ++j)
            cur[j] = (a[i - 1] == b[j - 1]) ? prev[j - 1] + 1 : max(prev[j], cur[j - 1]);
        swap(prev, cur);                     // O(1) — swaps the buffers
        // cur now holds the old prev row; it is fully overwritten next pass.
    }
    return prev[m];
}

int main() {
    cout << lcs_rolled("abcde", "ace") << '\n';   // 3
}
```

## Recognising DP

- "Maximum/minimum number of ways to …"
- "Count the number of ways …"
- Choices at each step that affect later options
- A recursive solution that visibly recomputes the same arguments
- `n ≤ 5000` with a two-dimensional feel, or `n ≤ 20` with subsets

If a greedy choice is provably safe, prefer greedy — it is simpler and faster. DP is for when local choices are *not* safe.

## Pitfalls

- **Wrong state.** The commonest failure, and it shows up as a transition you cannot write. If the transition feels impossible, the state is missing a dimension.
- **Filling in the wrong order.** Bottom-up requires every dependency to be computed already. When unsure, memoise top-down instead — the recursion handles order for you.
- **Overflow in the sentinel.** `INT_MAX + 1`, as above.
- **Off-by-one between table and input index.**
- **Rolling too early.** Get the full table correct, verify it, then roll. Rolling introduces read-after-write bugs that are much harder to find than a memory limit.
- **Memory.** A 10⁵ × 10⁵ `int` table is 40 GB. Roll it, or rethink the state.
- **Reaching for DP on something greedy.** Correct but needlessly complex.

## Problems that use it

Climbing stairs · house robber I and II · coin change · longest increasing subsequence · word break · combination sum IV · decode ways · unique paths · longest common subsequence · edit distance · 0/1 knapsack and partition equal subset sum · maximum product subarray · best time to buy and sell stock with cooldown.
