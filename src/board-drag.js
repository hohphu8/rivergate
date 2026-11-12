// Pointer coordinates are transient presentation state; the game still owns
// selection, legal moves and commits. Touch keeps its native tap/scroll flow.
export function attachBoardDrag(board, { source, choose, targets, drop }) {
  const lifetime = new AbortController();
  const options = { signal: lifetime.signal };
  let drag = null;
  let suppressClick = false;

  function cancel() {
    const previous = drag;
    drag = null;
    if (!previous) return;
    if (previous.moved) suppressClick = true;
    previous.ghost?.remove();
    previous.piece.removeAttribute("data-drag-source");
    board.classList.remove("dragging");
    board.querySelectorAll(".drop-target").forEach(el => el.classList.remove("drop-target"));
    if (previous.point.hasPointerCapture(previous.id))
      previous.point.releasePointerCapture(previous.id);
  }

  board.addEventListener("pointerdown", event => {
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    cancel();
    suppressClick = false;
    const point = event.target.closest("[data-at]");
    if (!point || !board.contains(point)) return;
    const at = Number(point.dataset.at);
    const id = source(at);
    if (!id) return;
    const piece = board.querySelector(`[data-piece="${id}"]`);
    if (!piece) return;
    drag = { id: event.pointerId, at, x: event.clientX, y: event.clientY, point, piece, moved: false };
    point.setPointerCapture(event.pointerId);
  }, options);

  board.addEventListener("pointermove", event => {
    if (!drag || event.pointerId !== drag.id) return;
    if (!event.buttons) { cancel(); return; }
    if (!drag.moved) {
      if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 6) return;
      drag.moved = true;
      choose(drag.at);
      drag.allowed = targets(drag.at);
      const ghost = document.createElement("span");
      ghost.className = `${drag.piece.className} drag-ghost`;
      ghost.textContent = drag.piece.textContent;
      ghost.setAttribute("aria-hidden", "true");
      ghost.style.width = `${drag.piece.getBoundingClientRect().width}px`;
      board.append(ghost);
      drag.ghost = ghost;
      drag.piece.setAttribute("data-drag-source", "");
      board.classList.add("dragging");
    }
    event.preventDefault();
    const rect = board.getBoundingClientRect();
    drag.ghost.style.left = `${event.clientX - rect.left}px`;
    drag.ghost.style.top = `${event.clientY - rect.top}px`;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-at]");
    drag.to = target && board.contains(target) ? Number(target.dataset.at) : -1;
    board.querySelectorAll(".drop-target").forEach(el => el.classList.remove("drop-target"));
    if (drag.allowed.includes(drag.to)) target.classList.add("drop-target");
  }, options);

  board.addEventListener("pointerup", event => {
    if (!drag || event.pointerId !== drag.id) return;
    const { moved, to, allowed } = drag;
    cancel();
    if (moved && allowed.includes(to)) drop(to);
  }, options);
  board.addEventListener("pointercancel", cancel, options);
  board.addEventListener("lostpointercapture", cancel, options);
  board.addEventListener("click", event => {
    if (suppressClick && event.detail > 0) {
      suppressClick = false;
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, { ...options, capture: true });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") cancel();
  }, options);
  window.addEventListener("blur", cancel, options);
  window.addEventListener("resize", cancel, options);
  document.addEventListener("scroll", cancel, { ...options, capture: true });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) cancel();
  }, options);
  return { cancel, dispose() { cancel(); lifetime.abort(); } };
}
