---
slug: binary-trees-and-bst
moduleSlug: trees
title: Binary trees and the BST
sortOrder: 10
status: published
summary: The four traversals, the ordering invariant that makes a search tree searchable, and the degenerate case that destroys it.
---

## The problem it solves

A sorted array gives O(log n) search but O(n) insertion. A linked list gives O(1) insertion but O(n) search. A **binary search tree** gives O(log n) for both — when it stays balanced.

## The invariant

For a binary tree, only structure:

> Every node has at most two children. There are no cycles; exactly one node (the root) has no parent.

For a **binary search tree**, the ordering constraint that makes search possible:

> For every node `n`: **every** key in `n`'s left subtree is `< n->key`, and **every** key in its right subtree is `> n->key`.

Read that carefully. It is not "the left child is smaller" — it is *every descendant*. This tree satisfies the weak version and is not a BST:

```
    10
   /  \
  5    15
      /
     3        <- 3 < 10, but it is in the RIGHT subtree of 10
```

Validating a BST by comparing each node only to its children is the single most common wrong answer on the problem.

## The implementation

```cpp
#include <bits/stdc++.h>
using namespace std;

class BST {
public:
    void insert(int key) { root_ = insert_at(std::move(root_), key); }

    bool contains(int key) const {
        // Iterative: each comparison discards half the remaining tree.
        const Node* cur = root_.get();
        while (cur) {
            if (key == cur->key) return true;
            cur = key < cur->key ? cur->left.get() : cur->right.get();
        }
        return false;
    }

    optional<int> min_key() const {
        if (!root_) return nullopt;
        const Node* cur = root_.get();
        while (cur->left) cur = cur->left.get();   // leftmost is smallest
        return cur->key;
    }

    /** In-order traversal of a BST yields the keys in SORTED order. */
    vector<int> in_order() const {
        vector<int> out;
        in_order_at(root_.get(), out);
        return out;
    }

    int height() const { return height_at(root_.get()); }

    /** The correct validity check: a running (lo, hi) range per node. */
    bool is_valid() const {
        return valid_at(root_.get(), nullopt, nullopt);
    }

private:
    struct Node {
        int key;
        unique_ptr<Node> left, right;
        explicit Node(int k) : key(k) {}
    };

    static unique_ptr<Node> insert_at(unique_ptr<Node> node, int key) {
        if (!node) return make_unique<Node>(key);
        if (key < node->key) node->left = insert_at(std::move(node->left), key);
        else if (key > node->key) node->right = insert_at(std::move(node->right), key);
        // Equal: ignored. A set, not a multiset — a deliberate choice.
        return node;
    }

    static void in_order_at(const Node* n, vector<int>& out) {
        if (!n) return;
        in_order_at(n->left.get(), out);     // left
        out.push_back(n->key);               // node
        in_order_at(n->right.get(), out);    // right
    }

    static int height_at(const Node* n) {
        return n ? 1 + max(height_at(n->left.get()), height_at(n->right.get())) : 0;
    }

    static bool valid_at(const Node* n, optional<int> lo, optional<int> hi) {
        if (!n) return true;
        // The bounds tighten as we descend, so a node is checked against
        // every ancestor, not just its parent.
        if (lo && n->key <= *lo) return false;
        if (hi && n->key >= *hi) return false;
        return valid_at(n->left.get(), lo, n->key)
            && valid_at(n->right.get(), n->key, hi);
    }

    unique_ptr<Node> root_;
};

int main() {
    BST t;
    for (int k : {10, 5, 15, 3, 7, 20}) t.insert(k);

    for (int k : t.in_order()) cout << k << ' ';
    cout << '\n';                                  // 3 5 7 10 15 20 — sorted

    cout << boolalpha << t.contains(7) << ' ' << t.contains(8) << '\n';
    cout << *t.min_key() << ' ' << t.height() << ' ' << t.is_valid() << '\n';

    // The degenerate case: sorted input makes a linked list.
    BST deg;
    for (int k = 1; k <= 8; ++k) deg.insert(k);
    cout << "sorted input height: " << deg.height() << " (n = 8)\n";
}
```

