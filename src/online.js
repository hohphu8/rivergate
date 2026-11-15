import { Game } from './game.js';
import { restore, legalMoves } from './engine.js';

export const ROOM_SAVE = 'rivergate.room.v1';
export const randomHex = bytes => Array.from(crypto.getRandomValues(new Uint8Array(bytes)), b => b.toString(16).padStart(2, '0')).join('');
const valid = (value, length) => typeof value === 'string' && new RegExp(`^[a-f0-9]{${length}}$`).test(value);
export function savedSeat(storage) {
  try {
    const value = JSON.parse(storage?.getItem(ROOM_SAVE));
    return value && valid(value.id, 24) && valid(value.key, 64) && valid(value.invite, 64)
      && ['create', 'join', 'ready'].includes(value.stage) ? value : null;
  } catch { return null; }
}

// One request in flight. Unacknowledged commands retain their ID across retries
// and reloads. No local board prediction: only accepted server snapshots render.
export class OnlineGame extends Game {
  constructor({ seat, storage, onChange, request = (...args) => globalThis.fetch(...args), interval = 1000 }) {
    super({ storage: null, onChange, bot: { cancel() {}, dispose() {} } });
    this.mode = 'online'; this.seat = seat; this.seatStorage = storage;
    this.request = request; this.interval = interval; this.snapshot = null;
    this.connected = false; this.busy = false; this.stopped = false;
    this.timer = null; this.controller = null; this.timeout = null; this.serverRevision = -1;
    this.pending = seat.pending || null;
    this.actionError = ''; this.failures = 0; this.retryDelay = 0;
    this.notice = 'Đang kết nối phòng…';
    this.storageStatus = 'Ván online được lưu trên server. Bản local vẫn được giữ.';
  }
  persistSeat() {
    this.seatStorage.setItem(ROOM_SAVE, JSON.stringify({ ...this.seat, pending: this.pending }));
  }
  get humanTurn() {
    return !!(this.connected && this.snapshot?.joined && !this.pending && !this.reviewing
      && !this.result && this.live.turn === this.snapshot.side);
  }
  start() { this.publish(); void this.sync(); }
  ensureBot() {}
  save() {}
  setMode() {}
  newGame() { return this.send({ type: 'offer', kind: 'restart' }); }
  finish(kind) { return this.send(kind === 'draw' ? { type: 'offer', kind: 'draw' } : { type: 'resign' }); }
  undo() { this.notice = 'Ván online chưa hỗ trợ lùi nước.'; this.publish(); }
  importRecord() { throw Error('Không thể nhập bản ghi vào phòng online.'); }
  record() { return { ...super.record(), mode: 'local' }; }
  commit(move) {
    if (!this.humanTurn || !legalMoves(this.live.board, this.live.turn).some(m => m.from === move.from && m.to === move.to)) return false;
    return this.send({ type: 'move', move });
  }
  send(action) {
    if (!this.alive || !this.connected || this.pending || !this.snapshot || this.reviewing) return false;
    this.actionError = '';
    this.pending = { ...action, id: randomHex(12), revision: this.serverRevision };
    try { this.persistSeat(); }
    catch { this.pending = null; this.notice = 'Không lưu được yêu cầu trên trình duyệt. Chưa gửi thao tác; hãy xuất bản ghi nếu cần.'; this.publish(); return false; }
    this.publish();
    if (!this.busy) { clearTimeout(this.timer); void this.sync(); }
    return true;
  }
  apply(snapshot) {
    if (snapshot.id !== this.seat.id || !Number.isInteger(snapshot.revision)
      || !['red', 'black'].includes(snapshot.side)) throw Error('Phản hồi phòng không hợp lệ.');
    if (snapshot.revision < this.serverRevision) return;
    if (snapshot.revision !== this.serverRevision) {
      const parsed = restore(snapshot.record);
      const oldView = this.view;
      Object.assign(this, { timeline: parsed.timeline, moves: parsed.moves, ending: parsed.ending });
      this.view = this.reviewing ? Math.min(oldView, this.moves.length) : this.moves.length;
      this.serverRevision = snapshot.revision;
    }
    this.snapshot = snapshot;
  }
  async sync() {
    if (!this.alive || this.busy || this.stopped) return;
    this.busy = true;
    const controller = this.controller = new AbortController();
    this.timeout = setTimeout(() => controller.abort(), 8000);
    const pending = this.pending, stage = this.seat.stage;
    const path = `/api/rooms/${this.seat.id}`;
    const method = stage === 'create' ? 'PUT' : stage === 'join' || pending ? 'POST' : 'GET';
    const url = path + (stage === 'join' ? '/join' : stage === 'ready' && pending ? '/commands' : '');
    const body = stage !== 'ready' ? { key: this.seat.key, invite: this.seat.invite } : pending;
    try {
      const response = await this.request(url, { method, cache: 'no-store', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.seat.key}` },
        ...(method !== 'GET' ? { body: JSON.stringify(body) } : {}) });
      const data = await response.json();
      if (!this.alive) return;
      if (!response.ok) {
        if (response.status === 429) this.retryDelay = 60000;
        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          if (pending) this.actionError = data.error || 'Thao tác bị từ chối. Hãy chọn lại sau khi đồng bộ.';
          if (pending === this.pending) this.pending = null;
          if ([403, 404, 410].includes(response.status) || stage !== 'ready') this.stopped = true;
          this.persistSeat();
        }
        throw Error(data.error || 'Không kết nối được server.');
      }
      this.apply(data);
      this.seat.stage = 'ready';
      if (pending && this.pending === pending) this.pending = null;
      this.persistSeat();
      this.connected = true;
      this.failures = 0;
      this.retryDelay = 0;
      this.notice = this.pending ? 'Đang gửi thao tác…' : 'Đã đồng bộ với phòng.';
    } catch (error) {
      if (!this.alive) return;
      this.connected = false;
      this.failures++;
      this.notice = error.name === 'AbortError' ? 'Kết nối quá chậm. Đang thử lại; chưa xác nhận thao tác.'
        : `${error.message} ${this.stopped ? '' : 'Đang kết nối lại; bàn cờ tạm khóa.'}`;
    } finally {
      clearTimeout(this.timeout); this.timeout = null; this.controller = null; this.busy = false;
      if (this.alive) {
        this.publish();
        if (!this.stopped) this.timer = setTimeout(() => void this.sync(), this.pending && this.connected ? 0
          : Math.max(this.retryDelay, this.interval * Math.min(8, 2 ** Math.max(0, this.failures - 1))));
      }
    }
  }
  retry() { if (!this.alive) return; this.stopped = false; clearTimeout(this.timer); void this.sync(); }
  dispose() {
    this.alive = false; clearTimeout(this.timer); clearTimeout(this.timeout); this.controller?.abort();
    this.bot.dispose();
  }
}
