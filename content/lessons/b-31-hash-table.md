---
slug: hash-tables
moduleSlug: hashing
title: Hash tables
sortOrder: 10
status: published
summary: How O(1) lookup actually works, why it is an average and not a guarantee, and the load factor that decides everything.
---

## The problem it solves

You want to ask "is `x` in my collection?" in constant time. An array gives O(1) by *index*, so the trick is to turn the value into an index — then membership is one array access.

That function is the **hash function**. The whole design problem is that it maps a huge key space (all strings, all 64-bit integers) onto a small index space, so collisions are inevitable. A hash table is a hash function plus a collision strategy.

## The invariant

> For every stored key `k`, the entry for `k` resides in the bucket chain at index `hash(k) % bucket_count_`. The number of entries divided by `bucket_count_` — the **load factor** — stays below a fixed threshold.

Both halves matter. Break the first and lookups miss keys that are present. Break the second and the O(1) degrades toward O(n).

## The implementation: separate chaining

Each bucket holds a list of entries that landed there.

```cpp
#include <bits/stdc++.h>
using namespace std;

template <typename K, typename V>
class HashMap {
public:
    explicit HashMap(size_t buckets = 8) : buckets_(max<size_t>(buckets, 1)) {}

    void insert(const K& key, const V& value) {
        auto& chain = buckets_[index_of(key)];
        for (auto& entry : chain) {
            if (entry.first == key) {      // update, never duplicate a key
                entry.second = value;
                return;
            }
        }
        chain.emplace_back(key, value);
        ++count_;
        // Rehash when the average chain exceeds the threshold. This is what
        // keeps lookup O(1): chains stay short by construction.
        if (load_factor() > kMaxLoad) rehash(buckets_.size() * 2);
    }

    const V* find(const K& key) const {
        const auto& chain = buckets_[index_of(key)];
        for (const auto& entry : chain)
            if (entry.first == key) return &entry.second;
        return nullptr;                    // absent, and no insertion happened
    }

    bool erase(const K& key) {
        auto& chain = buckets_[index_of(key)];
        for (auto it = chain.begin(); it != chain.end(); ++it) {
            if (it->first == key) {
                chain.erase(it);
                --count_;
                return true;
            }
        }
        return false;
    }

    size_t size() const { return count_; }
    double load_factor() const { return double(count_) / double(buckets_.size()); }
    size_t bucket_count() const { return buckets_.size(); }

    /** Longest chain — the diagnostic that shows whether the hash is working. */
    size_t worst_chain() const {
        size_t worst = 0;
        for (const auto& c : buckets_) worst = max(worst, c.size());
        return worst;
    }

private:
    static constexpr double kMaxLoad = 0.75;

    size_t index_of(const K& key) const {
        return std::hash<K>{}(key) % buckets_.size();
    }

    void rehash(size_t new_count) {
        // Every key's index depends on bucket_count_, so EVERY entry must be
        // relocated. This is why rehashing is O(n) and why reserving up front
        // is worth it.
        vector<vector<pair<K, V>>> fresh(new_count);
        for (auto& chain : buckets_)
            for (auto& entry : chain)
                fresh[std::hash<K>{}(entry.first) % new_count].push_back(std::move(entry));
        buckets_ = std::move(fresh);
    }

    vector<vector<pair<K, V>>> buckets_;
    size_t count_ = 0;
};

int main() {
    HashMap<string, int> m;
    for (string w : {"alpha", "beta", "gamma", "delta", "epsilon", "zeta"})
        m.insert(w, (int)w.size());

    cout << "size " << m.size() << " buckets " << m.bucket_count()
         << " load " << m.load_factor() << " worst chain " << m.worst_chain() << '\n';

    if (const int* v = m.find("gamma")) cout << "gamma -> " << *v << '\n';
    cout << (m.find("missing") ? "found" : "absent — and NOT inserted") << '\n';

    m.insert("gamma", 99);                 // update in place
    cout << "gamma -> " << *m.find("gamma") << " size still " << m.size() << '\n';

    cout << boolalpha << m.erase("beta") << ' ' << m.erase("beta") << '\n';
}
```

`find` returning a pointer — `nullptr` for absent — is deliberate. It cannot insert as a side effect, which is the trap in `std::unordered_map::operator[]` covered in the [containers lesson](/learn/foundations/stl-containers).

