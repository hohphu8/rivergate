import test from "node:test";
import assert from "node:assert/strict";
import { BotClient } from "../src/bot-client.js";
import { search } from "../src/search.js";
import { initialState, play, legalMoves, positionKey, movedBoard, other } from "../src/engine.js";

test("shallow search sees the recapture after an opening cannon takes a horse", () => {
  const state = play(initialState(), { from: 54, to: 45 });
  assert(legalMoves(state.board, state.turn).some(m => m.from === 19 && m.to === 82));
  const result = search(state, { maxDepth: 1, now: () => 0 });
  assert.equal(result.depth, 1);
  assert(![82, 88].includes(result.move.to), "do not trade a cannon for a defended horse");
  assert(result.score >= 0);
});

test("equal-scoring choices prefer an unvisited position; deadline still returns a legal move", () => {
  const state = play(initialState(), { from: 54, to: 45 });
  const first = search(state, { maxDepth: 1, now: () => 0 });
  const key = positionKey(movedBoard(state.board, first.move.from, first.move.to), other(state.turn));
  const repeated = { ...state, positions: [...state.positions, key] };
  const next = search(repeated, { maxDepth: 1, now: () => 0 });
  assert.equal(next.score, first.score);
  assert.notDeepEqual(next.move, first.move);
  let tick = 0;
  const timed = search(state, { budgetMs: 30, now: () => tick++ * 40 });
  assert.equal(timed.depth, 0);
  assert(legalMoves(state.board, state.turn).some(m => m.from === timed.move.from && m.to === timed.move.to));
});
test("search produces legal moves without mutating state, with bounded depth", () => {
  const state = play(initialState(), { from: 54, to: 45 }),
    before = structuredClone(state),
    progress = [];
  const result = search(state, {
    budgetMs: 150,
    maxDepth: 2,
    onProgress: (p) => progress.push(p),
  });
  assert(
    legalMoves(state.board, state.turn).some(
      (m) => m.from === result.move.from && m.to === result.move.to,
    ),
  );
  assert.deepEqual(state, before);
  assert(result.depth <= 2);
  assert(result.nodes >= 0);
});
test("client terminates obsolete worker, rejects stale/wrong-key results and cleans up", () => {
  const workers = [],
    timers = new Map();
  let seq = 0,
    results = 0,
    errors = 0;
  const client = new BotClient({
    makeWorker: () => {
      const w = {
        terminate() {
          this.stopped = true;
        },
        postMessage(data) {
          this.request = data;
        },
      };
      workers.push(w);
      return w;
    },
    setTimer: (fn) => {
      timers.set(++seq, fn);
      return seq;
    },
    clearTimer: (id) => timers.delete(id),
  });
  const callbacks = { onResult: () => results++, onError: () => errors++ };
  client.start(initialState(), callbacks);
  const first = workers[0],
    late = first.onmessage;
  client.start(initialState(), callbacks);
  assert(first.stopped);
  assert.equal(timers.size, 1);
  late({ data: { ...first.request, type: "result" } });
  assert.equal(results, 0);
  const second = workers[1];
  second.onmessage({
    data: { ...second.request, key: "wrong", type: "result" },
  });
  assert.equal(results, 0);
  second.onmessage({ data: { ...second.request, type: "result" } });
  assert.equal(results, 1);
  assert(second.stopped);
  assert.equal(timers.size, 0);
  client.start(initialState(), callbacks);
  const third = workers[2];
  client.dispose();
  assert(third.stopped);
  assert.equal(timers.size, 0);
  client.start(initialState(), callbacks);
  assert.equal(workers.length, 3);
  assert.equal(errors, 0);
});
test("worker crash, timeout and construction failures recover exactly once", () => {
  let worker,
    timeout,
    errors = 0;
  const client = new BotClient({
    makeWorker: () => (worker = { postMessage() {}, terminate() {} }),
    setTimer: (fn) => ((timeout = fn), 1),
    clearTimer: () => {},
  });
  const opts = { onResult: () => assert.fail(), onError: () => errors++ };
  client.start(initialState(), opts);
  const crash = worker.onerror;
  crash({});
  crash({});
  assert.equal(errors, 1);
  client.start(initialState(), opts);
  timeout();
  assert.equal(errors, 2);
  client.makeWorker = () => {
    throw Error("denied");
  };
  client.start(initialState(), opts);
  assert.equal(errors, 3);
});
