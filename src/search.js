import {
  legalMoves,
  movedBoard,
  other,
  crossed,
  col,
  positionKey,
  inCheck,
  MAX_PLIES,
} from "./engine.js";
const VALUE = { g: 10000, r: 900, c: 450, h: 400, e: 200, a: 200, p: 100 };
const MATE = 100000;
function evaluate(board, side) {
  return board.reduce(
    (sum, p, i) =>
      sum +
      (p
        ? (p.side === side ? 1 : -1) *
          (VALUE[p.type] +
            (p.type === "p" && crossed(i, p.side) ? 70 : 0) +
            (p.type === "h" ? 12 * (4 - Math.abs(col(i) - 4)) : 0))
        : 0),
    0,
  );
}
// Synchronous by design: invoked in a disposable Worker, never on the UI thread.
export function search(
  state,
  {
    budgetMs = 700,
    maxDepth = 4,
    onProgress = () => {},
    now = () => performance.now(),
  } = {},
) {
  const started = now(),
    deadline = started + Math.max(30, Math.min(2500, budgetMs));
  let nodes = 0,
    completedDepth = 0;
  const root = legalMoves(state.board, state.turn);
  if (!root.length || state.result)
    return { move: null, nodes, depth: 0, score: -MATE };
  let best = root[0],
    bestScore = 0;
  const expired = {};
  const order = (board, moves) =>
    moves.sort(
      (a, b) =>
        (VALUE[board[b.to]?.type] || 0) - (VALUE[board[a.to]?.type] || 0),
    );
  function negamax(board, side, depth, alpha, beta, ply, path, quietLeft = 4) {
    if ((++nodes & 31) === 0 && now() >= deadline) throw expired;
    const key = positionKey(board, side);
    let moves = legalMoves(board, side);
    if (!moves.length) return -MATE + ply;
    if (path.filter((k) => k === key).length >= 3 || state.ply + ply >= MAX_PLIES) return 0;
    let value = -Infinity;
    if (depth <= 0) {
      // Do not value an unfinished exchange as free material. In check, search
      // every legal escape; otherwise extend captures only. Bound both time and
      // extra plies so checking sequences cannot monopolize the Worker.
      if (quietLeft === 0) return evaluate(board, side);
      if (!inCheck(board, side)) {
        value = evaluate(board, side);
        if (value >= beta) return value;
        alpha = Math.max(alpha, value);
        moves = moves.filter(move => board[move.to]);
      }
    }
    for (const move of order(board, moves)) {
      const next = movedBoard(board, move.from, move.to),
        nextSide = other(side);
      value = Math.max(
        value,
        -negamax(next, nextSide, depth - 1, -beta, -alpha, ply + 1, [
          ...path,
          positionKey(next, nextSide),
        ], depth <= 0 ? quietLeft - 1 : quietLeft),
      );
      alpha = Math.max(alpha, value);
      if (alpha >= beta) break;
    }
    return value;
  }
  for (let depth = 1; depth <= Math.min(5, maxDepth); depth++) {
    let candidate = best,
      score = -Infinity;
    try {
      const ordered = order(state.board, root.slice());
      ordered.sort(
        (a, b) =>
          Number(b.from === best.from && b.to === best.to) -
          Number(a.from === best.from && a.to === best.to),
      );
      let candidateRepeats = Infinity;
      for (const move of ordered) {
        if (now() >= deadline) throw expired;
        const next = movedBoard(state.board, move.from, move.to),
          side = other(state.turn);
        const path = [
          ...state.positions,
          positionKey(next, side),
        ];
        let value = -negamax(next, side, depth - 1, -Infinity, -score, 1, path);
        const repeats = state.positions.filter(key => key === positionKey(next, side)).length;
        // A cutoff at the incumbent score is only an upper bound. Resolve it
        // before treating it as an equal score for the repetition tie-break.
        if (value === score && repeats < candidateRepeats)
          value = -negamax(next, side, depth - 1, -Infinity, Infinity, 1, path);
        // Exact equal scores prefer a less repeated position. A real draw still
        // scores zero: do not avoid a necessary draw when otherwise losing.
        if (value > score || (value === score && repeats < candidateRepeats)) {
          score = value;
          candidate = move;
          candidateRepeats = repeats;
        }
      }
      best = candidate;
      bestScore = score;
      completedDepth = depth;
      onProgress({ depth, nodes, elapsed: Math.round(now() - started) });
      if (Math.abs(score) > MATE - 100) break;
    } catch (error) {
      if (error !== expired) throw error;
      break;
    }
  }
  return {
    move: best,
    score: bestScore,
    depth: completedDepth,
    nodes,
    elapsed: Math.round(now() - started),
  };
}
