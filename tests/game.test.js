import test from "node:test";
import assert from "node:assert/strict";
import { Game, SAVE } from "../src/game.js";
import {
  initialState,
  positionKey,
  legalMoves,
  recordOf,
} from "../src/engine.js";
function setup() {
  const memory = new Map(),
    requests = [];
  const bot = {
    cancelled: 0,
    cancel() {
      this.cancelled++;
    },
    dispose() {},
    start(state, callbacks) {
      requests.push({ state, callbacks });
    },
  };
  const storage = {
    getItem: (k) => memory.get(k),
    setItem: (k, v) => memory.set(k, v),
  };
  return { game: new Game({ bot, storage }), memory, requests, bot };
}
test("undo/reset cancels pending bot and rejects callbacks from old positions", () => {
  const { game, requests } = setup();
  game.commit({ from: 54, to: 45 });
  assert(game.thinking);
  const old = requests[0];
  game.undo();
  assert.deepEqual(game.live, initialState());
  old.callbacks.onResult(
    { move: legalMoves(old.state.board, "black")[0] },
    positionKey(old.state.board, "black"),
  );
  assert.equal(game.moves.length, 0);
  game.commit({ from: 54, to: 45 });
  const next = requests[1];
  game.newGame();
  next.callbacks.onError();
  assert.equal(game.botError, "");
  assert.equal(game.moves.length, 0);
});
test("bot reply, turn-aware undo, historical views never overwrite the live save", () => {
  const { game, requests, memory } = setup();
  game.commit({ from: 54, to: 45 });
  const { state, callbacks } = requests[0];
  callbacks.onResult(
    { move: legalMoves(state.board, "black")[0] },
    positionKey(state.board, "black"),
  );
  assert.equal(game.moves.length, 2);
  const saved = memory.get(SAVE);
  game.seek(0);
  assert(game.reviewing);
  assert(!game.commit({ from: 54, to: 45 }));
  assert.equal(memory.get(SAVE), saved);
  game.returnLive();
  game.undo();
  assert.equal(game.moves.length, 0);
  assert.equal(game.live.turn, "red");
});
test("mode switch, result, invalid import, blocked storage, teardown", () => {
  const { game, requests } = setup();
  game.commit({ from: 54, to: 45 });
  game.setMode("local");
  const old = requests[0];
  old.callbacks.onError();
  assert.equal(game.botError, "");
  assert(game.humanTurn);
  const record = game.record();
  assert.throws(() => game.importRecord("{"));
  assert.deepEqual(game.record(), record);
  game.storage = {
    setItem() {
      throw Error();
    },
  };
  game.finish("draw");
  assert.equal(game.result.reason, "agreed");
  assert.match(game.storageStatus, /Không lưu/);
  game.importRecord(JSON.stringify(recordOf([], "local")));
  assert.equal(game.moves.length, 0);
  game.dispose();
  assert(!game.alive);
});
test("last history frame stays paused until explicitly returning live", () => {
  const { game, requests } = setup();
  game.commit({ from: 54, to: 45 });
  const saved = game.record();
  game.seek(1);
  assert(game.reviewing);
  assert(!game.thinking);
  assert.equal(requests.length, 1);
  game.setMode("local");
  assert(!game.humanTurn);
  game.setMode("bot");
  assert.equal(requests.length, 1);
  game.returnLive();
  assert(!game.reviewing);
  assert(game.thinking);
  assert.equal(requests.length, 2);
  assert.deepEqual(game.record(), saved);
});
