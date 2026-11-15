import test from 'node:test';
import assert from 'node:assert/strict';
import { OnlineGame, ROOM_SAVE, savedSeat } from '../src/online.js';
import { recordOf } from '../src/engine.js';
const id = 'a'.repeat(24), key = 'b'.repeat(64), invite = 'c'.repeat(64);
const seat = () => ({ id, key, invite, stage: 'ready', side: 'red' });
const storage = () => ({ value: '', setItem(_, value) { this.value = value; }, getItem() { return this.value; } });
const snapshot = (revision = 1, moves = []) => ({ id, revision, record: recordOf(moves, 'local'), side: 'red', joined: true,
  offer: null, expiresAt: Date.now() + 10000, presence: { red: true, black: true } });
const response = data => ({ ok: true, json: async () => data });

test('lost command acknowledgement retries the same stored ID after reload', async () => {
  const store = storage(), requests = [];
  let accepted;
  const request = async (_, options) => {
    if (options.method === 'GET') return response(snapshot());
    const body = JSON.parse(options.body); requests.push(body);
    if (!accepted) { accepted = body; throw Error('connection lost after server commit'); }
    assert.deepEqual(body, accepted);
    return response(snapshot(2, [{ from: 54, to: 45 }]));
  };
  const first = new OnlineGame({ seat: seat(), storage: store, request, interval: 60000 });
  await first.sync();
  assert(first.commit({ from: 54, to: 45 }));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(first.moves.length, 0); assert(!first.connected);
  assert(savedSeat(store).pending);
  first.dispose();
  const second = new OnlineGame({ seat: savedSeat(store), storage: store, request, interval: 60000 });
  await second.sync();
  assert.equal(second.moves.length, 1); assert.equal(second.pending, null);
  assert.equal(requests.length, 2); assert.equal(JSON.parse(store.value).pending, null);
  second.dispose();
});

test('late snapshots cannot mutate a disposed game; older revisions never replace current data', async () => {
  let finish;
  const game = new OnlineGame({ seat: seat(), storage: storage(), request: () => new Promise(resolve => { finish = resolve; }) });
  const running = game.sync(); game.dispose(); finish(response(snapshot())); await running;
  assert.equal(game.snapshot, null); assert.equal(game.timer, null);
  const current = new OnlineGame({ seat: seat(), storage: storage() });
  current.apply(snapshot(2, [{ from: 54, to: 45 }])); current.apply(snapshot(1));
  assert.equal(current.moves.length, 1); current.dispose();
});

test('storage failure blocks sending; pending request disables moves; expiry stops retries', async () => {
  const game = new OnlineGame({ seat: seat(), storage: { setItem() { throw Error('quota'); } }, request: async () => response(snapshot()) });
  game.apply(snapshot()); game.connected = true;
  assert.equal(game.commit({ from: 54, to: 45 }), false); assert.equal(game.pending, null);
  game.dispose();
  const expired = new OnlineGame({ seat: seat(), storage: storage(), request: async () => ({ ok: false, status: 410, json: async () => ({ error: 'expired' }) }) });
  await expired.sync(); assert(expired.stopped); assert.equal(expired.timer, null); expired.dispose();
  assert.equal(savedSeat({ getItem: () => JSON.stringify({ id: '../bad', key, invite, stage: 'ready' }) }), null);
});
