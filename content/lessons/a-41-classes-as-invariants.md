---
slug: classes-as-invariants
moduleSlug: oop
title: Classes as invariants
sortOrder: 10
status: published
summary: What a class is actually for — not grouping data, but making a broken state unrepresentable. The idea the whole data-structures track is built on.
---

Most introductions say a class "bundles data and the functions that work on it". That is true and almost useless, because it does not tell you where to draw the boundary.

Here is the definition worth carrying:

> A class exists to maintain an **invariant** — a statement about its data that is true before and after every public operation.

Encapsulation is not about hiding data for its own sake. It is about controlling every path that could falsify the invariant. If the data is public, anyone can break it and the guarantee is worthless.

## A class with no invariant

```cpp
#include <bits/stdc++.h>
using namespace std;

// This is a struct pretending to be a class. There is nothing to protect:
// any combination of these three values is valid.
struct Point {
    int x;
    int y;
    int z;
};

int main() {
    Point p{1, 2, 3};
    p.x = -99;                     // still a perfectly valid Point
    cout << p.x << ',' << p.y << ',' << p.z << '\n';
}
```

Use `struct` with public members. Making these private and adding six accessors adds ceremony and protects nothing. **A type with no invariant should be a struct.** Knowing when *not* to write a class is half of using them well.

## A class with a real invariant

Now a percentage: the value must stay in `[0, 100]`. That is a constraint the type can enforce.

```cpp
#include <bits/stdc++.h>
using namespace std;

class Percentage {
public:
    // The constructor is the ONLY way in, so it is where the invariant is
    // established. Clamping rather than rejecting is a design choice —
    // documented, deliberate, and consistent.
    explicit Percentage(int value) : value_(clamp(value, 0, 100)) {}

    int value() const { return value_; }

    // Every mutator re-establishes the invariant. There is no path to an
    // out-of-range Percentage.
    void add(int delta) { value_ = clamp(value_ + delta, 0, 100); }

private:
    int value_;
};

int main() {
    Percentage p{150};             // clamped to 100
    cout << p.value() << '\n';

    p.add(-200);                   // clamped to 0
    cout << p.value() << '\n';

    // p.value_ = -5;              // will not compile. That is the point.
}
```

Three things to notice.

**`explicit`.** Without it, `Percentage p = 42;` compiles via an implicit conversion, and so does passing `42` to any function taking a `Percentage`. Single-argument constructors should be `explicit` by default; the implicit conversion is almost never what you want and produces overload-resolution surprises.

**`const` on `value()`.** It says this function does not modify the object, which lets it be called on a `const Percentage` and on a const reference. Mark every non-mutating member function `const`. Forgetting it is the most common reason a function "cannot take a const reference".

**Private data with a trailing underscore.** A convention, not a rule, but it makes `value_ = x` versus `value = x` visibly different inside a member function and removes the need to invent different parameter names.

## Invariants that span multiple fields

This is where classes earn their keep — when the constraint relates several pieces of data, so no single field can be validated alone.

```cpp
#include <bits/stdc++.h>
using namespace std;

// Invariant: lo_ <= hi_, always. Neither field alone can be checked.
class Range {
public:
    Range(int lo, int hi) : lo_(min(lo, hi)), hi_(max(lo, hi)) {}

    int lo() const { return lo_; }
    int hi() const { return hi_; }
    int length() const { return hi_ - lo_; }     // can never be negative
    bool contains(int x) const { return lo_ <= x && x <= hi_; }

    // Mutators preserve it jointly.
    void set_lo(int v) { lo_ = min(v, hi_); }
    void set_hi(int v) { hi_ = max(v, lo_); }

private:
    int lo_;
    int hi_;
};

int main() {
    Range r{10, 4};                              // swapped on construction
    cout << r.lo() << ".." << r.hi() << " len " << r.length() << '\n';

    r.set_lo(99);                                // clamped to hi_
    cout << r.lo() << ".." << r.hi() << '\n';
    cout << boolalpha << r.contains(10) << '\n';
}
```

`length()` can never return a negative number. Not because every caller is careful, but because the type makes it impossible. That is the whole game: **push correctness into the type so it cannot be forgotten at the call site.**

## Why this matters for data structures

Every structure in Track B is defined by its invariant, and once you state it, the implementation is nearly determined:

| Structure | Invariant |
|---|---|
| Dynamic array | `size_ <= capacity_`, and elements `[0, size_)` are constructed |
| Stack | The last element pushed is the first popped |
| Binary search tree | Every left descendant `<` node `<` every right descendant |
| Min-heap | Every node `<=` both of its children |
| Disjoint set union | Every element points along a path to its set's unique root |

When you write a bug in a BST, you have violated its invariant somewhere. Knowing the invariant turns "my tree is wrong" into "which operation left a node out of order" — a debuggable question.

## Checklist for writing a class

1. **State the invariant in a comment above the class.** If you cannot state one, write a `struct`.
2. **Establish it in the constructor.** There must be no way to construct an invalid object.
3. **Make the data private** so the constructor is the only entrance.
4. **Re-establish it in every mutator.**
5. **Mark every non-mutating function `const`.**
6. **Make single-argument constructors `explicit`.**
