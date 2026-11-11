import { positionKey } from "./engine.js";

export class BotClient {
  constructor({
    makeWorker = () =>
      new Worker(new URL("./bot.worker.js", import.meta.url), {
        type: "module",
      }),
    setTimer = (fn, ms) => setTimeout(fn, ms),
    clearTimer = (id) => clearTimeout(id),
  } = {}) {
    this.makeWorker = makeWorker;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.serial = 0;
    this.worker = null;
    this.timer = null;
    this.disposed = false;
  }
  cancel() {
    this.serial++;
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = null;
    if (this.worker) {
      this.worker.onmessage = null;
      this.worker.onerror = null;
      this.worker.onmessageerror = null;
      this.worker.terminate();
    }
    this.worker = null;
  }
  start(
    state,
    { budgetMs = 700, onProgress = () => {}, onResult, onError = () => {} },
  ) {
    if (this.disposed) return;
    this.cancel();
    const id = this.serial,
      key = positionKey(state.board, state.turn);
    const fail = () => {
      if (id !== this.serial || this.disposed) return;
      this.cancel();
      onError("Bot tạm ngừng. Thử lại hoặc chuyển sang hai người.");
    };
    try {
      const worker = this.makeWorker();
      this.worker = worker;
      worker.onmessage = ({ data }) => {
        if (
          this.disposed ||
          this.worker !== worker ||
          id !== this.serial ||
          data?.id !== id ||
          data?.key !== key
        )
          return;
        if (data.type === "progress") onProgress(data);
        else if (data.type === "result") {
          this.cancel();
          onResult(data, key);
        } else if (data.type === "error") fail();
      };
      worker.onerror = (event) => {
        event.preventDefault?.();
        fail();
      };
      worker.onmessageerror = fail;
      this.timer = this.setTimer(fail, Math.max(10000, budgetMs * 8));
      worker.postMessage({ type: "search", id, key, state, budgetMs });
    } catch {
      fail();
    }
  }
  dispose() {
    this.cancel();
    this.disposed = true;
  }
}
