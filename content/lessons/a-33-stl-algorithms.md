---
slug: stl-algorithms
moduleSlug: cpp-for-cp
title: STL algorithms worth knowing by heart
sortOrder: 30
status: published
summary: Sorting with custom comparators, the four binary-search functions and what each returns, and the one-liners that replace loops you would otherwise get wrong.
---

Every algorithm here takes an iterator range, which is **half-open**: `[first, last)`, with `last` one past the end. That is why `v.end()` is not an element and dereferencing it is undefined.

## Sorting

```cpp
#include <bits/stdc++.h>
using namespace std;

struct Person {
    string name;
    int age;
};

int main() {
    vector<int> v{5, 2, 9, 1};
    sort(v.begin(), v.end());                                   // ascending
    sort(v.begin(), v.end(), greater<int>());                   // descending
    for (int x : v) cout << x << ' ';
    cout << '\n';

    vector<Person> people{{"ada", 36}, {"bob", 24}, {"cy", 36}};

    // Custom comparator: STRICT weak ordering. It must return false for equal
    // elements — writing <= here is undefined behaviour and really does crash,
    // because the implementation can run off the end of the range.
    sort(people.begin(), people.end(),
         [](const Person& a, const Person& b) { return a.age < b.age; });

    // Tie-break with a tuple: age ascending, then name ascending. Clearer and
    // harder to get wrong than nested ifs.
    sort(people.begin(), people.end(), [](const Person& a, const Person& b) {
        return tie(a.age, a.name) < tie(b.age, b.name);
    });
    for (const Person& p : people) cout << p.name << ':' << p.age << ' ';
    cout << '\n';

    // stable_sort preserves the relative order of equal elements. O(n log^2 n)
    // but sometimes exactly what the problem requires.
    stable_sort(people.begin(), people.end(),
                [](const Person& a, const Person& b) { return a.age < b.age; });

    // Only need the k smallest? Don't sort the whole thing.
    vector<int> big{9, 4, 7, 1, 8, 3};
    nth_element(big.begin(), big.begin() + 2, big.end());   // O(n) average
    cout << "3rd smallest is " << big[2] << '\n';
}
```

That comparator rule is worth repeating because the failure is so confusing: **a comparator must be a strict weak ordering**. `return a <= b;` is a crash waiting for a large enough input, not a style issue.

## Binary search — four functions, four meanings

All four require the range to be **sorted**. On unsorted input they return garbage, silently.

```cpp
#include <bits/stdc++.h>
using namespace std;

int main() {
    vector<int> v{1, 3, 3, 3, 5, 7};

    // binary_search: does it exist? bool only.
    cout << binary_search(v.begin(), v.end(), 3) << '\n';          // 1

    // lower_bound: first position where value could be inserted keeping
    // order = first element >= target.
    auto lo = lower_bound(v.begin(), v.end(), 3);
    cout << "lower_bound(3) at index " << lo - v.begin() << '\n';   // 1

    // upper_bound: first element STRICTLY GREATER than target.
    auto hi = upper_bound(v.begin(), v.end(), 3);
    cout << "upper_bound(3) at index " << hi - v.begin() << '\n';   // 4

    // So the count of a value is the gap between them.
    cout << "count of 3: " << hi - lo << '\n';                      // 3

    // Not found: lower_bound returns end(). Always check before dereferencing.
    auto missing = lower_bound(v.begin(), v.end(), 100);
    cout << (missing == v.end() ? "100 not present\n" : "found\n");

    // On a set/map, use the MEMBER function. std::lower_bound on a set is
    // O(n) because the iterators are not random-access.
    set<int> s{1, 3, 5, 7};
    auto it = s.lower_bound(4);
    cout << "first >= 4 in set: " << *it << '\n';
}
```

`lower_bound` is "first ≥", `upper_bound` is "first >". Those two phrases are worth memorising verbatim; most binary-search bugs are picking the wrong one.

## The one-liners that replace loops

```cpp
#include <bits/stdc++.h>
using namespace std;

int main() {
    vector<int> v{4, 1, 7, 1, 9, 3};

    cout << *max_element(v.begin(), v.end()) << '\n';
    cout << *min_element(v.begin(), v.end()) << '\n';

    // 0LL, not 0: the accumulator type comes from the initial value, so
    // passing 0 sums into an int and overflows on large data.
    cout << accumulate(v.begin(), v.end(), 0LL) << '\n';

    cout << count(v.begin(), v.end(), 1) << '\n';
    cout << count_if(v.begin(), v.end(), [](int x) { return x > 3; }) << '\n';

    reverse(v.begin(), v.end());
    for (int x : v) cout << x << ' ';
    cout << '\n';

    // Deduplicate: unique only removes ADJACENT duplicates, so sort first.
    vector<int> d{3, 1, 3, 1, 2};
    sort(d.begin(), d.end());
    d.erase(unique(d.begin(), d.end()), d.end());
    for (int x : d) cout << x << ' ';
    cout << '\n';

    // Prefix sums in one call: out[i] = v[0] + ... + v[i].
    vector<int> pre(d.size());
    partial_sum(d.begin(), d.end(), pre.begin());
    for (int x : pre) cout << x << ' ';
    cout << '\n';

    cout << boolalpha
         << all_of(d.begin(), d.end(), [](int x) { return x > 0; }) << ' '
         << any_of(d.begin(), d.end(), [](int x) { return x == 2; }) << ' '
         << none_of(d.begin(), d.end(), [](int x) { return x > 99; }) << '\n';

    // Every permutation, in lexicographic order. Needs a sorted start.
    vector<int> p{1, 2, 3};
    do {
        for (int x : p) cout << x;
        cout << ' ';
    } while (next_permutation(p.begin(), p.end()));
    cout << '\n';
}
```

Two traps in there. `accumulate(…, 0)` sums into an `int` — use `0LL`. And `unique` only collapses *adjacent* equal elements, so it is meaningless without a prior sort; the `erase(unique(...), end())` idiom is worth committing to memory because `unique` does not change the container's size on its own.

## Lambdas, briefly

```cpp
#include <bits/stdc++.h>
using namespace std;

int main() {
    int threshold = 3;
    vector<int> v{1, 5, 2, 8};

    // [threshold] captures a copy; [&threshold] captures by reference;
    // [&] captures everything used, by reference; [=] everything by copy.
    auto above = [threshold](int x) { return x > threshold; };
    cout << count_if(v.begin(), v.end(), above) << '\n';

    // Recursive lambda in C++20: name it via an explicit parameter, because
    // `auto` cannot refer to itself during its own deduction.
    auto gcd_rec = [](auto&& self, long long a, long long b) -> long long {
        return b == 0 ? a : self(self, b, a % b);
    };
    cout << gcd_rec(gcd_rec, 48, 18) << '\n';

    // Or just use the standard one.
    cout << gcd(48, 18) << ' ' << lcm(4, 6) << '\n';
}
```

Capture by reference (`[&]`) inside anything that outlives the enclosing scope is a dangling reference. In a contest, where the lambda is used immediately, `[&]` is safe and convenient.
