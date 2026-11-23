'use strict';
/* Input: toetsenbord (pijltjes/WASD) en muis (richten + schieten). */
const Input = {
  keys: Object.create(null),
  pressed: Object.create(null),
  mouse: { x: 240, y: 135, down: false, clicked: false },

  init(canvas) {
    const block = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);
    window.addEventListener('keydown', e => {
      if (block.has(e.code)) e.preventDefault();
      if (!this.keys[e.code]) this.pressed[e.code] = true;
      this.keys[e.code] = true;
      Sound.init();
    });
    window.addEventListener('keyup', e => { this.keys[e.code] = false; });

    const toCanvas = e => {
      const r = canvas.getBoundingClientRect();
      this.mouse.x = (e.clientX - r.left) * canvas.width / r.width;
      this.mouse.y = (e.clientY - r.top) * canvas.height / r.height;
    };
    window.addEventListener('mousemove', toCanvas);
    canvas.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      toCanvas(e);
      this.mouse.down = true;
      this.mouse.clicked = true;
      Sound.init();
      e.preventDefault();
    });
    window.addEventListener('mouseup', e => { if (e.button === 0) this.mouse.down = false; });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('blur', () => {
      this.keys = Object.create(null);
      this.mouse.down = false;
    });
  },

  held(...codes) { return codes.some(c => this.keys[c]); },

  // Eenmalige toetsdruk (bijv. P voor pauze); wordt "opgebruikt" bij uitlezen.
  wasPressed(...codes) {
    for (const c of codes) {
      if (this.pressed[c]) { this.pressed[c] = false; return true; }
    }
    return false;
  },

  consumeClick() {
    if (this.mouse.clicked) { this.mouse.clicked = false; return true; }
    return false;
  },

  endFrame() {
    this.pressed = Object.create(null);
    this.mouse.clicked = false;
  },
};
