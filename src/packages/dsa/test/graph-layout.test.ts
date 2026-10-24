import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { decodeAdjacencyList, decodeEdgeList } from "../src/render/graph-layout.ts";

describe("decodeAdjacencyList", () => {
  it("layers by BFS distance from node 0", () => {
    // 0 — 1 — 3
    //  \_ 2
    const g = decodeAdjacencyList([[1, 2], [0, 3], [0], [1]]);
    const layer = (id: number) => g.nodes.find((n) => n.id === id)?.layer;
    assert.equal(layer(0), 0);
    assert.equal(layer(1), 1);
    assert.equal(layer(2), 1);
    assert.equal(layer(3), 2);
    assert.equal(g.layers, 3);
    assert.equal(g.widest, 2);
  });

  it("collapses each undirected edge to one line", () => {
    // 🛑 An undirected adjacency list stores every edge twice. Drawing both
    // would double every stroke and make an undirected graph look heavier than
    // a directed one.
    const g = decodeAdjacencyList([[1], [0]]);
    assert.equal(g.edges.length, 1);
  });

  it("keeps both directions when directed", () => {
    const g = decodeAdjacencyList([[1], [0]], { directed: true });
    assert.equal(g.edges.length, 2);
  });

  it("places every component, not just the one containing node 0", () => {
    // 🛑 Two disjoint edges: 0—1 and 2—3. A single BFS would leave 2 and 3
    // unplaced — and connected-components and graph-valid-tree are ABOUT
    // disconnected graphs, so that case must be visible.
    const g = decodeAdjacencyList([[1], [0], [3], [2]]);
    assert.equal(g.nodes.length, 4);
    assert.equal(
      g.nodes.every((n) => n.layer >= 0),
      true,
    );
    // Each component roots at its own lowest id, so 0 and 2 are both layer 0.
    assert.equal(g.nodes.find((n) => n.id === 2)?.layer, 0);
    assert.equal(g.nodes.find((n) => n.id === 3)?.layer, 1);
  });

  it("places an isolated node", () => {
    const g = decodeAdjacencyList([[1], [0], []]);
    assert.equal(g.nodes.length, 3);
    assert.equal(g.nodes.find((n) => n.id === 2)?.layer, 0);
    assert.equal(g.edges.length, 1);
  });

  it("is deterministic — same input, identical output", () => {
    const input = [[1, 2], [0, 3], [0, 3], [1, 2]];
    const a = decodeAdjacencyList(input);
    const b = decodeAdjacencyList(input);
    assert.deepEqual(a, b);
  });

  it("degrades a malformed row to no neighbours rather than throwing", () => {
    const g = decodeAdjacencyList([[1], 7, ["x"], [0]] as unknown[]);
    assert.equal(g.nodes.length, 4);
    assert.doesNotThrow(() => decodeAdjacencyList([null, undefined] as unknown[]));
  });

  it("drops a neighbour index that is out of range", () => {
    // A cap can elide a container, leaving an id that no longer exists. An
    // edge to a node that is not drawn would be a line into empty space.
    const g = decodeAdjacencyList([[1, 99], [0]]);
    assert.equal(g.edges.length, 1);
  });

  it("handles an empty graph", () => {
    const g = decodeAdjacencyList([]);
    assert.deepEqual(g, { nodes: [], edges: [], layers: 0, widest: 0 });
  });

  it("handles a self-loop without duplicating it", () => {
    const g = decodeAdjacencyList([[0]]);
    assert.equal(g.nodes.length, 1);
    assert.equal(g.edges.length, 1);
    assert.deepEqual(g.edges[0], { from: 0, to: 0 });
  });
});

describe("decodeEdgeList", () => {
  it("pairs values into edges", () => {
    const g = decodeEdgeList([0, 1, 1, 2]);
    assert.equal(g.edges.length, 2);
    assert.equal(g.nodes.length, 3);
  });

  it("drops an odd trailing value rather than inventing an edge", () => {
    // 🛑 A cap can truncate a container mid-pair. Pairing the orphan with
    // nothing — or with node 0 — would draw a relationship that does not
    // exist, which is worse than drawing one fewer edge.
    const g = decodeEdgeList([0, 1, 2]);
    assert.equal(g.edges.length, 1);
    assert.deepEqual(g.edges[0], { from: 0, to: 1 });
  });

  it("derives the node count from the largest id seen", () => {
    const g = decodeEdgeList([0, 4]);
    assert.equal(g.nodes.length, 5);
  });

  it("layers from the edges, not from input order", () => {
    // Edges given back-to-front: 2—3 first, then 0—1, then 1—2.
    const g = decodeEdgeList([2, 3, 0, 1, 1, 2]);
    const layer = (id: number) => g.nodes.find((n) => n.id === id)?.layer;
    assert.equal(layer(0), 0);
    assert.equal(layer(1), 1);
    assert.equal(layer(2), 2);
    assert.equal(layer(3), 3);
  });

  it("returns an empty model for junk", () => {
    assert.deepEqual(decodeEdgeList([]), { nodes: [], edges: [], layers: 0, widest: 0 });
    assert.deepEqual(decodeEdgeList(["a", "b"]), { nodes: [], edges: [], layers: 0, widest: 0 });
  });
});
