import {
  legalMoves,
  movedBoard,
  other,
  crossed,
  col,
  positionKey,
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
  function negamax(board, side, depth, alpha, beta, ply, path) {
    if ((++nodes & 31) === 0 && now() >= deadline) throw expired;
    const key = positionKey(board, side);
    if (path.filter((k) => k === key).length >= 3) return 0;
    const moves = legalMoves(board, side);
    if (!moves.length) return -MATE + ply;
    if (depth === 0) return evaluate(board, side);
    let value = -Infinity;
    for (const move of order(board, moves)) {
      const next = movedBoard(board, move.from, move.to),
        nextSide = other(side);
      value = Math.max(
        value,
        -negamax(next, nextSide, depth - 1, -beta, -alpha, ply + 1, [
          ...path,
          positionKey(next, nextSide),
        ]),
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
      for (const move of ordered) {
        if (now() >= deadline) throw expired;
        const next = movedBoard(state.board, move.from, move.to),
          side = other(state.turn);
        const value = -negamax(next, side, depth - 1, -Infinity, -score, 1, [
          ...state.positions,
          positionKey(next, side),
        ]);
        if (value > score) {
          score = value;
          candidate = move;
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
