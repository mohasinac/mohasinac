---
slug: what-is-a-data-structure
moduleSlug: linear
title: What a data structure actually is
sortOrder: 5
status: published
summary: Before any implementation — the idea that a data structure is a trade, and that choosing one means choosing which operation you want to be fast.
---

A **data structure** is an arrangement of data in memory together with the operations it supports. That definition sounds dry until you add the part that matters:

> Every data structure is a **trade**. It makes some operations fast by making others slow. There is no structure that is best at everything, and if there were, there would be only one.

Choosing a data structure is choosing which operation you want to be fast, which is why the first question is never "which structure is best" but "what does my algorithm *do* most often?"

## The trade, made concrete

Consider storing a collection and asking: is `x` present?

- **Unsorted array.** Insert is O(1) — put it at the end. Search is O(n) — look at everything.
- **Sorted array.** Search is O(log n) via binary search. Insert is O(n) — everything after the insertion point shifts.
- **Hash table.** Both O(1) average. The cost: no ordering at all, extra memory, and an O(n) worst case.
- **Balanced tree.** Both O(log n), guaranteed, and ordering is preserved. The cost: a worse constant factor and pointer chasing.

Four structures, four different bargains. The unsorted array is not "worse" than the hash table — it uses less memory, is perfectly cache-friendly, and if you only ever append and then iterate once, it is strictly better.

## The three questions

When you pick a structure, you are answering:

1. **What operations does my algorithm perform, and how often?** A graph traversal does "give me the neighbours of `u`" once per vertex — that is an adjacency list. Counting word frequencies does "increment the count for this string" once per word — that is a hash map.
2. **What ordering do I need?** None → hash. Sorted → tree or sorted array. Insertion order → array. Only the extreme element → heap.
3. **What can I afford?** Memory, and worst case versus average case.

## Abstract type versus implementation

A distinction worth keeping straight, because interviews ask about it:

- An **abstract data type (ADT)** is the *interface* — the operations and their meaning. "A stack supports push, pop and top, and pop removes the most recently pushed element."
- A **data structure** is the *implementation* — how it is actually laid out. A stack can be an array or a linked list.

The ADT is the promise; the structure is how the promise is kept. This is exactly the interface-versus-implementation idea from the [composition lesson](/course/lessons/composition-versus-inheritance), which is why the structures in this track are written against an interface: it keeps the promise and the mechanism visibly separate.

```cpp
#include <bits/stdc++.h>
using namespace std;

// The ADT — what a stack PROMISES, with no commitment to how.
class IntStack {
public:
    virtual ~IntStack() = default;
    virtual void push(int x) = 0;
    virtual void pop() = 0;
    virtual optional<int> top() const = 0;
    virtual bool empty() const = 0;
};

// Implementation 1: contiguous storage. Cache-friendly, amortised O(1).
class ArrayStack : public IntStack {
public:
    void push(int x) override { data_.push_back(x); }
    void pop() override { if (!data_.empty()) data_.pop_back(); }
    optional<int> top() const override {
        if (data_.empty()) return nullopt;
        return data_.back();
    }
    bool empty() const override { return data_.empty(); }
private:
    vector<int> data_;
};

// Implementation 2: a linked list. True O(1) worst case per push, no
// reallocation — but an allocation per element and poor locality.
class ListStack : public IntStack {
public:
    void push(int x) override { head_ = make_unique<Node>(x, std::move(head_)); }
    void pop() override { if (head_) head_ = std::move(head_->next); }
    optional<int> top() const override {
        if (!head_) return nullopt;
        return head_->value;
    }
    bool empty() const override { return head_ == nullptr; }
private:
    struct Node {
        int value;
        unique_ptr<Node> next;
        Node(int v, unique_ptr<Node> n) : value(v), next(std::move(n)) {}
    };
    unique_ptr<Node> head_;
};

// This function cannot tell which it was given — and does not need to.
void exercise(IntStack& s) {
    s.push(1);
    s.push(2);
    s.push(3);
    s.pop();
    if (auto t = s.top()) cout << *t << ' ';
}

int main() {
    ArrayStack a;
    ListStack l;
    exercise(a);
    exercise(l);
    cout << '\n';                 // 2 2 — same behaviour, different structures
}
```

Both print `2`. Same ADT, same observable behaviour, completely different memory layout and performance profile. That is the distinction made executable.

## What a stack is, in one paragraph

Since this track is going to build one: a **stack** is a collection where the only accessible element is the most recently added one. Last in, first out. The restriction is the feature — because it exactly models "the thing I am currently in the middle of", which is why it appears in function calls, bracket matching, undo history, and depth-first search.

A **queue** is the same idea with the opposite discipline: first in, first out, modelling "the next thing waiting its turn" — which is why breadth-first search uses one.

## How each lesson in this track is organised

1. **The problem it solves** — what goes wrong without it.
2. **The invariant** — the statement that is always true. This is the definition.
3. **The implementation** — as a class, against an interface.
4. **The complexity table.**
5. **The pitfalls** — the bugs people actually write.
6. **The problems** that need it.

Step 2 is the one to slow down on. As the [invariants lesson](/course/lessons/classes-as-invariants) argued, once you can state the invariant, the implementation is nearly forced — and every bug you write in the structure will be a place where you broke it.
