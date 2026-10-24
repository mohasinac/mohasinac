---
slug: backtracking
moduleSlug: recursion
title: Backtracking
sortOrder: 10
status: published
summary: Choose, recurse, un-choose — one template for subsets, permutations and combinations, plus the pruning that keeps it feasible.
---

## The shape

Backtracking explores a tree of partial solutions. At each node you make a choice, recurse, then **undo the choice** so the next branch starts clean. That undo is the whole technique:

```
choose      -> add to the current path
recurse     -> explore everything reachable from here
un-choose   -> remove it, restoring the state for the sibling branch
```

Forgetting the un-choose is the defining bug of backtracking, and the symptom is answers that accumulate garbage from sibling branches.

## Template 1 — subsets (the power set)

```cpp
#include <bits/stdc++.h>
using namespace std;

void subsets_from(const vector<int>& a, int start,
                  vector<int>& path, vector<vector<int>>& out) {
    // Every node of the recursion tree is itself a valid subset, so record
    // on entry rather than only at the leaves.
    out.push_back(path);

    for (int i = start; i < (int)a.size(); ++i) {
        path.push_back(a[i]);                 // choose
        subsets_from(a, i + 1, path, out);    // recurse — i+1 prevents reuse
        path.pop_back();                      // un-choose
    }
}

int main() {
    vector<int> a{1, 2, 3};
    vector<int> path;
    vector<vector<int>> out;
    subsets_from(a, 0, path, out);

    cout << out.size() << " subsets:\n";      // 2^3 = 8
    for (const auto& s : out) {
        cout << '{';
        for (int x : s) cout << x << ' ';
        cout << "} ";
    }
    cout << '\n';
}
```

The `start` parameter is what distinguishes subsets from permutations: it forbids looking backwards, so each combination is generated once rather than in every order.

## Template 2 — permutations

```cpp
#include <bits/stdc++.h>
using namespace std;

void permute_from(vector<int>& a, int k, vector<vector<int>>& out) {
    if (k == (int)a.size()) {
        out.push_back(a);
        return;
    }
    for (int i = k; i < (int)a.size(); ++i) {
        swap(a[k], a[i]);                     // choose: fix a[i] at position k
        permute_from(a, k + 1, out);
        swap(a[k], a[i]);                     // un-choose: restore
    }
}

int main() {
    vector<int> a{1, 2, 3};
    vector<vector<int>> out;
    permute_from(a, 0, out);
    for (const auto& p : out) {
        for (int x : p) cout << x;
        cout << ' ';
    }
    cout << '\n';                             // 123 132 213 231 321 312
}
```

Swapping in place avoids a `used[]` array. In a contest, `next_permutation` from the [algorithms lesson](/learn/foundations/stl-algorithms) is shorter — but it requires sorted input and gives lexicographic order, which is not always what is wanted.

## Template 3 — combinations with pruning

Pruning is what separates a working solution from a timeout. The rule: **abandon a branch as soon as it cannot possibly succeed.**

```cpp
#include <bits/stdc++.h>
using namespace std;

void combos(const vector<int>& candidates, int start, int remaining,
            vector<int>& path, vector<vector<int>>& out) {
    if (remaining == 0) {
        out.push_back(path);
        return;
    }

    for (int i = start; i < (int)candidates.size(); ++i) {
        // PRUNE: candidates is sorted, so once one exceeds what is left,
        // every later one does too. `break`, not `continue` — that is the
        // difference between exploring a subtree and skipping all of them.
        if (candidates[i] > remaining) break;

        path.push_back(candidates[i]);
        // `i`, not `i + 1`: this problem allows reusing a number. Passing
        // i + 1 would forbid it. One character, entirely different problem.
        combos(candidates, i, remaining - candidates[i], path, out);
        path.pop_back();
    }
}

int main() {
    vector<int> c{2, 3, 6, 7};
    sort(c.begin(), c.end());                 // pruning REQUIRES sorted input
    vector<int> path;
    vector<vector<int>> out;
    combos(c, 0, 7, path, out);

    for (const auto& s : out) {
        cout << '{';
        for (int x : s) cout << x << ' ';
        cout << "} ";
    }
    cout << '\n';                             // {2 2 3 } {7 }
}
```