That last pair of lines is the point. Inserting sorted data gives a tree of height `n` — every search is O(n), and the structure has bought you nothing over a linked list. This is why production trees self-balance (red-black for `std::map`, AVL, treaps). Hand-rolling a balanced tree is rarely the right contest move: `std::map` and `std::set` are red-black trees already.

## The four traversals

```cpp
#include <bits/stdc++.h>
using namespace std;

struct TreeNode {
    int val;
    TreeNode* left = nullptr;
    TreeNode* right = nullptr;
    explicit TreeNode(int v) : val(v) {}
};

void preorder(TreeNode* n, vector<int>& out) {     // node, left, right
    if (!n) return;
    out.push_back(n->val);
    preorder(n->left, out);
    preorder(n->right, out);
}

void inorder(TreeNode* n, vector<int>& out) {      // left, node, right
    if (!n) return;
    inorder(n->left, out);
    out.push_back(n->val);
    inorder(n->right, out);
}

void postorder(TreeNode* n, vector<int>& out) {    // left, right, node
    if (!n) return;
    postorder(n->left, out);
    postorder(n->right, out);
    out.push_back(n->val);
}

// Level order is NOT a depth-first traversal — it needs a queue.
vector<vector<int>> level_order(TreeNode* root) {
    vector<vector<int>> levels;
    if (!root) return levels;
    queue<TreeNode*> q;
    q.push(root);
    while (!q.empty()) {
        // Snapshot the size: the loop below pushes the next level onto the
        // same queue, and without this the level boundary is lost.
        int width = (int)q.size();
        vector<int> level;
        for (int i = 0; i < width; ++i) {
            TreeNode* n = q.front();
            q.pop();
            level.push_back(n->val);
            if (n->left) q.push(n->left);
            if (n->right) q.push(n->right);
        }
        levels.push_back(std::move(level));
    }
    return levels;
}

int main() {
    //     1
    //    / \
    //   2   3
    //  / \
    // 4   5
    TreeNode* root = new TreeNode(1);
    root->left = new TreeNode(2);
    root->right = new TreeNode(3);
    root->left->left = new TreeNode(4);
    root->left->right = new TreeNode(5);

    vector<int> a, b, c;
    preorder(root, a);
    inorder(root, b);
    postorder(root, c);
    for (int x : a) cout << x << ' '; cout << "| pre\n";
    for (int x : b) cout << x << ' '; cout << "| in\n";
    for (int x : c) cout << x << ' '; cout << "| post\n";

    for (const auto& lvl : level_order(root)) {
        for (int x : lvl) cout << x << ' ';
        cout << "| level\n";
    }
}
```

Which to use is determined by the problem, not by taste:

- **In-order** — sorted output from a BST. Also: the k-th smallest element.
- **Pre-order** — serialise a tree, or copy it. The node is handled before its children exist.
- **Post-order** — anything where a node's answer depends on its children's answers: height, subtree sums, deletion.
- **Level order** — anything phrased per level, or shortest depth.

`int width = (int)q.size();` in `level_order` is the line that separates a correct implementation from one that merges all levels into one.

## Complexity

| Operation | Balanced | Degenerate |
|---|---|---|
| Search / insert / erase | O(log n) | O(n) |
| Min / max | O(log n) | O(n) |
| In-order traversal | O(n) | O(n) |
| Space (recursion) | O(log n) | O(n) |

## Pitfalls

- **Validating with child-only comparisons.** Use the running range.
- **Recursion depth.** A degenerate tree with 10⁵ nodes overflows the stack. Iterate, or trust the balance guarantee.
- **Losing the level boundary** in level-order by not snapshotting the queue size.
- **Raw pointers without a destructor.** Use `unique_ptr`, as in the BST above, and the rule of zero applies.
- **Assuming a BST is balanced.** Sorted input is the common case in practice, and it is the worst case here.

## Problems that use it

Invert binary tree · maximum depth · same tree · subtree of another tree · validate BST · kth smallest in a BST · lowest common ancestor of a BST · level order traversal · binary tree maximum path sum · serialise and deserialise.
