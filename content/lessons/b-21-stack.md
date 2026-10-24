---
slug: the-stack
moduleSlug: adapters
title: The stack
sortOrder: 10
status: published
summary: Last in, first out — the structure whose restriction is its entire value, and the one that models "what am I in the middle of".
---

## The problem it solves

Some problems have a natural notion of "the thing I am currently inside". Nested brackets: the innermost unclosed one. Function calls: the one that will return next. An undo history: the last action taken. A depth-first search: the vertex you are still exploring.

In every case you need the **most recently added** item and nothing else. A stack gives you exactly that, and gives it in O(1).

## The invariant

> The only accessible element is the most recently pushed one that has not been popped. Push and pop both act on the same end.

That is the whole definition. Notice it is a statement about *access*, not about layout — which is why both an array and a linked list can implement it.

## The implementation

```cpp
#include <bits/stdc++.h>
using namespace std;

template <typename T>
class Stack {
public:
    // Rule of zero: vector owns the memory, so copy, move and destruction
    // are all correct without writing any of them.

    void push(const T& value) { data_.push_back(value); }

    // Returning optional instead of UB-on-empty. In a sandbox built with
    // -fno-exceptions this is not a style preference — there is no throw
    // available, and silently reading data_.back() on an empty vector is
    // undefined behaviour that usually returns plausible garbage.
    optional<T> pop() {
        if (data_.empty()) return nullopt;
        T value = std::move(data_.back());
        data_.pop_back();
        return value;
    }

    optional<T> top() const {
        if (data_.empty()) return nullopt;
        return data_.back();
    }

    bool empty() const { return data_.empty(); }
    size_t size() const { return data_.size(); }

private:
    // The back of a vector is the top of the stack. Both push_back and
    // pop_back are O(1) amortised, so no shifting ever happens.
    vector<T> data_;
};

int main() {
    Stack<int> s;
    for (int x : {1, 2, 3}) s.push(x);

    cout << *s.top() << '\n';            // 3
    while (auto x = s.pop()) cout << *x << ' ';
    cout << '\n';                        // 3 2 1 — reversed, by construction

    cout << boolalpha << s.empty() << '\n';
    cout << (s.pop() ? "popped" : "empty, handled") << '\n';
}
```

Note the deliberate design choice: `pop()` both removes and returns. `std::stack` splits these (`top()` then `pop()`) because a combined version cannot be exception-safe when the copy throws. Here, with no exceptions, the combined form is safe and more convenient — a case where the standard library's constraint does not apply to us.

## Watch it push and pop

Three pushes, then three pops. Notice the order comes out reversed without anything reversing it — that falls out of the invariant.

```viz
{ "demo": "stack", "ops": [1, 2, 3], "title": "push 1, 2, 3 then pop" }
```

## The canonical application: bracket matching

```cpp
#include <bits/stdc++.h>
using namespace std;

bool balanced(const string& s) {
    stack<char> open;
    // A table beats a chain of ifs and is trivially extensible.
    const unordered_map<char, char> pairs{{')', '('}, {']', '['}, {'}', '{'}};

    for (char c : s) {
        if (c == '(' || c == '[' || c == '{') {
            open.push(c);
        } else {
            auto it = pairs.find(c);
            if (it == pairs.end()) continue;          // ignore other chars
            // Two distinct failures: nothing open, or the wrong thing open.
            if (open.empty() || open.top() != it->second) return false;
            open.pop();
        }
    }
    // Leftover opens are unbalanced too — the check people forget.
    return open.empty();
}

int main() {
    for (string s : {"()", "([{}])", "(]", "((", "", "a(b)c"})
        cout << '"' << s << "\" -> " << boolalpha << balanced(s) << '\n';
}
```

The final `return open.empty()` is the bug people ship: `"(("` passes every loop iteration and is still unbalanced.

## Recursion is a stack

Every recursive function uses the call stack. Any recursion can therefore be rewritten with an explicit stack — which is how you avoid stack overflow on deep inputs.

```cpp
#include <bits/stdc++.h>
using namespace std;

int main() {
    // Depth-first search without recursion. On a 10^5-node path graph the
    // recursive version overflows the stack; this one does not.
    vector<vector<int>> adj{{1, 2}, {0, 3}, {0}, {1}};

    vector<bool> seen(adj.size(), false);
    stack<int> st;
    st.push(0);

    while (!st.empty()) {
        int u = st.top();
        st.pop();
        if (seen[u]) continue;        // a node can be pushed more than once
        seen[u] = true;
        cout << u << ' ';
        for (int v : adj[u]) if (!seen[v]) st.push(v);
    }
    cout << '\n';
}
```

That `if (seen[u]) continue;` after popping — rather than marking at push time — is the usual source of duplicate visits in iterative DFS.

## Complexity

| Operation | Cost |
|---|---|
| `push` | O(1) amortised |
| `pop` | O(1) |
| `top` | O(1) |
| Search | O(n), and it destroys the stack to do it |
| Memory | O(n) |

## Pitfalls

- **Popping an empty stack.** `std::stack::top()` on empty is undefined behaviour, not an error. Always check `empty()` first, or return an `optional` as above.
- **Forgetting the final emptiness check** in matching problems.
- **`top()` then `pop()` order.** `pop()` returns `void` in the STL; read before you remove.
- **Using a stack where you needed a queue.** DFS versus BFS is exactly this choice, and swapping them changes the answer, not just the order.

## Problems that use it

Valid parentheses · min stack · evaluate reverse Polish notation · generate parentheses · daily temperatures and largest rectangle in histogram (via the monotonic-stack pattern in Track C) · implement a queue using two stacks · iterative tree traversals.
