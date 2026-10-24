---
slug: greedy-and-bit-manipulation
moduleSlug: greedy-bits
title: Greedy and bit manipulation
sortOrder: 10
status: published
summary: When a local choice is provably safe — and the bit tricks that are worth memorising.
---

## Greedy: the part people skip

A greedy algorithm takes the best-looking choice at each step and never reconsiders. It is the simplest and fastest approach when it works, and **confidently wrong when it does not**.

The discipline that separates the two is an **exchange argument**: show that any optimal solution can be transformed, without getting worse, into one that makes your greedy choice. If you cannot sketch that argument, use DP.

Coin change makes the failure concrete:

```cpp
#include <bits/stdc++.h>
using namespace std;

/** Greedy: always take the largest coin that fits. */
int greedy_coins(vector<int> coins, int amount) {
    sort(coins.rbegin(), coins.rend());
    int used = 0;
    for (int c : coins) {
        while (amount >= c) {
            amount -= c;
            ++used;
        }
    }
    return amount == 0 ? used : -1;
}

/** DP: correct for any coin system. */
int dp_coins(const vector<int>& coins, int amount) {
    const int kUnreachable = INT_MAX;
    vector<int> dp(amount + 1, kUnreachable);
    dp[0] = 0;
    for (int a = 1; a <= amount; ++a)
        for (int c : coins)
            if (c <= a && dp[a - c] != kUnreachable)
                dp[a] = min(dp[a], dp[a - c] + 1);
    return dp[amount] == kUnreachable ? -1 : dp[amount];
}

int main() {
    // Greedy works on {1,5,10,25} — that system is "canonical".
    cout << greedy_coins({1, 5, 10, 25}, 30) << ' ' << dp_coins({1, 5, 10, 25}, 30) << '\n';

    // And fails on {1,3,4}: greedy takes 4+1+1 = 3 coins; optimal is 3+3 = 2.
    cout << greedy_coins({1, 3, 4}, 6) << ' ' << dp_coins({1, 3, 4}, 6) << '\n';
}
```

Same algorithm, one coin system where it is right and one where it is wrong. Nothing about the code tells you which you are in — only the proof does.

## Greedy patterns that are provably safe

```cpp
#include <bits/stdc++.h>
using namespace std;

int main() {
    // 1. Jump game. Track the furthest reachable index; if it ever falls
    // behind the current position, you are stuck. Safe because reaching
    // further is never worse.
    auto can_jump = [](const vector<int>& nums) {
        int reach = 0;
        for (int i = 0; i < (int)nums.size(); ++i) {
            if (i > reach) return false;
            reach = max(reach, i + nums[i]);
        }
        return true;
    };
    cout << boolalpha << can_jump({2, 3, 1, 1, 4}) << ' '
         << can_jump({3, 2, 1, 0, 4}) << '\n';            // true false

    // 2. Kadane's algorithm — maximum subarray sum. At each element, either
    // extend the running sum or start fresh. Safe because a negative prefix
    // can never help a later subarray.
    auto max_subarray = [](const vector<int>& a) {
        long long best = LLONG_MIN, cur = 0;
        for (int x : a) {
            cur = max<long long>(x, cur + x);       // start fresh, or extend
            best = max(best, cur);
        }
        return best;
    };
    cout << max_subarray({-2, 1, -3, 4, -1, 2, 1, -5, 4}) << '\n';   // 6
    // Initialising best to 0 instead of LLONG_MIN is the classic bug: an
    // all-negative array would wrongly return 0.
    cout << max_subarray({-5, -2, -9}) << '\n';                      // -2

    // 3. Buy and sell stock once. Track the minimum so far.
    auto max_profit = [](const vector<int>& prices) {
        int lowest = INT_MAX, best = 0;
        for (int p : prices) {
            lowest = min(lowest, p);
            best = max(best, p - lowest);
        }
        return best;
    };
    cout << max_profit({7, 1, 5, 3, 6, 4}) << ' ' << max_profit({7, 6, 4}) << '\n';
    // 5 0
}
```

The interval greedies — sort by end time, take whatever fits — are in the [intervals lesson](/course/lessons/monotonic-stacks-and-intervals).

## Bit manipulation: the operations

