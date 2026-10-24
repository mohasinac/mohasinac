---
slug: the-method
moduleSlug: approach
title: The method
sortOrder: 10
status: published
summary: A repeatable sequence to run on every problem, so that getting stuck becomes a step rather than a dead end.
---

Most people lose problems not because they lack the algorithm but because they start typing before they know what they are building. The fix is a sequence you run every time, in the same order.

## The seven steps

1. **Read the output requirement first.** What exactly is being asked for — a count, an index, the thing itself, all of them? Half of all wrong answers are correct solutions to a slightly different question.
2. **Read the constraints.** They tell you which complexity class is allowed. This is the single highest-value thirty seconds you will spend. The next lesson is entirely about this.
3. **Restate the problem in one sentence** without the story. "A farmer has baskets of apples" becomes "given an array, find the longest subarray whose sum is at most `k`". The story is noise.
4. **Solve a tiny case by hand.** Three or four elements. Write down the answer. You now have a test the computer cannot argue with, and very often you have noticed the structure.
5. **State the brute force out loud** and give it a complexity. Even if it is hopeless. It defines the thing you are improving on, and it is a correct baseline you can test an optimisation against.
6. **Find the waste.** Optimisation is almost always the removal of repeated work: a value recomputed, a range re-scanned, a sort redone. Name the wasted work before choosing a tool.
7. **Only then write code.**

## Why writing the brute force matters

> If you cannot write the O(n²) solution, you do not understand the problem well enough to write the O(n) one.

The brute force is not wasted effort. It is a specification. On a real contest where you have a local compiler you can generate random small inputs, run both solutions, and compare — a technique called **stress testing**, and the fastest way to find the one edge case your clever solution gets wrong.

## Getting unstuck

When you have been still for five minutes, you are in one of three states, and each has a different move:

| State | What it feels like | The move |
|---|---|---|
| You do not understand the problem | Re-reading the statement repeatedly | Hand-solve a second, different small case |
| You understand it but see no approach | Staring at a blank editor | Relax a constraint. Solve the easier problem first |
| You have an approach but it is too slow | Writing and deleting the same loop | Name the repeated work, then ask what structure removes it |

That middle move — **relax a constraint** — is the most underused. If the array were sorted, could you do it? If the values were distinct? If you were allowed O(n) extra memory? Solving the relaxed problem usually reveals the shape of the real one.

## A worked pass

*Given an array of integers and a target, return the indices of the two numbers that add to the target.*

- **Output:** two indices, not the values. Note that now.
- **Constraints:** say `n ≤ 10⁴`. That permits O(n²) — but let us see.
- **Restated:** find `i < j` with `a[i] + a[j] == target`.
- **By hand:** `[2, 7, 11, 15]`, target `9` → `0 1`.
- **Brute force:** every pair, O(n²). Correct, and here it would pass.
- **The waste:** for each `i` we re-scan the whole array looking for `target - a[i]`. That lookup is the repeated work. A hash map turns it into O(1), giving O(n).

Notice the algorithm was not guessed. It fell out of naming the waste.

```cpp
#include <bits/stdc++.h>
using namespace std;

int main() {
    int n, target;
    cin >> n >> target;
    vector<int> a(n);
    for (int& x : a) cin >> x;

    unordered_map<int, int> seen;              // value -> index
    for (int i = 0; i < n; ++i) {
        auto it = seen.find(target - a[i]);
        if (it != seen.end()) {
            cout << it->second << ' ' << i << '\n';
            return 0;
        }
        seen[a[i]] = i;                        // insert AFTER the lookup
    }
    cout << "-1\n";
}
```

That comment on the last line of the loop is the whole correctness argument: inserting before the lookup would let an element pair with itself when `target == 2 * a[i]`.

## Practise this, not problems

For the next ten problems you attempt, write steps 1–6 down before writing any code. It will feel slow. It is faster, because the alternative is twenty minutes into a dead approach before you discover the constraint that rules it out.
