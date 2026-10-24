---
slug: dynamic-array
moduleSlug: linear
title: The dynamic array
sortOrder: 10
status: published
summary: Build std::vector. Once you have written the growth policy and the five special members, you understand the container you use in every other problem.
---

## The problem it solves

A raw array has a size fixed when you create it. Real problems do not tell you the size in advance — you read until end of input, or you collect results whose count depends on the data. You need a sequence that grows.

The naive growth policy is "allocate one bigger and copy". The [amortised cost lesson](/course/lessons/amortised-cost) showed why that is O(n²) over `n` appends and why **doubling** makes it O(1) amortised. That insight is the entire design.

## The invariant

> `data_` points to storage for `capacity_` elements. The first `size_` of them hold valid values. `size_ <= capacity_`.

Every operation below either preserves that or is a bug.

## The implementation

```cpp
#include <bits/stdc++.h>
using namespace std;

template <typename T>
class DynArray {
public:
    DynArray() = default;

    explicit DynArray(size_t count, const T& value = T())
        : size_(count), capacity_(count), data_(count ? new T[count] : nullptr) {
        for (size_t i = 0; i < size_; ++i) data_[i] = value;
    }

    // --- the rule of five, because this class owns raw memory -------------
    ~DynArray() { delete[] data_; }

    DynArray(const DynArray& other)
        : size_(other.size_), capacity_(other.size_),
          data_(other.size_ ? new T[other.size_] : nullptr) {
        for (size_t i = 0; i < size_; ++i) data_[i] = other.data_[i];
    }

    DynArray& operator=(const DynArray& other) {
        if (this == &other) return *this;
        T* fresh = other.size_ ? new T[other.size_] : nullptr;
        for (size_t i = 0; i < other.size_; ++i) fresh[i] = other.data_[i];
        delete[] data_;
        data_ = fresh;
        size_ = capacity_ = other.size_;
        return *this;
    }

    DynArray(DynArray&& other) noexcept
        : size_(other.size_), capacity_(other.capacity_), data_(other.data_) {
        other.size_ = other.capacity_ = 0;
        other.data_ = nullptr;
    }

    DynArray& operator=(DynArray&& other) noexcept {
        if (this == &other) return *this;
        delete[] data_;
        size_ = other.size_;
        capacity_ = other.capacity_;
        data_ = other.data_;
        other.size_ = other.capacity_ = 0;
        other.data_ = nullptr;
        return *this;
    }

    // --- capacity ---------------------------------------------------------
    size_t size() const { return size_; }
    size_t capacity() const { return capacity_; }
    bool empty() const { return size_ == 0; }

    void reserve(size_t want) {
        if (want <= capacity_) return;            // never shrink here
        T* fresh = new T[want];
        for (size_t i = 0; i < size_; ++i) fresh[i] = std::move(data_[i]);
        delete[] data_;
        data_ = fresh;
        capacity_ = want;
    }

    // --- modifiers --------------------------------------------------------
    void push_back(const T& value) {
        // The growth policy. Multiplicative, so n appends cost O(n) total.
        // The `? 1 :` handles the empty case, where doubling 0 is still 0 —
        // an infinite loop of reallocating nothing.
        if (size_ == capacity_) reserve(capacity_ ? capacity_ * 2 : 1);
        data_[size_++] = value;
    }

    void pop_back() {
        // Capacity is deliberately NOT reduced: shrinking on every pop would
        // destroy the amortised bound for a push/pop alternating workload.
        if (size_) --size_;
    }

    void clear() { size_ = 0; }

    // --- access -----------------------------------------------------------
    T& operator[](size_t i) { return data_[i]; }
    const T& operator[](size_t i) const { return data_[i]; }

    T& back() { return data_[size_ - 1]; }
    T& front() { return data_[0]; }

    // Range-for support: the compiler needs exactly begin() and end().
    T* begin() { return data_; }
    T* end() { return data_ + size_; }
    const T* begin() const { return data_; }
    const T* end() const { return data_ + size_; }

private:
    size_t size_ = 0;
    size_t capacity_ = 0;
    T* data_ = nullptr;
};

int main() {
    DynArray<int> a;
    cout << "growth: ";
    size_t cap = a.capacity();
    for (int i = 0; i < 20; ++i) {
        a.push_back(i);
        if (a.capacity() != cap) {
            cap = a.capacity();
            cout << cap << ' ';
        }
    }
    cout << "\nsize " << a.size() << " capacity " << a.capacity() << '\n';

    // Doubling: 1 2 4 8 16 32 — six reallocations for twenty appends.
    for (int x : a) cout << x << ' ';
    cout << '\n';

    DynArray<int> b = a;                  // deep copy
    b[0] = 999;
    cout << a[0] << ' ' << b[0] << '\n';  // 0 999 — independent

    DynArray<int> c = std::move(a);       // steal
    cout << c.size() << ' ' << a.size() << '\n';   // 20 0
}
```

## Complexity

| Operation | Cost | Note |
|---|---|---|
| `operator[]` | O(1) | Pointer arithmetic |
| `push_back` | O(1) amortised, O(n) worst | Worst case is the reallocating call |
| `pop_back` | O(1) | Capacity untouched |
| `reserve` | O(n) | One copy of the live elements |
| Insert/erase in middle | O(n) | Everything after shifts |
| Search (unsorted) | O(n) | — |
| Memory | O(capacity) | Up to 2× the data you store |

## Pitfalls

- **Doubling from zero.** `capacity_ * 2` is `0` when capacity is `0`. Without the `? 1 :` guard, `reserve(0)` returns immediately and `push_back` writes past the end — undefined behaviour on the very first append.
- **Shrinking on `pop_back`.** Tempting and wrong: a loop alternating push and pop at the boundary would reallocate every iteration, turning O(1) amortised into O(n) per operation.
- **Copying before freeing.** In `operator=`, allocate and fill the new buffer *before* `delete[]` the old. Reversed, a failure leaves a dangling pointer. Same ordering argument as the [RAII lesson](/course/lessons/raii-and-the-rule-of-zero).
- **Self-assignment.** `a = a` without the `this == &other` check frees the storage it is about to read from.
- **Forgetting `noexcept` on the moves.** `std::vector` only uses the move path during reallocation if the move is `noexcept`; without it, your type silently gets copied.
- **Returning a reference into the buffer, then pushing.** `T& r = a.back(); a.push_back(x);` may reallocate and leave `r` dangling. This is why iterator invalidation is a rule and not a suggestion.

## Where it shows up

Essentially everywhere: `vector` is the default container. More specifically, the growth-policy insight reappears in hash-table rehashing, and the "contiguous storage, index arithmetic" idea is what makes the array-backed heap in this track possible.
