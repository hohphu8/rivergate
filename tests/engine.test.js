import test from "node:test";
import assert from "node:assert/strict";
import {
  initialState,
  targets,
  legalMoves,
  inCheck,
  movedBoard,
  play,
  positionKey,
  outcome,
  restore,
  recordOf,
  other,
  MAX_PLIES,
} from "../src/engine.js";
const at = (r, c) => r * 9 + c;
function board(pieces) {
  const b = Array(90).fill(null);
  for (const [r, c, side, type] of pieces)
    b[at(r, c)] = { id: `${r}-${c}`, side, type };
  return b;
}
test("initial setup, symmetry and independently known opening move counts", () => {
  const s = initialState();
  assert.equal(s.board.filter(Boolean).length, 32);
  assert.equal(legalMoves(s.board, "red").length, 44);
  assert.equal(legalMoves(s.board, "black").length, 44);
  assert.equal(
    legalMoves(s.board, "red").reduce(
      (sum, m) =>
        sum + legalMoves(movedBoard(s.board, m.from, m.to), "black").length,
      0,
    ),
    1920,
  );
  assert.equal(inCheck(s.board, "red"), false);
});
test("horse leg blocks exactly the two associated jumps", () => {
  const b = board([
    [4, 4, "red", "h"],
    [5, 4, "red", "p"],
  ]);
  const t = targets(b, at(4, 4));
  assert.equal(t.length, 6);
  assert(!t.includes(at(6, 3)));
  assert(!t.includes(at(6, 5)));
});
test("elephant eye and river, advisor/general palace", () => {
  const b = board([
    [5, 4, "red", "e"],
    [6, 5, "black", "p"],
  ]);
  assert.deepEqual(targets(b, at(5, 4)), [at(7, 2)]);
  assert.deepEqual(targets(board([[9, 3, "red", "a"]]), at(9, 3)), [at(8, 4)]);
  assert.deepEqual(
    targets(board([[9, 4, "red", "g"]]), at(9, 4)).sort((a, b) => a - b),
    [76, 84, 86],
  );
});
test("cannon needs exactly one screen to capture; rook cannot jump", () => {
  const b = board([
    [4, 4, "red", "c"],
    [4, 6, "red", "p"],
    [4, 8, "black", "r"],
  ]);
  assert(targets(b, 40).includes(44));
  assert(!targets(b, 40).includes(43));
  b[42] = null;
  assert(!targets(b, 40).includes(44));
  b[42] = { side: "black", type: "p" };
  b[43] = { side: "black", type: "p" };
  assert(targets(b, 40).includes(43));
  assert(!targets(b, 40).includes(44));
  b[40].type = "r";
  assert(targets(b, 40).includes(42));
  assert(!targets(b, 40).includes(43));
});
test("soldier gains sideways moves after river, never retreats or promotes", () => {
  assert.deepEqual(targets(board([[5, 4, "red", "p"]]), 49), [40]);
  assert.deepEqual(targets(board([[4, 4, "red", "p"]]), 40), [31, 39, 41]);
  assert.deepEqual(targets(board([[0, 4, "red", "p"]]), 4), [3, 5]);
  assert.deepEqual(targets(board([[4, 4, "black", "p"]]), 40), [49]);
});
test("facing generals, pinned blockers and own check forbid moves", () => {
  const b = board([
    [0, 4, "black", "g"],
    [9, 4, "red", "g"],
    [5, 4, "red", "r"],
  ]);
  assert(!inCheck(b, "red"));
  assert(!legalMoves(b, "red").some((m) => m.from === 49 && m.to === 48));
  assert(legalMoves(b, "red").some((m) => m.from === 49 && m.to === 40));
  b[49] = null;
  assert(inCheck(b, "red"));
  assert(inCheck(b, "black"));
});
test("stalemate is a loss; checkmate is distinct", () => {
  const b = board([
    [0, 4, "black", "g"],
    [9, 4, "red", "g"],
    [5, 4, "red", "p"],
    [1, 0, "red", "r"],
    [2, 3, "red", "r"],
    [2, 5, "red", "r"],
  ]);
  assert(!inCheck(b, "black"));
  assert.deepEqual(outcome(b, "black", [], 0), {
    winner: "red",
    reason: "stalemate",
  });
  b[4 * 9] = { id: "check", side: "red", type: "r" };
  b[5 * 9 + 4] = null;
  assert.equal(outcome(b, "black", [], 0).reason, "mate");
});
test("casual threefold includes side to move, independent of identity", () => {
  let s = initialState();
  const sequence = [
    { from: 82, to: 63 },
    { from: 1, to: 20 },
    { from: 63, to: 82 },
    { from: 20, to: 1 },
  ];
  for (let repeat = 0; repeat < 2; repeat++)
    for (const move of sequence) s = play(s, move);
  assert.deepEqual(s.result, { winner: null, reason: "repetition" });
  assert.notEqual(positionKey(s.board, "red"), positionKey(s.board, "black"));
  assert.throws(() => play(s, sequence[0]));
});
test("legal game replay is immutable, deterministic and rejects malformed records", () => {
  let s = initialState();
  const original = structuredClone(s),
    moves = [];
  for (let n = 0; n < 100 && !s.result; n++) {
    const available = legalMoves(s.board, s.turn),
      move = available[(n * 17 + 3) % available.length];
    const old = structuredClone(s);
    const next = play(s, move);
    assert.deepEqual(s, old);
    assert(!inCheck(next.board, s.turn));
    assert.equal(
      new Set(next.board.filter(Boolean).map((p) => p.id)).size,
      next.board.filter(Boolean).length,
    );
    moves.push(move);
    s = next;
  }
  assert.deepEqual(initialState(), original);
  assert.deepEqual(restore(recordOf(moves)).timeline.at(-1), s);
  for (const record of [
    null,
    {},
    { ...recordOf([]), rules: "future" },
    { ...recordOf([]), moves: [[90, 1]] },
    { ...recordOf([]), moves: [[54, 0]] },
    { ...recordOf([]), moves: Array(601).fill([1, 2]) },
  ])
    assert.throws(() => restore(record));
});
test("side-swapped rotations preserve legal moves and check across sampled games", () => {
  for (let seed = 1; seed <= 5; seed++) {
    let state = initialState(),
      rng = seed;
    for (let ply = 0; ply < 60 && !state.result; ply++) {
      const mirrored = state.board
        .slice()
        .reverse()
        .map((p) => (p ? { ...p, side: other(p.side) } : null));
      const moves = legalMoves(state.board, state.turn),
        mirrorMoves = legalMoves(mirrored, other(state.turn));
      assert.deepEqual(
        moves.map((m) => `${89 - m.from}:${89 - m.to}`).sort(),
        mirrorMoves.map((m) => `${m.from}:${m.to}`).sort(),
      );
      assert.equal(
        inCheck(state.board, state.turn),
        inCheck(mirrored, other(state.turn)),
      );
      rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
      state = play(state, moves[rng % moves.length]);
      assert(state.board.filter((p) => p?.type === "g").length === 2);
    }
  }
});
test("move cap, terminal reconstruction and malformed/manual result conflicts", () => {
  const initial = initialState();
  assert.deepEqual(
    outcome(initial.board, initial.turn, initial.positions, MAX_PLIES),
    { winner: null, reason: "limit" },
  );
  const moves = Array.from({ length: 2 }, () => [
    { from: 82, to: 63 },
    { from: 1, to: 20 },
    { from: 63, to: 82 },
    { from: 20, to: 1 },
  ]).flat();
  assert.equal(
    restore(recordOf(moves)).timeline.at(-1).result.reason,
    "repetition",
  );
  assert.throws(() => restore(recordOf([...moves, { from: 82, to: 63 }])));
  assert.throws(() => restore(recordOf(moves, "local", "draw")));
  for (const pair of [
    [1.5, 2],
    ["54", 45],
    [-1, 0],
    [54, 45, 1],
  ])
    assert.throws(() => restore({ ...recordOf([]), moves: [pair] }));
  assert.equal(
    restore(recordOf([], "local", "red-resign")).ending,
    "red-resign",
  );
});
