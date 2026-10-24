---
slug: tries
moduleSlug: trees
title: Tries
sortOrder: 30
status: published
summary: The prefix tree — where lookup costs the length of the key rather than the size of the dictionary.
---

## The problem it solves

A hash set answers "is this exact word present?" in O(L) to hash the string. It cannot answer "how many stored words start with `pre`?" at all — hashing destroys prefix structure.

A **trie** stores words character by character down a tree, so every prefix is a path from the root. Prefix queries become a walk.

## The invariant

> Every node represents the prefix spelled by the path from the root to it. A node's `is_word` flag marks whether that exact prefix is a stored word. A child under letter `c` exists only if some stored word has this prefix followed by `c`.

The crucial consequence: **lookup is O(L) in the key length, independent of how many words are stored.** A trie with a million words finds a five-letter word in five steps.

## The implementation

```cpp
#include <bits/stdc++.h>
using namespace std;

/** Lowercase a-z only; one array slot per letter. */
class Trie {
public:
    Trie() : nodes_(1) {}                 // node 0 is the root (empty prefix)

    void insert(const string& word) {
        int cur = 0;
        for (char ch : word) {
            int c = ch - 'a';
            if (nodes_[cur].next[c] == -1) {
                nodes_.push_back(Node{});           // may reallocate...
                nodes_[cur].next[c] = (int)nodes_.size() - 1;
            }
            cur = nodes_[cur].next[c];
            ++nodes_[cur].passing;                  // words through this prefix
        }
        nodes_[cur].is_word = true;
    }

    /** Exact word present? */
    bool contains(const string& word) const {
        int node = walk(word);
        return node != -1 && nodes_[node].is_word;
    }

    /** Any word with this prefix? The query a hash set cannot answer. */
    bool starts_with(const string& prefix) const { return walk(prefix) != -1; }

    /** How many stored words have this prefix. */
    int count_with_prefix(const string& prefix) const {
        int node = walk(prefix);
        return node == -1 ? 0 : nodes_[node].passing;
    }

    size_t node_count() const { return nodes_.size(); }

private:
    struct Node {
        // -1 means "no child". An array, not a map: 26 slots is 104 bytes but
        // gives O(1) descent with no hashing.
        array<int, 26> next;
        bool is_word = false;
        int passing = 0;
        Node() { next.fill(-1); }
    };

    /** Index of the node for this prefix, or -1. */
    int walk(const string& s) const {
        int cur = 0;
        for (char ch : s) {
            int c = ch - 'a';
            if (c < 0 || c >= 26) return -1;
            cur = nodes_[cur].next[c];
            if (cur == -1) return -1;
        }
        return cur;
    }

    /*
     * Nodes live in one vector and children are INDICES, not pointers.
     * Deliberate: a vector<Node> reallocates as it grows, which would
     * invalidate every raw Node* in the structure. Indices survive
     * reallocation, and the contiguous storage is far better for cache
     * behaviour than a million separate allocations.
     */
    vector<Node> nodes_;
};

int main() {
    Trie t;
    for (string w : {"cat", "car", "card", "dog"}) t.insert(w);

    cout << boolalpha;
    cout << t.contains("car") << ' ' << t.contains("ca") << '\n';   // true false
    cout << t.starts_with("ca") << ' ' << t.starts_with("cz") << '\n'; // true false
    cout << t.count_with_prefix("ca") << ' '                        // 3
         << t.count_with_prefix("car") << ' '                       // 2
         << t.count_with_prefix("x") << '\n';                       // 0
    cout << "nodes: " << t.node_count() << '\n';
}
```

The index-not-pointer decision in the comment is the one worth stealing. It is the standard way to build any tree in competitive C++: one `vector` of nodes, children as `int`, which sidesteps both allocation cost and iterator invalidation.

## Wildcard search

Tries also support patterns, because you can branch the walk — something neither a hash set nor a sorted array can do:

```cpp
#include <bits/stdc++.h>
using namespace std;

class WildcardDict {
public:
    WildcardDict() : nodes_(1) {}

    void insert(const string& word) {
        int cur = 0;
        for (char ch : word) {
            int c = ch - 'a';
            if (nodes_[cur].next[c] == -1) {
                nodes_.push_back(Node{});
                nodes_[cur].next[c] = (int)nodes_.size() - 1;
            }
            cur = nodes_[cur].next[c];
        }
        nodes_[cur].is_word = true;
    }

    /** '.' matches any single letter. */
    bool search(const string& pattern) const { return match(0, pattern, 0); }

private:
    struct Node {
        array<int, 26> next;
        bool is_word = false;
        Node() { next.fill(-1); }
    };

    bool match(int node, const string& p, size_t i) const {
        if (node == -1) return false;
        if (i == p.size()) return nodes_[node].is_word;

        if (p[i] != '.') {
            return match(nodes_[node].next[p[i] - 'a'], p, i + 1);
        }
        // Wildcard: try every existing child. This is the branch that makes
        // worst-case cost O(26^d) for a pattern of d dots.
        for (int c = 0; c < 26; ++c)
            if (nodes_[node].next[c] != -1 && match(nodes_[node].next[c], p, i + 1))
                return true;
        return false;
    }

    vector<Node> nodes_;
};

int main() {
    WildcardDict d;
    for (string w : {"bad", "dad", "mad"}) d.insert(w);
    cout << boolalpha;
    cout << d.search("pad") << ' ' << d.search("bad") << ' '
         << d.search(".ad") << ' ' << d.search("b..") << '\n';
    // false true true true
}
```

## Complexity

Let `L` be the key length, `n` the number of words, `A` the alphabet size.

| Operation | Trie | Hash set | Sorted array |
|---|---|---|---|
| Insert | O(L) | O(L) | O(n) |
| Exact lookup | O(L) | O(L) average | O(L log n) |
| **Prefix exists** | **O(L)** | O(n·L) | O(L log n) |
| **Count with prefix** | **O(L)** | O(n·L) | O(L log n) |
| All words with prefix | O(L + output) | O(n·L) | O(L log n + output) |
| Memory | O(n · L · A) worst | O(n · L) | O(n · L) |

That memory column is the trade. An array-of-26 per node is wasteful when the tree is sparse — one 10-character word costs 10 nodes × 104 bytes. Swap `array<int,26>` for a small `unordered_map<char,int>` or a sorted vector of pairs when the alphabet is large or the data sparse.

A sorted array with binary search competes surprisingly well for prefix *existence*, since prefixes are contiguous in sorted order. The trie wins decisively when you need counts, wildcards, or incremental descent — such as walking the trie alongside a DFS on a grid.

## Pitfalls

- **Raw `Node*` children with `vector<Node>` storage.** Reallocation invalidates them. Use indices.
- **Assuming lowercase.** `ch - 'a'` on an uppercase letter or a digit indexes out of bounds. Validate, or widen the alphabet.
- **Forgetting `is_word`.** Without it, inserting `"card"` makes `contains("car")` true. The flag is what distinguishes a stored word from a mere prefix.
- **Memory on large alphabets.** 26 is fine; Unicode is not. Switch the child representation.
- **Deleting naively.** Removing a word must not remove nodes still needed by another word. Decrement `passing` and only free when it reaches zero — or just clear `is_word` and accept the dead nodes.

## Problems that use it

Implement trie (prefix tree) · design add-and-search-words data structure · word search II (trie plus grid DFS — the trie prunes the search dramatically) · longest common prefix · replace words · maximum XOR of two numbers (a binary trie over bits, which is the same structure with `A = 2`).
