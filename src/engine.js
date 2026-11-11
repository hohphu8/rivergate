export const RULES = 'rivergate-casual-v1';
export const MAX_PLIES = 600;
export const other = side => side === 'red' ? 'black' : 'red';
export const row = at => Math.floor(at / 9);
export const col = at => at % 9;
export const inside = (r, c) => r >= 0 && r < 10 && c >= 0 && c < 9;
export const palace = (r, c, side) => c >= 3 && c <= 5 && (side === 'red' ? r >= 7 && r <= 9 : r >= 0 && r <= 2);
export const crossed = (at, side) => side === 'red' ? row(at) <= 4 : row(at) >= 5;
export const NAMES = { g: 'Tướng', a: 'Sĩ', e: 'Tượng', h: 'Mã', r: 'Xe', c: 'Pháo', p: 'Tốt' };
export const coordinate = at => `${'abcdefghi'[col(at)]}${10 - row(at)}`;

export function positionKey(board, turn) {
  return `${turn}:` + board.map(p => p ? (p.side === 'red' ? p.type.toUpperCase() : p.type) : '.').join('');
}

export function initialState() {
  const board = Array(90).fill(null);
  const place = (at, side, type) => { board[at] = { id: `${side}-${type}-${at}`, side, type }; };
  for (const side of ['black', 'red']) {
    const back = side === 'black' ? 0 : 9;
    'rheagaehr'.split('').forEach((type, c) => place(back * 9 + c, side, type));
    for (const c of [1, 7]) place((side === 'black' ? 2 : 7) * 9 + c, side, 'c');
    for (const c of [0, 2, 4, 6, 8]) place((side === 'black' ? 3 : 6) * 9 + c, side, 'p');
  }
  return { board, turn: 'red', ply: 0, positions: [positionKey(board, 'red')], result: null, last: null };
}

// Pseudo targets include the opposing general for attack detection only.
export function targets(board, from) {
  const piece = board[from];
  if (!piece) return [];
  const { side, type } = piece, r = row(from), c = col(from), moves = [];
  const add = (rr, cc) => {
    if (inside(rr, cc) && board[rr * 9 + cc]?.side !== side) moves.push(rr * 9 + cc);
  };
  if (type === 'r' || type === 'c') {
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      let screen = false;
      for (let rr = r + dr, cc = c + dc; inside(rr, cc); rr += dr, cc += dc) {
        const at = rr * 9 + cc, target = board[at];
        if (!screen) {
          if (!target) moves.push(at);
          else if (type === 'r') { if (target.side !== side) moves.push(at); break; }
          else screen = true;
        } else if (target) { if (target.side !== side) moves.push(at); break; }
      }
    }
  } else if (type === 'h') {
    for (const [dr, dc] of [[2,1],[2,-1],[-2,1],[-2,-1],[1,2],[-1,2],[1,-2],[-1,-2]]) {
      const leg = (r + (Math.abs(dr) === 2 ? Math.sign(dr) : 0)) * 9 + c + (Math.abs(dc) === 2 ? Math.sign(dc) : 0);
      if (!board[leg]) add(r + dr, c + dc);
    }
  } else if (type === 'e') {
    for (const [dr, dc] of [[2,2],[2,-2],[-2,2],[-2,-2]]) {
      const rr = r + dr, cc = c + dc;
      if (inside(rr, cc) && (side === 'red' ? rr >= 5 : rr <= 4) && !board[(r + dr / 2) * 9 + c + dc / 2]) add(rr, cc);
    }
  } else if (type === 'a') {
    for (const [dr, dc] of [[1,1],[1,-1],[-1,1],[-1,-1]]) if (palace(r + dr, c + dc, side)) add(r + dr, c + dc);
  } else if (type === 'g') {
    for (const [dr, dc] of [[1,0],[-1,0],[0,1],[0,-1]]) if (palace(r + dr, c + dc, side)) add(r + dr, c + dc);
    for (const dr of [-1, 1]) for (let rr = r + dr; inside(rr, c); rr += dr) {
      const target = board[rr * 9 + c];
      if (target) { if (target.type === 'g' && target.side !== side) moves.push(rr * 9 + c); break; }
    }
  } else if (type === 'p') {
    add(r + (side === 'red' ? -1 : 1), c);
    if (crossed(from, side)) { add(r, c - 1); add(r, c + 1); }
  }
  return moves;
}

export function inCheck(board, side) {
  const general = board.findIndex(p => p?.type === 'g' && p.side === side);
  if (general < 0) return true;
  return board.some((p, at) => p && p.side !== side && targets(board, at).includes(general));
}
export function movedBoard(board, from, to) {
  const next = board.slice(); next[to] = next[from]; next[from] = null; return next;
}
export function legalMoves(board, side) {
  const moves = [];
  board.forEach((piece, from) => {
    if (piece?.side !== side) return;
    for (const to of targets(board, from)) {
      if (board[to]?.type === 'g') continue;
      if (!inCheck(movedBoard(board, from, to), side)) moves.push({ from, to });
    }
  });
  return moves;
}
export function outcome(board, turn, positions, ply) {
  if (!legalMoves(board, turn).length) return { winner: other(turn), reason: inCheck(board, turn) ? 'mate' : 'stalemate' };
  const key = positionKey(board, turn);
  if (positions.filter(value => value === key).length >= 3) return { winner: null, reason: 'repetition' };
  if (ply >= MAX_PLIES) return { winner: null, reason: 'limit' };
  return null;
}
export function play(state, move) {
  if (state.result || !move || !Number.isInteger(move.from) || !Number.isInteger(move.to) ||
      !legalMoves(state.board, state.turn).some(m => m.from === move.from && m.to === move.to)) throw new Error('Nước đi không hợp lệ.');
  const board = movedBoard(state.board, move.from, move.to), turn = other(state.turn), ply = state.ply + 1;
  const positions = [...state.positions, positionKey(board, turn)];
  return { board, turn, ply, positions, result: outcome(board, turn, positions, ply), last: { from: move.from, to: move.to } };
}
export function describeMove(state, move) {
  const piece = state.board[move.from];
  return `${NAMES[piece.type]} ${coordinate(move.from)} ${state.board[move.to] ? '×' : '→'} ${coordinate(move.to)}`;
}
export function recordOf(moves, mode = 'bot', ending = null) {
  return { rules: RULES, mode, moves: moves.map(({ from, to }) => [from, to]), ending };
}
export function restore(record) {
  if (!record || record.rules !== RULES || !['bot', 'local'].includes(record.mode) || !Array.isArray(record.moves) || record.moves.length > MAX_PLIES || ![null, undefined, 'draw', 'red-resign', 'black-resign'].includes(record.ending)) throw new Error('Bản ghi không được hỗ trợ hoặc quá dài.');
  const timeline = [initialState()], moves = [];
  for (const pair of record.moves) {
    if (!Array.isArray(pair) || pair.length !== 2 || !pair.every(v => Number.isInteger(v) && v >= 0 && v < 90)) throw new Error('Bản ghi chứa nước đi sai.');
    const move = { from: pair[0], to: pair[1] };
    timeline.push(play(timeline.at(-1), move)); moves.push(move);
  }
  if (record.ending && timeline.at(-1).result) throw new Error('Bản ghi có kết quả mâu thuẫn.');
  return { timeline, moves, mode: record.mode, ending: record.ending || null };
}
