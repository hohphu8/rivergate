import * as Gyos from "gyosjs/csp";
import { version as gyosVersion } from "gyosjs/package.json";
import { Game } from "./game.js";
import { attachBoardDrag } from "./board-drag.js";
import { legalMoves, inCheck, NAMES, coordinate, col, row, positionKey } from "./engine.js";
import "./style.css";

const GLYPHS = {
  red: { g: "帥", a: "仕", e: "相", h: "傌", r: "俥", c: "炮", p: "兵" },
  black: { g: "將", a: "士", e: "象", h: "馬", r: "車", c: "砲", p: "卒" },
};
const SIDES = { red: "Đỏ", black: "Đen" };
const REASONS = {
  mate: "Chiếu bí",
  stalemate: "Hết nước hợp lệ",
  repetition: "Cùng thế cờ và lượt đi đã lặp 3 lần: hòa theo luật phổ thông, kể cả khi đang chiếu. Chưa phân xử chiếu dai theo luật giải.",
  limit: "Giới hạn 600 lượt",
  agreed: "Đồng ý hòa",
  resign: "Xin thua",
};
Gyos.scope("Rivergate", () => {
  const s = Gyos.signal;
  const cells = s([]),
    pieces = s([]),
    history = s([]),
    turn = s("red"),
    selected = s(-1),
    focus = s(81),
    flipped = s(false),
    latin = s(false);
  const mode = s("bot"),
    thinking = s(false),
    status = s("Đỏ khai cuộc"),
    detail = s("Chọn một quân để xem nước hợp lệ."),
    notice = s(""),
    saveStatus = s(""),
    botError = s(""),
    progress = s(""),
    count = s(0),
    view = s(0),
    reviewing = s(false),
    finished = s(false),
    check = s(false),
    captured = s("Chưa có quân bị bắt"),
    lastMove = s("Chưa có nước đi"),
    repetitionNote = s(""),
    modal = s(""),
    importText = s(""),
    importError = s(""),
    replaying = s(false);
  let game,
    boardDrag,
    alive = true,
    replayTimer = null,
    fileGeneration = 0;
  const lifetime = new AbortController();
  let storage;
  try {
    storage = window.localStorage;
  } catch {
    storage = null;
  }
  const place = (at) => {
    const x = flipped() ? 8 - col(at) : col(at),
      y = flipped() ? 9 - row(at) : row(at);
    return `left:${((x + 0.5) / 9) * 100}%;top:${((y + 0.5) / 10) * 100}%;`;
  };
  function render() {
    if (!game) return;
    const state = game.state,
      chosen = selected(),
      possible = game.humanTurn
        ? legalMoves(state.board, state.turn)
            .filter((m) => m.from === chosen)
            .map((m) => m.to)
        : [];
    const isCheck = inCheck(state.board, state.turn),
      result = game.result;
    const displayPieces = state.board.flatMap((p, at) =>
      p
        ? [
            {
              ...p,
              at,
              glyph: latin() ? NAMES[p.type] : GLYPHS[p.side][p.type],
              style: place(at),
              className: `piece ${p.side} ${state.last?.to === at ? "last-moved" : ""} ${selected() === at ? "selected" : ""} ${isCheck && p.type === "g" && p.side === state.turn ? "checked" : ""} ${latin() ? "latin" : ""}`,
            },
          ]
        : [],
    );
    Gyos.batch(() => {
      pieces(displayPieces);
      const occurrences = state.positions.filter(key => key === positionKey(state.board, state.turn)).length;
      repetitionNote(!result && occurrences === 2
        ? "Thế cờ và lượt đi này đã xuất hiện 2 lần. Nếu lặp lần thứ 3, ván sẽ hòa, kể cả khi đang chiếu."
        : "");
      lastMove(state.last
        ? `${game.reviewing ? "Nước đang xem" : "Nước vừa đi"}: ${SIDES[state.board[state.last.to].side]} · ${NAMES[state.board[state.last.to].type]} ${coordinate(state.last.from)} → ${coordinate(state.last.to)}`
        : "Chưa có nước đi");
      cells(
        Array.from({ length: 90 }, (_, at) => ({
          at,
          style: place(at),
          label: `${coordinate(at)}${state.board[at] ? `, ${NAMES[state.board[at].type]} ${SIDES[state.board[at].side]}` : ", trống"}${possible.includes(at) ? ", có thể đi tới" : ""}${state.last?.from === at ? ", điểm xuất phát nước vừa đi" : ""}${state.last?.to === at ? ", điểm đến nước vừa đi" : ""}`,
          className: `point ${possible.includes(at) ? "legal" : ""} ${state.last?.from === at ? "last-from" : ""} ${state.last?.to === at ? "last-to" : ""} ${chosen === at ? "chosen" : ""}`,
          tab: at === focus() ? 0 : -1,
        })),
      );
      turn(state.turn);
      mode(game.mode);
      thinking(game.thinking);
      reviewing(game.reviewing);
      finished(!!result);
      check(isCheck);
      count(game.moves.length);
      view(game.view);
      notice(game.notice);
      saveStatus(game.storageStatus);
      botError(game.botError);
      status(
        result
          ? result.winner
            ? `${SIDES[result.winner]} thắng`
            : "Ván hòa"
          : game.reviewing
            ? `Đang xem lượt ${game.view}`
            : game.thinking
              ? "Đen đang suy nghĩ"
              : `${SIDES[state.turn]} tới lượt${isCheck ? " · Chiếu!" : ""}`,
      );
      detail(
        result
          ? REASONS[result.reason]
          : game.reviewing
            ? "Lịch sử chỉ để xem. Ván hiện tại vẫn được giữ."
            : game.thinking
              ? "Bạn vẫn có thể lùi nước hoặc mở ván mới."
              : isCheck
                ? "Hãy đưa tướng ra khỏi thế bị chiếu."
                : "Chọn quân, rồi chọn một điểm được đánh dấu.",
      );
      progress(
        game.progress
          ? `Độ sâu ${game.progress.depth} · ${game.progress.nodes.toLocaleString("vi-VN")} thế cờ`
          : "Đối thủ cơ bản · tính toán trên luồng riêng",
      );
      history(
        game.moves.map((m, i) => ({
          id: i + 1,
          number: String(i + 1).padStart(2, "0"),
          side: i % 2 ? "Đen" : "Đỏ",
          label: `${NAMES[game.timeline[i].board[m.from].type]} ${coordinate(m.from)} ${game.timeline[i].board[m.to] ? "×" : "→"} ${coordinate(m.to)}`,
          active: game.view === i + 1,
        })),
      );
      const red = displayPieces.filter((p) => p.side === "red").length,
        black = displayPieces.length - red;
      captured(`Đỏ còn ${red} quân · Đen còn ${black} quân`);
    });
  }
  function clearSelection() {
    boardDrag?.cancel();
    selected(-1);
  }
  function stopReplay() {
    if (replayTimer !== null) clearTimeout(replayTimer);
    replayTimer = null;
    replaying(false);
  }
  function select(at) {
    if (!alive || replaying() || !game.humanTurn) return;
    focus(at);
    const piece = game.state.board[at],
      from = selected();
    if (piece?.side === game.state.turn) {
      selected(from === at ? -1 : at);
      render();
      return;
    }
    if (from !== -1) {
      if (game.commit({ from, to: at })) clearSelection();
      render();
    }
  }
  function focusPoint() {
    queueMicrotask(() => {
      if (alive)
        document
          .querySelector(`[data-at="${focus()}"]`)
          ?.focus({ preventScroll: true });
    });
  }
  function key(event, at) {
    if (event.key === "Escape") {
      clearSelection();
      render();
      return;
    }
    const offsets = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    if (event.key === "Home") {
      event.preventDefault();
      focus(flipped() ? 8 : 81);
      render();
      focusPoint();
      return;
    }
    if (offsets[event.key]) {
      event.preventDefault();
      const [dr, dc] = offsets[event.key],
        sign = flipped() ? -1 : 1;
      const rr = Math.max(0, Math.min(9, row(at) + dr * sign)),
        cc = Math.max(0, Math.min(8, col(at) + dc * sign));
      focus(rr * 9 + cc);
      render();
      focusPoint();
    }
  }
  function seek(index) {
    stopReplay();
    clearSelection();
    game.seek(index);
  }
  function live() {
    stopReplay();
    clearSelection();
    game.returnLive();
  }
  function replay() {
    if (replaying()) {
      stopReplay();
      return;
    }
    clearSelection();
    game.seek(0);
    replaying(true);
    const tick = () => {
      if (!alive || !replaying()) return;
      if (game.view >= game.moves.length) {
        stopReplay();
        return;
      }
      game.seek(game.view + 1);
      replayTimer = setTimeout(tick, 850);
    };
    replayTimer = setTimeout(tick, 850);
  }
  function open(name) {
    boardDrag?.cancel();
    stopReplay();
    modal(name);
    importError("");
    const dialog = document.getElementById("dialog");
    if (!dialog.open) dialog.showModal();
  }
  function close() {
    fileGeneration++;
    document.getElementById("dialog")?.close();
    modal("");
    importError("");
  }
  function confirm() {
    const action = modal();
    close();
    clearSelection();
    if (action === "new") game.newGame();
    else game.finish(action === "draw" ? "draw" : "resign");
  }
  function importGame() {
    try {
      game.importRecord(importText());
      clearSelection();
      close();
      render();
    } catch {
      importError(
        "Bản ghi không hợp lệ, khác luật hoặc quá dài. Ván hiện tại chưa thay đổi.",
      );
    }
  }
  async function readFile(event) {
    const file = event.target.files?.[0],
      generation = ++fileGeneration;
    if (!file) return;
    if (file.size > 100000) {
      importError("Chọn file JSON nhỏ hơn 100 KB.");
      return;
    }
    try {
      const text = await file.text();
      if (alive && generation === fileGeneration && modal() === "import")
        importText(text);
    } catch {
      importError("Không đọc được file. Bạn có thể dán JSON.");
    }
    event.target.value = "";
  }
  function exportGame() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(game.record(), null, 2)], {
        type: "application/json",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "rivergate-game.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  game = new Game({ storage, onChange() { boardDrag?.cancel(); render(); } });
  return {
    runtimeVersion: gyosVersion,
    cells,
    pieces,
    history,
    turn,
    selected,
    focus,
    flipped,
    latin,
    mode,
    thinking,
    status,
    detail,
    notice,
    saveStatus,
    botError,
    progress,
    count,
    view,
    reviewing,
    finished,
    check,
    captured,
    lastMove,
    repetitionNote,
    modal,
    importText,
    importError,
    replaying,
    playerName(top) {
      const side = top
        ? flipped()
          ? "red"
          : "black"
        : flipped()
          ? "black"
          : "red";
      return mode() === "local"
        ? `Bên ${SIDES[side]}`
        : side === "red"
          ? "Bạn cầm Đỏ"
          : "Người bạn máy";
    },
    playerDetail() {
      return mode() === "bot" ? progress() : "Hai người · cùng thiết bị";
    },
    labelButton() {
      return latin() ? "Chữ Hán" : "Tên tiếng Việt";
    },
    phaseLabel() {
      return reviewing()
        ? "XEM LẠI VÁN"
        : finished()
          ? "KẾT THÚC VÁN"
          : "VÁN ĐANG CHƠI";
    },
    dialogTitle() {
      return (
        {
          help: "Một chút trước khi qua sông.",
          import: "Mở lại một ván cờ.",
          new: "Bắt đầu một ván mới?",
          draw: "Khép ván bằng một lời hòa?",
          resign: "Bạn muốn xin thua?",
        }[modal()] || ""
      );
    },
    confirmText() {
      if (modal() === "new")
        return "Ván đang chơi sẽ được thay thế. Nếu muốn giữ lại, hãy xuất bản ghi trước.";
      if (modal() === "draw")
        return "Nếu chơi hai người, hãy chắc rằng cả hai cùng đồng ý. Với bot, bạn được chọn kết thúc hòa.";
      return mode() === "bot"
        ? "Bạn cầm Đỏ sẽ nhận thua và kết thúc ván."
        : "Bên đang tới lượt sẽ nhận thua và kết thúc ván.";
    },
    confirmLabel() {
      return (
        {
          new: "Bắt đầu ván mới",
          draw: "Đồng ý hòa",
          resign: "Xác nhận xin thua",
        }[modal()] || ""
      );
    },
    select,
    key,
    seek,
    live,
    replay,
    open,
    close,
    confirm,
    importGame,
    readFile,
    exportGame,
    changeMode(event) {
      stopReplay();
      clearSelection();
      game.setMode(event.target.value);
    },
    flip() {
      boardDrag?.cancel();
      flipped(!flipped());
      render();
    },
    toggleLabels() {
      boardDrag?.cancel();
      latin(!latin());
      render();
    },
    undo() {
      stopReplay();
      clearSelection();
      game.undo();
    },
    retry() {
      game.retry();
    },
    onMount() {
      game.start();
      boardDrag = attachBoardDrag(document.querySelector(".board"), {
        source(at) {
          const piece = game.state.board[at];
          return alive && !modal() && !replaying() && game.humanTurn && piece?.side === game.state.turn ? piece.id : null;
        },
        choose(at) { selected(at); focus(at); render(); },
        targets(at) { return legalMoves(game.state.board, game.state.turn).filter(move => move.from === at).map(move => move.to); },
        drop: select,
      });
      document.getElementById("dialog").addEventListener(
        "cancel",
        (event) => {
          event.preventDefault();
          close();
        },
        { signal: lifetime.signal },
      );
      document.addEventListener(
        "visibilitychange",
        () => {
          if (document.hidden) stopReplay();
        },
        { signal: lifetime.signal },
      );
      if (import.meta.env.DEV)
        window.__rivergate = {
          snapshot: () => structuredClone(game.live),
          record: () => game.record(),
          thinking: () => game.thinking,
          dispose: () => Gyos.cleanup(document.getElementById("app")),
          version: gyosVersion,
        };
    },
    onUnmount() {
      boardDrag?.dispose();
      alive = false;
      fileGeneration++;
      stopReplay();
      game.dispose();
      lifetime.abort();
      document.getElementById("dialog")?.close();
      if (import.meta.env.DEV) delete window.__rivergate;
    },
  };
});
Gyos.mountAll();
