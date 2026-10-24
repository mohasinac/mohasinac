---
slug: raii-and-the-rule-of-zero
moduleSlug: oop
title: RAII and the rule of 0/3/5
sortOrder: 20
status: published
summary: Why C++ needs no garbage collector, what the compiler writes for you when you own a resource, and the rule that decides how many of the five you must write.
---

**RAII** — Resource Acquisition Is Initialisation — is the idea that a resource's lifetime is tied to an object's lifetime. Acquire in the constructor, release in the destructor. The destructor runs automatically when the object goes out of scope, by any path.

This is why C++ needs no garbage collector, and it is the mechanism behind `vector`, `string`, `unique_ptr` and every structure you will write in Track B.

## The problem it solves

```cpp
#include <bits/stdc++.h>
using namespace std;

void leaky(bool bail_early) {
    int* buffer = new int[1000];

    if (bail_early) return;         // 4 KB leaked. Every early return is a leak.

    delete[] buffer;
}

void safe(bool bail_early) {
    // The vector's destructor runs on EVERY exit path from this scope.
    vector<int> buffer(1000);

    if (bail_early) return;         // freed
}                                   // freed

int main() {
    leaky(true);
    safe(true);
    cout << "no leak in safe()\n";
}
```

Manual `delete` has to be correct on every path out of a function. RAII makes it correct on all of them, including the ones you add six months later.

## Owning a resource yourself

You will do this in Track B when implementing a dynamic array. Here is the shape:

```cpp
#include <bits/stdc++.h>
using namespace std;

// Invariant: data_ points to exactly `size_` ints, or is nullptr when size_ is 0.
class Buffer {
public:
    explicit Buffer(size_t size)
        : size_(size), data_(size ? new int[size]() : nullptr) {}

    // Destructor: release. `delete[]` on nullptr is explicitly safe.
    ~Buffer() { delete[] data_; }

    size_t size() const { return size_; }
    int& operator[](size_t i) { return data_[i]; }
    const int& operator[](size_t i) const { return data_[i]; }

private:
    size_t size_;
    int* data_;
};

int main() {
    Buffer b{4};
    b[0] = 10;
    b[3] = 40;
    cout << b[0] << ' ' << b[3] << ' ' << b.size() << '\n';
}                                   // destructor frees the array
```

That compiles and works — and contains a serious latent bug.

## The bug: the compiler's defaults are wrong for owners

The compiler generates a copy constructor and copy assignment for you, and they copy **member by member**. For `Buffer` that copies the *pointer*, giving two objects that believe they own the same array. Both destructors run. The second `delete[]` on an already-freed pointer is undefined behaviour — in practice a heap corruption or a crash well away from the cause.

```cpp
#include <bits/stdc++.h>
using namespace std;

class BadBuffer {
public:
    explicit BadBuffer(size_t n) : size_(n), data_(new int[n]()) {}
    ~BadBuffer() { delete[] data_; }
    size_t size_;
    int* data_;
};

int main() {
    {
        BadBuffer a{4};
        // BadBuffer b = a;   // <-- double free when both go out of scope.
        //                        Compiles silently. Crashes later.
    }
    cout << "the copy above is commented out precisely because it is UB\n";
}
```

This is the single most important thing to understand about C++ resource management: **the default copy is correct for a type that holds values, and catastrophic for a type that owns a resource.**

## The rule of five

If you write any one of these five, you almost certainly need to consider all five:

1. Destructor
2. Copy constructor
3. Copy assignment operator
4. Move constructor
5. Move assignment operator

