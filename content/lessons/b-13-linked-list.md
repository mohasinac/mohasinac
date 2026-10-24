---
slug: linked-lists
moduleSlug: linear
title: Linked lists
sortOrder: 20
status: published
summary: Singly and doubly linked, built with unique_ptr and with raw pointers — plus the reversal that half of all interviews ask for.
---

## The problem it solves

A dynamic array pays O(n) to insert anywhere but the end, because the elements after the insertion point must shift. A linked list pays O(1) for an insertion **given a pointer to the position**, because nothing moves — only pointers are rewired.

The catch, and the reason `vector` usually wins anyway: getting that pointer costs O(n), and every node is a separate allocation somewhere else in memory, so traversal is cache-hostile. A linked list is the right answer much less often than its prominence in interviews suggests.

## The invariant

> `head_` is the first node or `nullptr`. Following `next` from `head_` visits every element exactly once and terminates at `nullptr`. `size_` equals the number of nodes reachable that way.

The last clause is where bugs live: any operation that adds or removes a node must update `size_`, or the structure lies about itself.

## Singly linked, with ownership

`unique_ptr` makes the ownership explicit — each node owns the next — and gives the rule of zero, so no destructor is needed.

```cpp
#include <bits/stdc++.h>
using namespace std;

template <typename T>
class ForwardList {
public:
    // No destructor, no copy/move written: unique_ptr handles all of it.
    // (See the rule of zero.) Copying is implicitly deleted because
    // unique_ptr is not copyable — which is honest, not a limitation.

    void push_front(const T& value) {
        // The new node takes ownership of the old head.
        head_ = make_unique<Node>(value, std::move(head_));
        ++size_;
    }

    void pop_front() {
        if (!head_) return;
        head_ = std::move(head_->next);     // old head is freed here
        --size_;
    }

    optional<T> front() const {
        if (!head_) return nullopt;
        return head_->value;
    }

    bool empty() const { return head_ == nullptr; }
    size_t size() const { return size_; }

    // Insert after the k-th node (0-based). O(k) to walk there.
    void insert_after(size_t k, const T& value) {
        Node* cur = head_.get();
        for (size_t i = 0; i < k && cur; ++i) cur = cur->next.get();
        if (!cur) return;
        cur->next = make_unique<Node>(value, std::move(cur->next));
        ++size_;
    }

    // The interview question. Iterative, because recursion is O(n) stack.
    void reverse() {
        unique_ptr<Node> prev = nullptr;
        unique_ptr<Node> cur = std::move(head_);
        while (cur) {
            unique_ptr<Node> next = std::move(cur->next);  // save
            cur->next = std::move(prev);                   // flip
            prev = std::move(cur);                         // advance
            cur = std::move(next);
        }
        head_ = std::move(prev);
    }

    void print() const {
        for (Node* p = head_.get(); p; p = p->next.get()) cout << p->value << ' ';
        cout << '\n';
    }

private:
    struct Node {
        T value;
        unique_ptr<Node> next;
        Node(const T& v, unique_ptr<Node> n) : value(v), next(std::move(n)) {}
    };

    unique_ptr<Node> head_ = nullptr;
    size_t size_ = 0;
};

int main() {
    ForwardList<int> l;
    for (int x : {3, 2, 1}) l.push_front(x);
    l.print();                               // 1 2 3
    l.reverse();
    l.print();                               // 3 2 1
    l.insert_after(1, 99);
    l.print();                               // 3 2 99 1
    l.pop_front();
    l.print();                               // 2 99 1
    cout << l.size() << '\n';
}
```

## The reversal, as it is actually asked

Interviews give you raw `next` pointers, so here is the version to have at your fingertips. Three pointers, four lines, and the order of the four lines is the whole problem:

```cpp
#include <bits/stdc++.h>
using namespace std;

struct ListNode {
    int val;
    ListNode* next;
    explicit ListNode(int v) : val(v), next(nullptr) {}
};

ListNode* reverse_list(ListNode* head) {
    ListNode* prev = nullptr;
    while (head) {
        ListNode* next = head->next;    // 1. save, or you lose the rest
        head->next = prev;              // 2. flip this link
        prev = head;                    // 3. prev advances
        head = next;                    // 4. head advances
    }
    return prev;                        // prev is the new head
}

int main() {
    // Build 1 -> 2 -> 3. Raw new/delete here only to mirror the interview form.
    ListNode* a = new ListNode(1);
    a->next = new ListNode(2);
    a->next->next = new ListNode(3);

    ListNode* r = reverse_list(a);
    for (ListNode* p = r; p; p = p->next) cout << p->val << ' ';
    cout << '\n';                       // 3 2 1

    while (r) { ListNode* n = r->next; delete r; r = n; }
}
```

