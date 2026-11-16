// input.js — keyboard, mouse and pointer lock, kept apart from the sim.
// The sim reads `keys` (held), `pressed` (edge, drained by the reader each
// step) and the accumulated look deltas; nothing here knows the game rules.

export function createInput(canvas) {
  const keys = new Set();
  const pressed = new Set();
  let lookDX = 0, lookDY = 0, firing = false, clicked = false, locked = false;

  addEventListener('keydown', (e) => {
    if (e.repeat) return;
    keys.add(e.code); pressed.add(e.code);
    if (['Space', 'Tab', 'KeyB'].includes(e.code)) e.preventDefault();
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => { keys.clear(); firing = false; });

  canvas.addEventListener('mousedown', (e) => {
    if (!locked) return;
    if (e.button === 0) { firing = true; clicked = true; }
    if (e.button === 2) pressed.add('MouseRight');
  });
  addEventListener('mouseup', (e) => { if (e.button === 0) firing = false; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
    if (!locked) firing = false;
  });
  document.addEventListener('mousemove', (e) => {
    if (!locked) return;
    lookDX += e.movementX || 0;
    lookDY += e.movementY || 0;
  });

  return {
    keys, pressed,
    get locked() { return locked; },
    get firing() { return firing; },
    get clicked() { const c = clicked; clicked = false; return c; },
    requestLock() { canvas.requestPointerLock?.(); },
    takeLook() { const d = { dx: lookDX, dy: lookDY }; lookDX = 0; lookDY = 0; return d; },
    drainPressed(code) { const p = pressed.has(code); if (p) pressed.delete(code); return p; },
  };
}