Five keys into five buckets, including two that land in the same one:

```viz
{ "demo": "hashTable", "values": [10, 22, 15, 7, 31], "buckets": 5, "title": "insert, with a collision" }
```

## Why O(1) is an average

With `n` entries in `b` buckets and a hash that distributes well, the expected chain length is `n/b`. Keeping the load factor under a constant keeps that expected length constant — hence O(1) *expected*.

But the worst case is O(n): if every key hashes to the same bucket, the table is one linked list.

That is not hypothetical. libstdc++'s `std::hash<int>` is the identity function, so inserting multiples of the bucket count puts every key in bucket 0:

```cpp
#include <bits/stdc++.h>
using namespace std;

int main() {
    // Adversarial input: with identity hashing, every one of these keys lands
    // in the same bucket and lookup degrades to a linear scan.
    unordered_map<long long, int> m;
    m.reserve(1024);
    const long long stride = (long long)m.bucket_count();
    for (int i = 0; i < 200; ++i) m[stride * i] = i;

    size_t worst = 0;
    for (size_t b = 0; b < m.bucket_count(); ++b) worst = max(worst, m.bucket_size(b));
    cout << "buckets " << m.bucket_count() << " worst bucket " << worst << '\n';

    // The fix: mix the key so an adversary cannot predict the bucket.
    auto mix = [](long long x) {
        x += 0x9e3779b97f4a7c15LL;            // a 64-bit golden-ratio constant
        x = (x ^ (x >> 30)) * 0xbf58476d1ce4e5b9LL;
        x = (x ^ (x >> 27)) * 0x94d049bb133111ebLL;
        return x ^ (x >> 31);
    };
    unordered_map<long long, int> safe;
    safe.reserve(1024);
    for (int i = 0; i < 200; ++i) safe[mix(stride * i)] = i;

    size_t worst2 = 0;
    for (size_t b = 0; b < safe.bucket_count(); ++b) worst2 = max(worst2, safe.bucket_size(b));
    cout << "mixed: worst bucket " << worst2 << '\n';
}
```

Run it: the unmixed table piles 200 keys into one bucket, the mixed one spreads them. On judges that allow competitors to submit test cases against your solution, this is a routine attack. Mix your keys, or use `std::map` and accept the O(log n).

## The other strategy: open addressing

Rather than chaining, store entries directly in the bucket array and on collision probe forward for the next free slot. Better cache behaviour — no pointer chasing — but deletion is awkward: you cannot simply empty a slot, because that would break the probe chain for keys stored past it. The standard fix is a *tombstone* marker.

`std::unordered_map` is required by the standard to use chaining (it must support stable references into the table). High-performance third-party maps are usually open-addressed.

## Complexity

| Operation | Average | Worst | `std::map` |
|---|---|---|---|
| Insert | O(1) | O(n) | O(log n) |
| Find | O(1) | O(n) | O(log n) |
| Erase | O(1) | O(n) | O(log n) |
| Ordered iteration | **Not possible** | — | O(n) |
| `lower_bound` | **Not possible** | — | O(log n) |
| Memory | O(n + b) | | O(n) |

## Pitfalls

- **`operator[]` inserts.** Reading a missing key creates it. Use `find` or `count`.
- **Assuming a stable iteration order.** It is unspecified, differs across runs and implementations, and changes on rehash. Never print it expecting a fixed answer.
- **No `reserve`.** Without it, inserting `n` keys rehashes about log n times, moving every entry each time. `m.reserve(n)` is a one-line speedup.
- **Custom key types.** `unordered_map<pair<int,int>, V>` does not compile — the standard provides no `hash<pair>`. Either encode the pair into one integer (`x * 1'000'003LL + y`) or supply your own hash functor.
- **Mutating a key** after insertion. The entry stays in the old bucket and becomes unfindable. Keys are logically immutable.
- **Trusting average case against an adversary.** Covered above — the one failure that looks like a mysterious TLE.

## Problems that use it

Two sum · group anagrams · top k frequent elements · longest consecutive sequence · valid sudoku · subarray sum equals k (hash map of prefix sums) · LRU cache · contains duplicate.
