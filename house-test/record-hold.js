// Keep long presses separate from scrolling, dragging and ordinary taps.
const HOLD_MS = 550;
const MOVE_PX = 8;
let cancelCurrentHold = null;
let clearPendingClick = null;

export function bindRecordHold(target, { open, active = () => true } = {}) {
  if (!target || typeof open !== 'function') return () => {};
  const doc = target.ownerDocument;
  const win = doc.defaultView;
  let disposed = false;
  let gesture = null;
  let recentOpen = 0;
  let ownClickGuard = null;
  const usable = () => {
    if (disposed || !target.isConnected || target.matches(':disabled,[aria-disabled="true"]')) return false;
    try { return !!active(); } catch (_) { return false; }
  };
  const editing = event => {
    const node = event.target?.nodeType === 1 ? event.target : event.target?.parentElement;
    return !!node && (!!node.closest('input,textarea,select') || node.isContentEditable);
  };
  const clearClickGuard = () => {
    if (ownClickGuard) ownClickGuard();
  };
  const guardNextClick = () => {
    if (clearPendingClick) clearPendingClick();
    let expiry;
    const clear = () => {
      win.clearTimeout(expiry);
      doc.removeEventListener('click', block, true);
      doc.removeEventListener('pointerdown', clear, true);
      win.removeEventListener('blur', clear);
      if (clearPendingClick === clear) clearPendingClick = null;
      if (ownClickGuard === clear) ownClickGuard = null;
    };
    const block = event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      clear();
    };
    // A new deliberate tap always restores its normal click behavior.
    doc.addEventListener('click', block, true);
    doc.addEventListener('pointerdown', clear, { capture: true, passive: true });
    win.addEventListener('blur', clear, { once: true });
    expiry = win.setTimeout(clear, 2500);
    ownClickGuard = clearPendingClick = clear;
  };
  const cancel = () => {
    if (!gesture) return;
    win.clearTimeout(gesture.timer);
    gesture.controller.abort();
    gesture = null;
    if (cancelCurrentHold === cancel) cancelCurrentHold = null;
  };
  const show = (fromPointer = false) => {
    if (!usable()) { cancel(); return; }
    if (gesture?.opened) return;
    if (gesture) {
      gesture.opened = true;
      win.clearTimeout(gesture.timer);
    }
    recentOpen = Date.now();
    if (fromPointer) guardNextClick();
    open();
  };
  const pointerDown = event => {
    clearClickGuard();
    recentOpen = 0;
    if (cancelCurrentHold) cancelCurrentHold();
    if (event.button !== 0 || event.isPrimary === false || !usable() || editing(event)) return;
    const controller = new win.AbortController();
    const state = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, opened: false, controller, timer: 0 };
    gesture = state;
    cancelCurrentHold = cancel;
    const options = { capture: true, passive: true, signal: controller.signal };
    doc.addEventListener('pointermove', move => {
      if (move.pointerId !== state.pointerId) return;
      if (!usable() || Math.hypot(move.clientX - state.x, move.clientY - state.y) > MOVE_PX) cancel();
    }, options);
    const end = up => {
      if (up.pointerId === state.pointerId) {
        if (state.opened) guardNextClick();
        cancel();
      }
    };
    doc.addEventListener('pointerup', end, options);
    doc.addEventListener('pointercancel', cancel, options);
    doc.addEventListener('pointerdown', other => {
      if (other.pointerId !== state.pointerId) cancel();
    }, options);
    doc.addEventListener('scroll', cancel, options);
    win.addEventListener('blur', cancel, { signal: controller.signal });
    state.timer = win.setTimeout(() => {
      if (gesture === state) show(true);
    }, HOLD_MS);
  };
  const pointerLeave = event => {
    if (gesture?.pointerId === event.pointerId) cancel();
  };
  const contextMenu = event => {
    if (!usable() || editing(event)) return;
    event.preventDefault();
    event.stopPropagation();
    // Mobile browsers may send their native contextmenu after our timer fired.
    if (gesture?.opened || Date.now() - recentOpen < 800) return;
    show(!!gesture || event.pointerType === 'touch');
  };
  const keyDown = event => {
    if (event.key !== 'ContextMenu' && !(event.key === 'F10' && event.shiftKey)) return;
    if (!usable() || editing(event)) return;
    event.preventDefault();
    event.stopPropagation();
    cancel();
    clearClickGuard();
    if (!event.repeat) show();
  };
  target.addEventListener('pointerdown', pointerDown, { passive: true });
  target.addEventListener('pointerleave', pointerLeave, { passive: true });
  target.addEventListener('contextmenu', contextMenu);
  target.addEventListener('keydown', keyDown);
  return () => {
    disposed = true;
    cancel();
    clearClickGuard();
    target.removeEventListener('pointerdown', pointerDown);
    target.removeEventListener('pointerleave', pointerLeave);
    target.removeEventListener('contextmenu', contextMenu);
    target.removeEventListener('keydown', keyDown);
  };
}
