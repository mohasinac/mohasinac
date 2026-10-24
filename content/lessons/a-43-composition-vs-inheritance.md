---
slug: composition-versus-inheritance
moduleSlug: oop
title: Composition, inheritance and virtual dispatch
sortOrder: 30
status: published
summary: What inheritance actually promises, the two bugs that make it dangerous, and why composition is the right default.
---

Inheritance gets taught first and used too much. The useful distinction:

- **Composition** is *has-a*. A `Stack` has a `vector`.
- **Inheritance** is *is-a*, and specifically: anywhere the base type is expected, a derived object must work correctly. That is the **Liskov substitution principle**, and it is a promise about behaviour, not just about which functions exist.

If you cannot honestly say "a `Derived` is a `Base` and may be used anywhere one is expected", you want composition.

## Composition — the default

```cpp
#include <bits/stdc++.h>
using namespace std;

// A Stack HAS a vector. It does not expose vector's interface, which is the
// entire point: push_front on a stack would be meaningless.
class Stack {
public:
    void push(int x) { data_.push_back(x); }

    void pop() {
        if (!data_.empty()) data_.pop_back();
    }

    // Returns nullopt rather than UB on an empty stack. No exceptions needed.
    optional<int> top() const {
        if (data_.empty()) return nullopt;
        return data_.back();
    }

    bool empty() const { return data_.empty(); }
    size_t size() const { return data_.size(); }

private:
    vector<int> data_;
};

int main() {
    Stack s;
    s.push(1);
    s.push(2);
    if (auto t = s.top()) cout << *t << '\n';
    s.pop();
    if (auto t = s.top()) cout << *t << '\n';
    cout << s.size() << '\n';
}
```

Had `Stack` inherited from `vector`, callers could call `insert` in the middle and the "stack" guarantee would be a suggestion. **Composition lets you choose what to expose; public inheritance exposes everything the base has.**

## When inheritance is right: a shared interface

Inheritance earns its place when you need to treat different implementations uniformly through one interface.

```cpp
#include <bits/stdc++.h>
using namespace std;

// An abstract interface: pure virtual functions, no data, virtual destructor.
class Shape {
public:
    // 🛑 A virtual destructor is MANDATORY in any class deleted through a base
    // pointer. Without it, `delete base_ptr` runs only the base destructor and
    // the derived part leaks — silently.
    virtual ~Shape() = default;

    virtual double area() const = 0;        // = 0 makes it pure virtual
    virtual string name() const = 0;

    // A non-virtual function implemented in terms of the virtual ones.
    void describe() const {
        cout << name() << " area=" << area() << '\n';
    }
};

class Circle : public Shape {
public:
    explicit Circle(double r) : r_(r) {}
    // `override` is not decoration: it makes the compiler verify that this
    // really does override something. A typo in the signature becomes an
    // error instead of a silently separate function.
    double area() const override { return 3.14159265358979 * r_ * r_; }
    string name() const override { return "circle"; }
private:
    double r_;
};

class Rect : public Shape {
public:
    Rect(double w, double h) : w_(w), h_(h) {}
    double area() const override { return w_ * h_; }
    string name() const override { return "rect"; }
private:
    double w_, h_;
};

int main() {
    // unique_ptr so the destructors run without manual delete.
    vector<unique_ptr<Shape>> shapes;
    shapes.push_back(make_unique<Circle>(1.0));
    shapes.push_back(make_unique<Rect>(2.0, 3.0));

    // The call site knows nothing about Circle or Rect. Adding a Triangle
    // requires no change here — that is what the abstraction buys.
    for (const auto& s : shapes) s->describe();

    double total = 0;
    for (const auto& s : shapes) total += s->area();
    cout << "total " << total << '\n';
}
```

## The two bugs that make inheritance dangerous

**Missing virtual destructor.** Covered above. The rule: if a class has any virtual function, it needs a virtual destructor. No exceptions.

**Object slicing.** Copying a derived object into a base-typed variable silently discards the derived part:

```cpp
#include <bits/stdc++.h>
using namespace std;

class Base {
public:
    virtual ~Base() = default;
    virtual int id() const { return 1; }
};

class Derived : public Base {
public:
    int id() const override { return 2; }
};

// BY VALUE: the Derived part is sliced off on the way in. Always 1.
void by_value(Base b) { cout << "by value: " << b.id() << '\n'; }

// BY REFERENCE: polymorphism works.
void by_ref(const Base& b) { cout << "by ref:   " << b.id() << '\n'; }

int main() {
    Derived d;
    by_value(d);        // prints 1 — the bug
    by_ref(d);          // prints 2 — correct
}
```

**Polymorphism requires a pointer or a reference.** Pass by `const Base&` or `Base*`, never by value. This is one of the most common C++ bugs and the compiler gives you no warning at all.

## What virtual dispatch costs

Each polymorphic object carries a hidden pointer to a table of function pointers (the vtable); each virtual call is an indirect jump through it. That means:

- An extra pointer per object (8 bytes).
- An indirect call the compiler usually cannot inline.
- Poor branch prediction when the dynamic type varies.

For a 60-line contest solution this is irrelevant — but it is the reason a tight inner loop over 10⁷ elements should not make a virtual call per element. In Track B the structures are concrete classes for exactly this reason; the interface-based versions are there to show the design, not to be the hot path.

## Templates: the other way to be generic

```cpp
#include <bits/stdc++.h>
using namespace std;

// Works for any type supporting <. Resolved at COMPILE time, so the call is
// inlined and there is no vtable — "compile-time polymorphism".
template <typename T>
T smaller(const T& a, const T& b) {
    return a < b ? a : b;
}

// A generic container: one class definition, a distinct type per T.
template <typename T>
class Box {
public:
    explicit Box(T value) : value_(std::move(value)) {}
    const T& get() const { return value_; }
private:
    T value_;
};

int main() {
    cout << smaller(3, 7) << ' ' << smaller(2.5, 1.5) << ' '
         << smaller(string{"pear"}, string{"apple"}) << '\n';

    Box<int> bi{42};
    Box<string> bs{"hello"};
    cout << bi.get() << ' ' << bs.get() << '\n';
}
```

| | Inheritance | Templates |
|---|---|---|
| Resolved | At run time | At compile time |
| Cost | Indirect call, vtable pointer | None at run time; larger binary |
| Types known | Can be loaded later | All known when compiling |
| Errors | At the call site | Deep, verbose instantiation errors |

Rule of thumb: **templates when the set of types is known at compile time** (which, in competitive programming, is always). **Inheritance when the set must be open-ended** — plugins, heterogeneous collections, a `CodeRunner` you might swap out later.

## The defaults

1. Start with composition.
2. Reach for inheritance only for a genuine shared interface used polymorphically.
3. Every polymorphic base gets a `virtual` destructor.
4. Every override is marked `override`.
5. Pass polymorphic types by reference or pointer, never by value.
6. If the types are known at compile time, prefer a template.