```cpp
#include <bits/stdc++.h>
using namespace std;

int main() {
    unsigned x = 0b1011;                     // 11

    cout << (x & 1) << '\n';                 // 1  — lowest bit; odd/even test
    cout << (x >> 1) << '\n';                // 5  — divide by 2
    cout << (x << 1) << '\n';                // 22 — multiply by 2

    // Test, set, clear and toggle bit i.
    int i = 2;
    cout << ((x >> i) & 1) << '\n';          // 0  — test
    cout << (x | (1u << i)) << '\n';         // 15 — set
    cout << (x & ~(1u << 1)) << '\n';        // 9  — clear bit 1
    cout << (x ^ (1u << 0)) << '\n';         // 10 — toggle bit 0

    // The two tricks worth memorising.
    cout << (x & -x) << '\n';                // 1  — isolate the lowest set bit
    cout << (x & (x - 1)) << '\n';           // 10 — clear the lowest set bit

    // Power of two: exactly one bit set, so clearing it leaves zero.
    auto is_power_of_two = [](unsigned v) { return v && !(v & (v - 1)); };
    cout << boolalpha << is_power_of_two(16) << ' ' << is_power_of_two(18) << '\n';

    // Built-ins — faster and shorter than a loop.
    cout << __builtin_popcount(x) << '\n';       // 3  — number of set bits
    cout << __builtin_ctz(8u) << '\n';           // 3  — trailing zeros
    cout << __builtin_clz(1u) << '\n';           // 31 — leading zeros
    // popcount(0) is 0, but ctz(0) and clz(0) are UNDEFINED. Guard them.
}
```

`x & (x - 1)` clearing the lowest set bit is the basis of fast popcount: loop until zero and count iterations, which runs once per set bit rather than once per bit.

## XOR, and why it solves "find the single number"

Three properties: `a ^ a == 0`, `a ^ 0 == a`, and XOR is commutative and associative. So XORing a sequence where everything appears twice except one element cancels all the pairs:

```cpp
#include <bits/stdc++.h>
using namespace std;

int main() {
    // Every value appears twice except 3. O(n) time, O(1) space — no hash set.
    vector<int> a{4, 1, 2, 1, 2, 4, 3};
    int single = 0;
    for (int x : a) single ^= x;
    cout << single << '\n';                  // 3

    // Missing number from 0..n: XOR all the indices and all the values.
    vector<int> b{0, 1, 3};                  // 2 is missing, n = 3
    int missing = (int)b.size();
    for (int i = 0; i < (int)b.size(); ++i) missing ^= i ^ b[i];
    cout << missing << '\n';                 // 2

    // Swap without a temporary. A party trick, not better than std::swap.
    int p = 3, q = 8;
    p ^= q; q ^= p; p ^= q;
    cout << p << ' ' << q << '\n';           // 8 3
}
```

## Subset enumeration

The reason `n ≤ 20` means bitmask: each of the `2ⁿ` integers *is* a subset, with bit `i` meaning "element `i` is in".

```cpp
#include <bits/stdc++.h>
using namespace std;

int main() {
    vector<int> a{1, 2, 3};
    int n = (int)a.size();

    // All 2^n subsets, with no recursion at all.
    for (int mask = 0; mask < (1 << n); ++mask) {
        cout << '{';
        for (int i = 0; i < n; ++i)
            if (mask & (1 << i)) cout << a[i] << ' ';
        cout << "} ";
    }
    cout << '\n';

    // Sum of each subset, and how many have an even sum.
    int even = 0;
    for (int mask = 0; mask < (1 << n); ++mask) {
        int sum = 0;
        for (int i = 0; i < n; ++i)
            if (mask & (1 << i)) sum += a[i];
        if (sum % 2 == 0) ++even;
    }
    cout << even << " subsets have an even sum\n";
}
```

## Pitfalls

- **Assuming greedy works.** The single biggest trap. Sketch the exchange argument or use DP.
- **Initialising a maximum to 0** when the answer can be negative. Use the first element or `LLONG_MIN`.
- **`1 << i` for `i >= 31`.** Shifting an `int` that far is UB. Use `1LL << i`.
- **Shifting a signed negative number right.** Implementation-defined. Use unsigned for bit work.
- **`__builtin_ctz(0)` / `__builtin_clz(0)`.** Undefined. Guard the zero case.
- **Operator precedence.** `x & 1 == 0` parses as `x & (1 == 0)`. Parenthesise bitwise operations, always.
- **`x ^ x` to clear.** Fine, but `x = 0` is clearer. Clever bit tricks that save nothing cost readability.

## Problems that use it

Maximum subarray (Kadane) · jump game I and II · gas station · best time to buy and sell stock · partition labels · hand of straights · single number · number of 1 bits · counting bits · missing number · reverse bits · sum of two integers · subsets (bitmask) · maximum XOR of two numbers.