Step 1 is the one people omit. Without saving `next` first, assigning `head->next = prev` destroys the only reference to the remainder of the list.

## Doubly linked, with a sentinel

Two refinements: `prev` pointers make backward traversal and O(1) erase-given-a-node possible, and a **sentinel** node removes every `nullptr` special case.

```cpp
#include <bits/stdc++.h>
using namespace std;

// A circular list with one sentinel. Invariant: the sentinel always exists;
// an empty list is one where the sentinel points at itself. There is NO
// null-pointer case anywhere, which is the entire reason to do this.
class DoublyList {
public:
    // Declared FIRST: a nested type must be visible before any member
    // declaration mentions it. Moving this below erase() is a compile error,
    // because parameter types are resolved in declaration order.
    struct Node {
        int value;
        Node* next = nullptr;
        Node* prev = nullptr;
        explicit Node(int v) : value(v) {}
    };

    DoublyList() {
        sentinel_ = new Node(0);
        sentinel_->next = sentinel_->prev = sentinel_;
    }

    ~DoublyList() {
        Node* p = sentinel_->next;
        while (p != sentinel_) {
            Node* n = p->next;
            delete p;
            p = n;
        }
        delete sentinel_;
    }

    DoublyList(const DoublyList&) = delete;            // owns raw nodes
    DoublyList& operator=(const DoublyList&) = delete;

    void push_back(int v) { insert_before(sentinel_, v); }
    void push_front(int v) { insert_before(sentinel_->next, v); }

    // O(1), no traversal — the thing a vector cannot do.
    void erase(Node* node) {
        if (node == sentinel_) return;
        node->prev->next = node->next;
        node->next->prev = node->prev;
        delete node;
        --size_;
    }

    Node* begin_node() const { return sentinel_->next; }
    Node* end_node() const { return sentinel_; }
    size_t size() const { return size_; }

private:
    void insert_before(Node* pos, int v) {
        Node* n = new Node(v);
        n->next = pos;
        n->prev = pos->prev;
        pos->prev->next = n;
        pos->prev = n;
        ++size_;
    }

    Node* sentinel_;
    size_t size_ = 0;
};

int main() {
    DoublyList l;
    for (int x : {1, 2, 3, 4}) l.push_back(x);

    for (auto* p = l.begin_node(); p != l.end_node(); p = p->next) cout << p->value << ' ';
    cout << '\n';

    // Erase the second node in O(1).
    l.erase(l.begin_node()->next);
    for (auto* p = l.begin_node(); p != l.end_node(); p = p->next) cout << p->value << ' ';
    cout << "\nsize " << l.size() << '\n';

    // Backwards, which a singly linked list cannot do.
    for (auto* p = l.end_node()->prev; p != l.end_node(); p = p->prev) cout << p->value << ' ';
    cout << '\n';
}
```

The sentinel is worth the extra node. Compare the four-line `erase` above with the version that must handle "node is the head", "node is the tail", "node is the only element" and "list is empty" separately.

Head insertion is free; reaching the middle is not. Both, in order:

```viz
{ "demo": "linkedList", "values": [3, 2, 1], "title": "insert at the head, then delete the middle" }
```

## Complexity

| Operation | Singly | Doubly | `vector` |
|---|---|---|---|
| `push_front` | O(1) | O(1) | O(n) |
| `push_back` | O(n) without a tail pointer | O(1) | O(1) amortised |
| Erase given a node | O(n) (need `prev`) | O(1) | O(n) |
| Index access | O(n) | O(n) | **O(1)** |
| Search | O(n) | O(n) | O(n) |
| Memory per element | value + 1 pointer | value + 2 pointers | value |
| Cache behaviour | Poor | Poor | **Excellent** |

## Pitfalls

- **Losing the rest of the list** in reversal by not saving `next` first.
- **Not updating `size_`** in every path that adds or removes.
- **Returning the old head** from `reverse` instead of `prev`.
- **Copy semantics.** A list of raw nodes has the exact double-free problem from the RAII lesson. Either `= delete` the copy or write a deep one.
- **Recursive traversal on long lists.** Depth equals length; 10⁵ nodes overflows the stack. Iterate.
- **Reaching for a list by reflex.** If you need index access or you mostly append, `vector` wins — often by a factor of ten on real data, despite identical big-O.

## The two-pointer connection

Fast-and-slow pointers — cycle detection, finding the middle — are a linked-list technique that generalises. Covered in Track C, but the list is where it comes from: with no index access, "the middle" is only reachable by having one pointer move twice as fast as another.

## Problems that use it

Reverse a linked list · merge two sorted lists · linked list cycle · reorder list · remove nth node from end · LRU cache (doubly linked list plus a hash map — the canonical application of O(1) erase-given-a-node).
