import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { Rooms } from '../server/rooms.js';
import { createApp } from '../server/app.js';
const hex = n => randomBytes(n).toString('hex');
function setup(t, options = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'rivergate-rooms-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const rooms = new Rooms(directory, options), id = hex(12), red = hex(32), black = hex(32), invite = hex(32);
  const create = rooms.create(id, { key: red, invite });
  const snapshot = rooms.join(id, { key: black, invite });
  const command = (key, action, revision = rooms.get(id).revision, request = hex(12)) => rooms.command(id, key, { ...action, id: request, revision });
  return { rooms, directory, id, red, black, invite, command, snapshot, create };
}
const status = code => error => error.status === code;

test('seats, canonical legality, revisions and retry receipts survive restart', t => {
  const { rooms, directory, id, red, black, invite, command } = setup(t);
  assert.throws(() => rooms.read(id, invite), status(403));
  assert.throws(() => rooms.join(id, { key: hex(32), invite }), status(409));
  assert.throws(() => command(black, { type: 'move', move: { from: 27, to: 36 } }), status(409));
  assert.throws(() => command(red, { type: 'move', move: { from: 54, to: 46 } }), status(400));
  const request = hex(12), payload = { type: 'move', move: { from: 54, to: 45 } };
  const accepted = command(red, payload, 1, request);
  assert.equal(accepted.record.moves.length, 1);
  const restarted = new Rooms(directory);
  assert.equal(restarted.command(id, red, { ...payload, revision: 1, id: request }).revision, 2);
  assert.equal(restarted.read(id, black).record.moves.length, 1);
  assert.throws(() => restarted.command(id, red, { ...payload, revision: 1, id: hex(12) }), status(409));
  assert.throws(() => restarted.command(id, red, { ...payload, move: { from: 56, to: 47 }, revision: 1, id: request }), status(409));
  const raw = readFileSync(join(directory, `${id}.json`), 'utf8');
  assert(!raw.includes(red) && !raw.includes(black) && !raw.includes(invite));
  assert(!JSON.stringify(accepted).includes('receipts'));
});

test('draw and restart require the other seat; moves cancel offers; resign belongs to caller', t => {
  const { rooms, id, red, black, command } = setup(t);
  command(red, { type: 'offer', kind: 'draw' });
  assert.throws(() => command(red, { type: 'answer', accept: true }), status(409));
  assert.equal(command(black, { type: 'answer', accept: false }).record.ending, null);
  command(black, { type: 'offer', kind: 'restart' });
  assert.equal(command(red, { type: 'move', move: { from: 54, to: 45 } }).offer, null);
  command(red, { type: 'offer', kind: 'draw' });
  assert.equal(command(black, { type: 'answer', accept: true }).record.ending, 'draw');
  assert.throws(() => command(black, { type: 'move', move: { from: 27, to: 36 } }), status(409));
  const revision = rooms.get(id).revision;
  command(red, { type: 'offer', kind: 'restart' });
  const fresh = command(black, { type: 'answer', accept: true });
  assert.equal(fresh.record.moves.length, 0); assert(fresh.revision > revision);
  assert.equal(command(black, { type: 'resign' }).record.ending, 'black-resign');
});

test('failed writes do not publish changes; expiry and capacity are bounded', t => {
  let now = 0;
  const { rooms, directory, id, red, command } = setup(t, { now: () => now, ttl: 100, maxRooms: 1 });
  assert.throws(() => rooms.create(hex(12), { key: hex(32), invite: hex(32) }), status(503));
  const backup = directory + '-moved';
  renameSync(directory, backup);
  try {
    assert.throws(() => command(red, { type: 'move', move: { from: 54, to: 45 } }));
    assert.equal(rooms.get(id).revision, 1);
  } finally { renameSync(backup, directory); }
  now = 101;
  assert.throws(() => rooms.read(id, red), status(410));
  assert.equal(new Rooms(directory, { now: () => now }).rooms.size, 0);
});

test('HTTP transport enforces auth/origin and persists exactly one concurrent revision', async t => {
  const { rooms, id, red, black } = setup(t);
  const server = createApp({ rooms, origin: 'https://rivergate.example', rateLimit: false });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const url = `http://127.0.0.1:${server.address().port}/api/rooms/${id}`;
  assert.equal((await fetch(url)).status, 403);
  assert.equal((await fetch(url, { headers: { Origin: 'null', Authorization: `Bearer ${red}` } })).status, 403);
  assert.equal((await fetch(url, { headers: { Origin: 'https://wrong.example', Authorization: `Bearer ${red}` } })).status, 403);
  const send = move => fetch(url + '/commands', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${red}` },
    body: JSON.stringify({ type: 'move', move, id: hex(12), revision: 1 }) });
  const responses = await Promise.all([send({ from: 54, to: 45 }), send({ from: 56, to: 47 })]);
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
  const response = await fetch(url, { headers: { Authorization: `Bearer ${black}` } });
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal((await response.json()).record.moves.length, 1);
  assert.equal((await fetch(url + '/commands', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'null' })).status, 400);
  assert.equal((await fetch(url + '/commands', { method: 'POST', body: '{}' })).status, 415);
  assert.equal((await fetch(url + '/commands', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'x'.repeat(9000) }) })).status, 413);
});

test('HTTP create/join retry and server restart preserve seats and accepted moves', async t => {
  const { directory } = setup(t);
  const id = hex(12), red = hex(32), black = hex(32), invite = hex(32);
  let server;
  const start = async () => {
    server = createApp({ directory, rateLimit: false });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    return `http://127.0.0.1:${server.address().port}/api/rooms/${id}`;
  };
  const stop = () => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); });
  let url = await start(); t.after(stop);
  const send = (path, body, method = 'POST', key) => fetch(url + path, { method,
    headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) }, body: JSON.stringify(body) });
  assert.equal((await send('', { key: red, invite }, 'PUT')).status, 200);
  assert.equal((await (await send('', { invite, key: red }, 'PUT')).json()).revision, 0);
  assert.equal((await send('/join', { key: black, invite })).status, 200);
  assert.equal((await (await send('/join', { key: black, invite })).json()).revision, 1);
  const command = { type: 'move', id: hex(12), revision: 1, move: { from: 54, to: 45 } };
  assert.equal((await send('/commands', command, 'POST', red)).status, 200);
  await stop(); url = await start();
  const retried = await (await send('/commands', command, 'POST', red)).json();
  assert.equal(retried.revision, 2); assert.equal(retried.record.moves.length, 1);
});

test('rate limits ignore forwarded addresses unless the loopback proxy is explicitly trusted', async t => {
  const { rooms, id, red } = setup(t);
  for (const trustProxy of [false, true]) {
    const server = createApp({ rooms, trustProxy });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${server.address().port}/api/rooms/${id}`;
    const read = ip => fetch(url, { headers: { Authorization: `Bearer ${red}`, 'X-Real-IP': ip } });
    try {
      for (let n = 0; n < 240; n++) { const r = await read('192.0.2.1'); assert.equal(r.status, 200); await r.text(); }
      const limited = await read('192.0.2.1');
      assert.equal(limited.status, 429); assert.equal(limited.headers.get('retry-after'), '60'); await limited.text();
      const different = await read('192.0.2.2'); assert.equal(different.status, trustProxy ? 200 : 429); await different.text();
    } finally { await new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }); }
  }
});