## Handling duplicates

When the input has repeats and the output must not, sort and skip equal siblings:

```cpp
#include <bits/stdc++.h>
using namespace std;

void unique_subsets(const vector<int>& a, int start,
                    vector<int>& path, vector<vector<int>>& out) {
    out.push_back(path);
    for (int i = start; i < (int)a.size(); ++i) {
        // Skip a duplicate only when it is a SIBLING (i > start), not when it
        // is a deeper use of the same value. Writing `i > 0` here would
        // wrongly forbid {1,1}.
        if (i > start && a[i] == a[i - 1]) continue;
        path.push_back(a[i]);
        unique_subsets(a, i + 1, path, out);
        path.pop_back();
    }
}

int main() {
    vector<int> a{1, 2, 2};
    sort(a.begin(), a.end());
    vector<int> path;
    vector<vector<int>> out;
    unique_subsets(a, 0, path, out);
    for (const auto& s : out) {
        cout << '{';
        for (int x : s) cout << x << ' ';
        cout << "} ";
    }
    cout << '\n';                             // {} {1} {1 2} {1 2 2} {2} {2 2}
}
```

`i > start` versus `i > 0` is the entire difference between correct and wrong here, and it is worth dry-running on `{1,2,2}` to see why.

## Grid backtracking

Word search and n-queens share a shape: mark the cell as in-use, recurse, unmark.

```cpp
#include <bits/stdc++.h>
using namespace std;

bool word_search(vector<string>& grid, const string& word, int r, int c, int k) {
    if (k == (int)word.size()) return true;
    if (r < 0 || r >= (int)grid.size() || c < 0 || c >= (int)grid[0].size()) return false;
    if (grid[r][c] != word[k]) return false;

    // Mark in place — no visited array needed, and O(1) extra memory.
    char saved = grid[r][c];
    grid[r][c] = '#';

    bool found = word_search(grid, word, r + 1, c, k + 1)
              || word_search(grid, word, r - 1, c, k + 1)
              || word_search(grid, word, r, c + 1, k + 1)
              || word_search(grid, word, r, c - 1, k + 1);

    grid[r][c] = saved;                       // un-choose, on every path out
    return found;
}

int main() {
    vector<string> grid{"ABCE", "SFCS", "ADEE"};
    for (string w : {"ABCCED", "SEE", "ABCB"}) {
        bool found = false;
        for (int r = 0; r < 3 && !found; ++r)
            for (int c = 0; c < 4 && !found; ++c)
                found = word_search(grid, w, r, c, 0);
        cout << w << ": " << boolalpha << found << '\n';
    }
    // true, true, false
}
```

The restore must happen on **every** exit path. Returning early after a successful branch without restoring leaves `'#'` in the grid and corrupts later searches — a bug that only shows up on the second query.

## Complexity, and the constraint that tells you

Backtracking is exponential: O(2ⁿ) for subsets, O(n!) for permutations. The [constraints lesson](/learn/foundations/constraints-tell-you-the-algorithm) is the tell — **`n ≤ 20` means subsets, `n ≤ 10` means permutations.** If `n` is 10⁵, backtracking is not the intended solution and no amount of pruning will save it.

## Pitfalls

- **Forgetting the un-choose.** The defining bug.
- **`i` versus `i + 1`** in the recursive call: reuse allowed or not.
- **`i > start` versus `i > 0`** in duplicate skipping.
- **Pruning without sorting.** The `break` is only valid on sorted candidates.
- **`continue` where `break` was meant.** Correct but exponentially slower.
- **Not restoring state on an early return** in grid problems.
- **Copying the path at every node** instead of passing by reference. Turns O(2ⁿ) into O(2ⁿ · n) and is a common cause of just-too-slow.

## Problems that use it

Subsets I and II · combination sum I and II · permutations I and II · word search · palindrome partitioning · letter combinations of a phone number · n-queens · sudoku solver · generate parentheses · restore IP addresses.