```cpp
#include <bits/stdc++.h>
using namespace std;

class Buffer {
public:
    explicit Buffer(size_t size)
        : size_(size), data_(size ? new int[size]() : nullptr) {}

    // 1. Destructor
    ~Buffer() { delete[] data_; }

    // 2. Copy constructor — a DEEP copy: new storage, copied contents.
    Buffer(const Buffer& other)
        : size_(other.size_), data_(other.size_ ? new int[other.size_] : nullptr) {
        copy(other.data_, other.data_ + size_, data_);
    }

    // 3. Copy assignment. Self-assignment must be safe, and the old
    // allocation must be released.
    Buffer& operator=(const Buffer& other) {
        if (this == &other) return *this;
        int* fresh = other.size_ ? new int[other.size_] : nullptr;
        copy(other.data_, other.data_ + other.size_, fresh);
        delete[] data_;
        data_ = fresh;
        size_ = other.size_;
        return *this;
    }

    // 4. Move constructor — STEAL the pointer, then blank the source so its
    // destructor has nothing to free. `noexcept` matters: vector only uses
    // the move path when it is noexcept.
    Buffer(Buffer&& other) noexcept : size_(other.size_), data_(other.data_) {
        other.size_ = 0;
        other.data_ = nullptr;
    }

    // 5. Move assignment.
    Buffer& operator=(Buffer&& other) noexcept {
        if (this == &other) return *this;
        delete[] data_;
        size_ = other.size_;
        data_ = other.data_;
        other.size_ = 0;
        other.data_ = nullptr;
        return *this;
    }

    size_t size() const { return size_; }
    int& operator[](size_t i) { return data_[i]; }

private:
    size_t size_;
    int* data_;
};

int main() {
    Buffer a{3};
    a[0] = 7;

    Buffer b = a;                     // copy ctor: independent storage
    b[0] = 99;
    cout << a[0] << ' ' << b[0] << '\n';          // 7 99 — genuinely separate

    Buffer c = std::move(a);          // move ctor: steals a's buffer
    cout << c[0] << ' ' << a.size() << '\n';      // 7 0 — a is now empty

    b = c;                            // copy assignment
    cout << b[0] << '\n';
}
```

The copy-assignment order matters: allocate the new buffer **before** deleting the old one. Written the other way round, a failed allocation would leave the object holding a dangling pointer. (In a toolchain with exceptions that is the classic exception-safety argument; here allocation failure terminates, but the ordering is still the correct habit and costs nothing.)

## The rule of zero — what you should actually aim for

Here is the punchline: **do not write any of the five.** Hold your resources in types that already manage themselves, and the compiler's defaults become correct again.

```cpp
#include <bits/stdc++.h>
using namespace std;

// No destructor, no copy, no move — and all four are correct, because vector
// already does the right thing for each of them.
class Buffer {
public:
    explicit Buffer(size_t size) : data_(size, 0) {}

    size_t size() const { return data_.size(); }
    int& operator[](size_t i) { return data_[i]; }
    const int& operator[](size_t i) const { return data_[i]; }

private:
    vector<int> data_;
};

int main() {
    Buffer a{3};
    a[0] = 7;
    Buffer b = a;                     // deep copy, for free
    b[0] = 99;
    cout << a[0] << ' ' << b[0] << '\n';
    Buffer c = std::move(a);          // move, for free
    cout << c[0] << '\n';
}
```

Twelve lines instead of sixty, and no double-free is possible. This is the rule of zero, and it is the default you should reach for in real code.

So why learn the rule of five? Because `vector` itself had to be written by someone, and in Track B that someone is you. You cannot understand what `vector` guarantees until you have implemented the five once.

## If you need only to suppress copying

Common for handles that must not be duplicated:

```cpp
#include <bits/stdc++.h>
using namespace std;

class Unique {
public:
    Unique() = default;
    Unique(const Unique&) = delete;              // copying is a compile error
    Unique& operator=(const Unique&) = delete;
    Unique(Unique&&) = default;                  // moving is fine
    Unique& operator=(Unique&&) = default;
};

int main() {
    Unique a;
    // Unique b = a;          // error: use of deleted function — good
    Unique c = std::move(a);  // fine
    cout << "move-only type\n";
}
```

`= delete` turns a runtime disaster into a compile error, which is always the better trade.
