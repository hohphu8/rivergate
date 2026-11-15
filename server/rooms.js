import { createHash, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { initialState, play, recordOf, restore } from '../src/engine.js';

export class RoomError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const validId = value => typeof value === 'string' && /^[a-f0-9]{24}$/.test(value);
const validKey = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const hash = value => createHash('sha256').update(value).digest('hex');
const equal = (value, digest) => validKey(value) && validKey(digest)
  && timingSafeEqual(Buffer.from(hash(value), 'hex'), Buffer.from(digest, 'hex'));
const fail = (code, message) => { throw new RoomError(code, message); };

// One Node process owns this directory. Persist before acknowledging a change.
export class Rooms {
  constructor(directory, { now = Date.now, ttl = 86400000, maxRooms = 100 } = {}) {
    this.directory = directory; this.now = now; this.ttl = ttl; this.maxRooms = maxRooms;
    this.rooms = new Map(); this.seen = new Map();
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    for (const name of readdirSync(directory).filter(name => /^[a-f0-9]{24}\.json$/.test(name))) {
      const room = JSON.parse(readFileSync(join(directory, name), 'utf8'));
      if (room.schema !== 1 || `${room.id}.json` !== name || !Number.isFinite(room.expiresAt)
        || !validKey(room.red) || !validKey(room.invite) || (room.black !== null && !validKey(room.black))
        || !Number.isSafeInteger(room.revision) || room.revision < 0 || room.record?.mode !== 'local'
        || !Array.isArray(room.receipts) || room.receipts.length > 128
        || room.receipts.some(r => !r || !validId(r.id) || !validKey(r.digest) || !['red', 'black'].includes(r.side))
        || (room.offer !== null && (!room.offer || !['draw', 'restart'].includes(room.offer.kind) || !['red', 'black'].includes(room.offer.by))))
        throw Error(`Invalid room file: ${name}`);
      if (room.expiresAt <= now()) { unlinkSync(join(directory, name)); continue; }
      if (this.rooms.size >= maxRooms) throw Error('Room directory exceeds configured capacity');
      room.state = restore(room.record).timeline.at(-1);
      this.rooms.set(room.id, room);
    }
  }
  persist(room) {
    const { state, ...data } = room;
    const path = join(this.directory, `${room.id}.json`);
    writeFileSync(`${path}.tmp`, JSON.stringify(data), { mode: 0o600, flush: true });
    renameSync(`${path}.tmp`, path);
    this.rooms.set(room.id, room);
  }
  get(id) {
    if (!validId(id)) fail(404, 'Không tìm thấy phòng.');
    const room = this.rooms.get(id);
    if (!room) fail(404, 'Phòng không còn tồn tại.');
    if (room.expiresAt <= this.now()) {
      unlinkSync(join(this.directory, `${id}.json`)); this.rooms.delete(id); this.seen.delete(id);
      fail(410, 'Phòng đã hết hạn sau 24 giờ. Hãy tạo phòng mới.');
    }
    return room;
  }
  side(room, key) {
    const side = equal(key, room.red) ? 'red' : equal(key, room.black) ? 'black' : null;
    if (!side) fail(403, 'Không có quyền vào ghế này. Hãy dùng trình duyệt đã tham gia phòng.');
    const presence = this.seen.get(room.id) || {};
    presence[side] = this.now(); this.seen.set(room.id, presence);
    return side;
  }
  snapshot(room, side) {
    const seen = this.seen.get(room.id) || {};
    return { id: room.id, revision: room.revision, record: room.record, side,
      joined: !!room.black, offer: room.offer, expiresAt: room.expiresAt,
      presence: { red: this.now() - (seen.red ?? -Infinity) < 10000,
        black: this.now() - (seen.black ?? -Infinity) < 10000 } };
  }
  create(id, { key, invite } = {}) {
    if (!validId(id) || !validKey(key) || !validKey(invite) || key === invite) fail(400, 'Yêu cầu tạo phòng không hợp lệ.');
    if (this.rooms.has(id)) {
      const room = this.get(id);
      if (!equal(key, room.red) || !equal(invite, room.invite)) fail(409, 'Mã phòng đã được dùng.');
      return this.snapshot(room, this.side(room, key));
    }
    for (const [roomId, room] of this.rooms) {
      if (room.expiresAt <= this.now()) {
        unlinkSync(join(this.directory, `${roomId}.json`)); this.rooms.delete(roomId); this.seen.delete(roomId);
      }
    }
    if (this.rooms.size >= this.maxRooms) fail(503, 'Server đang đủ phòng. Hãy thử lại sau.');
    const room = { schema: 1, id, red: hash(key), black: null, invite: hash(invite),
      revision: 0, expiresAt: this.now() + this.ttl, record: recordOf([], 'local'),
      state: initialState(), offer: null, receipts: [] };
    this.persist(room);
    return this.snapshot(room, this.side(room, key));
  }
  join(id, { key, invite } = {}) {
    const room = this.get(id);
    if (!validKey(key) || !equal(invite, room.invite) || equal(key, room.red) || key === invite)
      fail(403, 'Link mời không hợp lệ.');
    if (room.black && !equal(key, room.black)) fail(409, 'Phòng đã đủ hai người.');
    const next = room.black ? room : { ...room, black: hash(key), revision: room.revision + 1 };
    if (next !== room) this.persist(next);
    return this.snapshot(next, this.side(next, key));
  }
  read(id, key) { const room = this.get(id); return this.snapshot(room, this.side(room, key)); }
  command(id, key, command) {
    const room = this.get(id), side = this.side(room, key);
    if (!command || !validId(command.id) || !Number.isInteger(command.revision)) fail(400, 'Yêu cầu không hợp lệ.');
    const digest = hash(JSON.stringify([command.type, command.revision,
      command.move?.from, command.move?.to, command.kind, command.accept]));
    const previous = room.receipts.find(receipt => receipt.id === command.id && receipt.side === side);
    if (previous) {
      if (previous.digest !== digest) fail(409, 'Mã yêu cầu đã được dùng cho thao tác khác.');
      return this.snapshot(room, side);
    }
    if (command.revision !== room.revision) fail(409, 'Ván đã thay đổi. Đã lấy lại trạng thái mới; hãy chọn lại thao tác.');
    if (!room.black) fail(409, 'Chờ người thứ hai vào phòng.');
    const next = { ...room, record: { ...room.record, moves: room.record.moves.slice() }, revision: room.revision + 1 };
    const finished = room.state.result || room.record.ending;
    if (command.type === 'move') {
      if (finished || room.state.turn !== side) fail(409, 'Chưa tới lượt của bạn hoặc ván đã kết thúc.');
      try { next.state = play(room.state, command.move); }
      catch { fail(400, 'Nước đi không hợp lệ.'); }
      next.record.moves.push([command.move.from, command.move.to]); next.offer = null;
    } else if (command.type === 'resign') {
      if (finished) fail(409, 'Ván đã kết thúc.');
      next.record.ending = `${side}-resign`; next.offer = null;
    } else if (command.type === 'offer') {
      if (!['draw', 'restart'].includes(command.kind) || (finished && command.kind === 'draw')) fail(400, 'Không thể gửi đề nghị này.');
      if (room.offer) fail(409, 'Hãy xử lý đề nghị hiện tại trước.');
      next.offer = { kind: command.kind, by: side };
    } else if (command.type === 'answer') {
      if (!room.offer || room.offer.by === side || typeof command.accept !== 'boolean') fail(409, 'Không có đề nghị để trả lời.');
      if (command.accept) {
        if (room.offer.kind === 'restart') { next.record = recordOf([], 'local'); next.state = initialState(); }
        else next.record.ending = 'draw';
      }
      next.offer = null;
    } else fail(400, 'Thao tác không được hỗ trợ.');
    next.receipts = [...room.receipts, { id: command.id, side, digest }].slice(-128);
    this.persist(next);
    return this.snapshot(next, side);
  }
}
