'use strict';
/* World: tile-map van een level. Tekent de omgeving (vooraf naar één canvas),
   regelt botsingen en berekent een "flow field" zodat vijanden de weg vinden. */
const TILE = 16;

// Tegeltypes
//  .  vloer        #  muur        R  muur met Avans-rode streep   W  raam/glasgevel
//  L  kluisjes     C  pilaar      V  automaat                     D  deur (spawnpunt vijanden)
//  S  trap (spawn) X  uitgang     T  kantinetafel                 B  lessenaar
//  P  plant        K  balie       H  glazen reling                N  bank
//  O  vide (gat naar de verdieping eronder)                       p  startpositie speler
const HIGH_TILES = new Set(['#', 'R', 'W', 'L', 'C', 'V']);       // blokkeren alles
const LOW_TILES = new Set(['T', 'B', 'P', 'K', 'H', 'N', 'O']);   // kogels vliegen erover

const THEMES = {
  atrium:  { style: 'stone',    floor: '#d8d2c6', floor2: '#cec7b9', line: '#bab2a3', wall: '#2e3340', wallHi: '#454b5c', face: '#5a6278', faceHi: '#717a92', faceDark: '#3c4356' },
  gang:    { style: 'lino',     floor: '#aebccb', floor2: '#a0afbf', line: '#8e9eb1', wall: '#2c303b', wallHi: '#434856', face: '#6a7284', faceHi: '#818a9e', faceDark: '#4a5163' },
  kantine: { style: 'wood',     floor: '#c28d5c', floor2: '#b58152', line: '#94653c', wall: '#2f2a2a', wallHi: '#463f3e', face: '#7a6a5e', faceHi: '#928173', faceDark: '#54483f' },
  trap:    { style: 'concrete', floor: '#a9aaaf', floor2: '#9d9ea4', line: '#8a8b91', wall: '#2b2d33', wallHi: '#42454d', face: '#646875', faceHi: '#7b808e', faceDark: '#474a55' },
  exam:    { style: 'carpet',   floor: '#6e7f98', floor2: '#62738b', line: '#56657c', wall: '#221f2b', wallHi: '#37334a', face: '#4d4860', faceHi: '#635d7a', faceDark: '#37324a' },
};

const SIGN_STYLES = {
  red:   { bg: AVANS_RED, fg: '#ffffff', bd: '#5e0714' },
  light: { bg: '#e8e4da', fg: '#2a2a33', bd: '#6b665c' },
  dark:  { bg: '#1f2430', fg: '#e8e4da', bd: '#0d1016' },
  green: { bg: '#1f9d55', fg: '#ffffff', bd: '#0b4d27' },
};

// Deterministische "random" per tegel, zodat de vloer er elke keer hetzelfde uitziet.
function hash2(x, y, s = 0) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 982451653);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function isWallish(c) { return HIGH_TILES.has(c) || c === 'D' || c === 'X'; }

// Bordje met tekst (lokaalnummers, "AVANS HOGESCHOOL", enz.)
function drawPlate(g, text, cx, y, style = 'red', scale = 1) {
  if (style === 'floor') {
    PixelFont.draw(g, text, cx, y, { scale, align: 'center', color: 'rgba(200,16,46,0.3)' });
    return;
  }
  const S = SIGN_STYLES[style] || SIGN_STYLES.red;
  const w = PixelFont.width(text, scale) + 4, h = 5 * scale + 4;
  const x = Math.round(cx - w / 2);
  y = Math.round(y);
  g.fillStyle = S.bd; g.fillRect(x - 1, y - 1, w + 2, h + 2);
  g.fillStyle = S.bg; g.fillRect(x, y, w, h);
  PixelFont.draw(g, text, x + 2, y + 2, { scale, color: S.fg });
}

class World {
  constructor(def) {
    this.def = def;
    const width = Math.max(...def.map.map(r => r.length));
    this.tiles = def.map.map(r => r.padEnd(width, '#').split(''));
    this.w = width;
    this.h = this.tiles.length;
    this.pw = this.w * TILE;
    this.ph = this.h * TILE;
    this.theme = THEMES[def.theme];
    this.spawns = [];
    this.exits = [];
    this.start = { x: this.pw / 2, y: this.ph / 2 };
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const c = this.tiles[y][x];
        const cx = x * TILE + 8, cy = y * TILE + 8;
        if (c === 'p') { this.start = { x: cx, y: cy }; this.tiles[y][x] = '.'; }
        if (c === 'D' || c === 'S') this.spawns.push({ x: cx, y: cy });
        if (c === 'X') this.exits.push({ x, y });
      }
    }
    this.exitOpen = false;
    this.dist = new Int16Array(this.w * this.h);
    this.queue = new Int32Array(this.w * this.h);
    this.flowKey = -1;
    this.canvas = this.renderStatic();
  }

  tile(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return '#';
    return this.tiles[ty][tx];
  }

  // mode: 'player' | 'walker' (lopende vijand) | 'flyer' (zwevende vijand) | 'bullet'
  solid(tx, ty, mode) {
    const c = this.tile(tx, ty);
    if (HIGH_TILES.has(c)) return true;
    if (c === 'X') return !(mode === 'player' && this.exitOpen);
    if (c === 'D') return mode === 'player' || mode === 'bullet';
    if (LOW_TILES.has(c)) return mode === 'player' || mode === 'walker';
    return false;
  }

  boxHits(x0, y0, x1, y1, mode) {
    const tx0 = Math.floor(x0 / TILE), ty0 = Math.floor(y0 / TILE);
    const tx1 = Math.floor((x1 - 0.001) / TILE), ty1 = Math.floor((y1 - 0.001) / TILE);
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        if (this.solid(tx, ty, mode)) return true;
      }
    }
    return false;
  }

  // Beweeg een entiteit per as, zodat hij langs muren "glijdt".
  move(e, dx, dy, mode) {
    if (dx) {
      const nx = e.x + dx;
      if (!this.boxHits(nx - e.hw, e.y + e.fy0, nx + e.hw, e.y + e.fy1, mode)) e.x = nx;
    }
    if (dy) {
      const ny = e.y + dy;
      if (!this.boxHits(e.x - e.hw, ny + e.fy0, e.x + e.hw, ny + e.fy1, mode)) e.y = ny;
    }
  }

  touchesExit(e) {
    const x0 = Math.floor((e.x - e.hw - 2) / TILE), x1 = Math.floor((e.x + e.hw + 2) / TILE);
    const y0 = Math.floor((e.y + e.fy0 - 2) / TILE), y1 = Math.floor((e.y + e.fy1 + 2) / TILE);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (this.tile(x, y) === 'X') return true;
    return false;
  }

  // Zichtlijn (voor vijanden die terugschieten)
  los(x0, y0, x1, y1) {
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 6);
    for (let i = 1; i < n; i++) {
      const x = x0 + (x1 - x0) * i / n, y = y0 + (y1 - y0) * i / n;
      if (this.solid(Math.floor(x / TILE), Math.floor(y / TILE), 'bullet')) return false;
    }
    return true;
  }

  // ---------- Pathfinding: BFS vanaf de speler over de hele map ----------
  updateFlow(px, py) {
    const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return;
    const key = ty * this.w + tx;
    if (key === this.flowKey) return;
    this.flowKey = key;
    const d = this.dist, q = this.queue, w = this.w, h = this.h;
    d.fill(-1);
    let head = 0, tail = 0;
    d[key] = 0; q[tail++] = key;
    while (head < tail) {
      const k = q[head++], x = k % w, y = (k / w) | 0, nd = d[k] + 1;
      if (x > 0 && d[k - 1] < 0 && !this.solid(x - 1, y, 'walker')) { d[k - 1] = nd; q[tail++] = k - 1; }
      if (x < w - 1 && d[k + 1] < 0 && !this.solid(x + 1, y, 'walker')) { d[k + 1] = nd; q[tail++] = k + 1; }
      if (y > 0 && d[k - w] < 0 && !this.solid(x, y - 1, 'walker')) { d[k - w] = nd; q[tail++] = k - w; }
      if (y < h - 1 && d[k + w] < 0 && !this.solid(x, y + 1, 'walker')) { d[k + w] = nd; q[tail++] = k + w; }
    }
  }

  // Volgende tegel richting speler (of null = loop direct op de speler af)
  flowTarget(x, y) {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return null;
    const cur = this.dist[ty * this.w + tx];
    if (cur <= 1) return null;
    let best = null, bd = cur;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = tx + dx, ny = ty + dy;
        if (nx < 0 || ny < 0 || nx >= this.w || ny >= this.h) continue;
        const nd = this.dist[ny * this.w + nx];
        if (nd < 0 || nd >= bd) continue;
        if (dx && dy && (this.solid(tx + dx, ty, 'walker') || this.solid(tx, ty + dy, 'walker'))) continue;
        bd = nd; best = [nx, ny];
      }
    }
    return best ? { x: best[0] * TILE + 8, y: best[1] * TILE + 8 } : null;
  }

  exitCenter() {
    let x = 0, y = 0;
    for (const e of this.exits) { x += e.x * TILE + 8; y += e.y * TILE + 8; }
    return { x: x / this.exits.length, y: y / this.exits.length };
  }

  // ================= TEKENEN =================
  renderStatic() {
    const c = document.createElement('canvas');
    c.width = this.pw; c.height = this.ph;
    const g = c.getContext('2d');
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) this.drawTile(g, x, y);
    for (const s of this.def.signs || []) drawPlate(g, s.text, s.x * TILE, s.y * TILE, s.style, s.scale || 1);
    return c;
  }

  // Uitgang (verandert tijdens het spel, dus elke frame getekend)
  drawDynamic(g, t) {
    for (const e of this.exits) {
      const px = e.x * TILE, py = e.y * TILE;
      if (!this.exitOpen) {
        g.fillStyle = '#20160f'; g.fillRect(px + 1, py + 1, 14, 15);
        g.fillStyle = '#6a707c'; g.fillRect(px + 2, py + 2, 12, 14);
        g.fillStyle = '#868c99'; g.fillRect(px + 2, py + 2, 12, 1);
        g.fillStyle = '#4a4f5a'; g.fillRect(px + 7, py + 2, 2, 14);
        g.fillStyle = Math.floor(t * 2) % 2 ? '#ff3b3b' : '#8a1a1a'; g.fillRect(px + 7, py + 7, 2, 2);
      } else {
        g.fillStyle = '#07050b'; g.fillRect(px + 1, py + 1, 14, 15);
        g.fillStyle = `rgba(90,255,140,${0.25 + 0.2 * Math.sin(t * 6)})`; g.fillRect(px + 1, py + 1, 14, 15);
      }
    }
    if (this.exitOpen && this.exits.length) {
      const c = this.exitCenter();
      drawPlate(g, 'UIT', c.x, c.y - 18 + Math.round(Math.sin(t * 6) * 2), 'green');
    }
  }

  drawTile(g, x, y) {
    const c = this.tiles[y][x], px = x * TILE, py = y * TILE;
    switch (c) {
      case '#': case 'R': case 'X': this.drawWall(g, x, y, c); return;
      case 'D': this.drawWall(g, x, y, c); this.drawDoor(g, px, py); return;
      case 'W': this.drawWindow(g, x, y); return;
      case 'L': this.drawLockers(g, x, y); return;
      case 'S': this.drawStairs(g, px, py); return;
      case 'O': this.drawVoid(g, x, y); return;
    }
    this.drawFloor(g, x, y);
    switch (c) {
      case 'C': this.drawPillar(g, px, py); break;
      case 'V': this.drawVending(g, x, y); break;
      case 'T': this.drawTable(g, x, y); break;
      case 'B': this.drawDesk(g, x, y); break;
      case 'P': this.drawPlant(g, px, py); break;
      case 'K': this.drawCounter(g, x, y); break;
      case 'H': this.drawRailing(g, x, y); break;
      case 'N': this.drawBench(g, x, y); break;
    }
  }

  drawFloor(g, x, y) {
    const T = this.theme, px = x * TILE, py = y * TILE;
    g.fillStyle = T.floor; g.fillRect(px, py, 16, 16);
    switch (T.style) {
      case 'stone':
        if ((x + y) % 2) { g.fillStyle = T.floor2; g.fillRect(px, py, 16, 16); }
        g.fillStyle = T.line; g.fillRect(px, py, 16, 1); g.fillRect(px, py, 1, 16);
        break;
      case 'lino':
        g.fillStyle = T.line; if (y % 2 === 0) g.fillRect(px, py, 16, 1);
        break;
      case 'wood':
        g.fillStyle = T.line;
        for (let i = 0; i < 4; i++) {
          g.fillRect(px, py + i * 4 + 3, 16, 1);
          g.fillRect(px + ((hash2(x, y, i) * 15) | 0), py + i * 4, 1, 3);
        }
        break;
      case 'concrete':
        g.fillStyle = T.line; g.fillRect(px, py, 16, 1); g.fillRect(px, py, 1, 16);
        g.fillStyle = T.floor2; g.fillRect(px + 1, py + 8, 15, 1); g.fillRect(px + 8, py + 1, 1, 15);
        break;
      case 'carpet':
        g.fillStyle = T.floor2;
        for (let yy = 0; yy < 16; yy += 4) {
          for (let xx = ((yy / 4) % 2) * 2; xx < 16; xx += 4) g.fillRect(px + xx, py + yy, 1, 1);
        }
        break;
    }
    for (let i = 0; i < 3; i++) {
      const r = hash2(x, y, i + 20);
      if (r < 0.5) {
        g.fillStyle = r < 0.25 ? T.line : T.floor2;
        g.fillRect(px + ((hash2(x, y, i + 30) * 16) | 0), py + ((hash2(x, y, i + 40) * 16) | 0), 1, 1);
      }
    }
  }

  drawWall(g, x, y, c) {
    const T = this.theme, px = x * TILE, py = y * TILE;
    const face = !isWallish(this.tile(x, y + 1));
    g.fillStyle = T.wall; g.fillRect(px, py, 16, 16);
    g.fillStyle = T.wallHi;
    if (!isWallish(this.tile(x, y - 1))) g.fillRect(px, py, 16, 1);
    if (!isWallish(this.tile(x - 1, y))) g.fillRect(px, py, 1, 16);
    if (!isWallish(this.tile(x + 1, y))) g.fillRect(px + 15, py, 1, 16);
    if (hash2(x, y, 7) < 0.3) {
      g.fillRect(px + 4 + ((hash2(x, y, 8) * 8) | 0), py + 2 + ((hash2(x, y, 9) * 4) | 0), 2, 1);
    }
    if (face) {
      // voorkant van de muur (geeft diepte in top-down)
      g.fillStyle = T.face; g.fillRect(px, py + 8, 16, 8);
      g.fillStyle = T.faceHi; g.fillRect(px, py + 8, 16, 1);
      g.fillStyle = T.faceDark; g.fillRect(px, py + 14, 16, 2);
      if (c === 'R') {
        g.fillStyle = AVANS_RED; g.fillRect(px, py + 10, 16, 2);
        g.fillStyle = '#8f0b20'; g.fillRect(px, py + 12, 16, 1);
      }
    }
  }

  drawDoor(g, px, py) {
    g.fillStyle = '#20160f'; g.fillRect(px + 2, py + 1, 12, 15);
    g.fillStyle = '#8b5a32'; g.fillRect(px + 3, py + 2, 10, 14);
    g.fillStyle = '#a26c3e'; g.fillRect(px + 3, py + 2, 10, 1);
    g.fillStyle = '#6e4526'; g.fillRect(px + 8, py + 2, 1, 14);
    g.fillStyle = '#9fd3e8'; g.fillRect(px + 4, py + 4, 3, 4); g.fillRect(px + 9, py + 4, 3, 4);
    g.fillStyle = '#f2c14e'; g.fillRect(px + 6, py + 10, 1, 2); g.fillRect(px + 10, py + 10, 1, 2);
  }

  drawWindow(g, x, y) {
    const T = this.theme, px = x * TILE, py = y * TILE;
    const face = !isWallish(this.tile(x, y + 1));
    const top = face ? 4 : 0;
    if (face) { g.fillStyle = T.wall; g.fillRect(px, py, 16, 4); }
    g.fillStyle = '#26303d'; g.fillRect(px, py + top, 16, 16 - top);
    g.fillStyle = '#8cc8df'; g.fillRect(px + 1, py + top + 1, 14, 14 - top);
    g.fillStyle = '#c3e9f5';
    for (let i = 0; i < 5; i++) g.fillRect(px + 3 + i, py + top + 9 - i * 2, 1, 2);
    g.fillStyle = '#26303d'; g.fillRect(px + 8, py + top, 1, 16 - top);
  }

  drawLockers(g, x, y) {
    const T = this.theme, px = x * TILE, py = y * TILE;
    g.fillStyle = T.wall; g.fillRect(px, py, 16, 3);
    g.fillStyle = '#22324d'; g.fillRect(px, py + 3, 16, 13);
    const red = hash2(x, y, 5) < 0.15;
    g.fillStyle = red ? AVANS_RED : '#4f6f9f'; g.fillRect(px + 1, py + 4, 6, 11);
    g.fillStyle = '#4f6f9f'; g.fillRect(px + 9, py + 4, 6, 11);
    g.fillStyle = '#6d8fc2'; g.fillRect(px + 1, py + 4, 6, 1); g.fillRect(px + 9, py + 4, 6, 1);
    g.fillStyle = '#2f4566';
    for (const v of [6, 8]) { g.fillRect(px + 2, py + v, 4, 1); g.fillRect(px + 10, py + v, 4, 1); }
    g.fillStyle = '#d8dde6'; g.fillRect(px + 5, py + 11, 1, 2); g.fillRect(px + 13, py + 11, 1, 2);
  }

  drawStairs(g, px, py) {
    g.fillStyle = '#8d9099'; g.fillRect(px, py, 16, 16);
    for (let i = 0; i < 4; i++) {
      const yy = py + i * 4;
      g.fillStyle = '#e0b341'; g.fillRect(px, yy, 16, 1);
      g.fillStyle = '#b4b7bf'; g.fillRect(px, yy + 1, 16, 2);
      g.fillStyle = '#6c6f78'; g.fillRect(px, yy + 3, 16, 1);
    }
  }

  drawVoid(g, x, y) {
    const px = x * TILE, py = y * TILE;
    g.fillStyle = '#16131e'; g.fillRect(px, py, 16, 16);
    if ((x + y) % 2 === 0) { g.fillStyle = '#1e1a29'; g.fillRect(px + 1, py + 1, 14, 14); }
    if (hash2(x, y, 3) < 0.12) { g.fillStyle = '#3a3350'; g.fillRect(px + 7, py + 6, 2, 3); }
    g.fillStyle = 'rgba(0,0,0,0.45)';
    if (this.tile(x, y - 1) !== 'O') g.fillRect(px, py, 16, 6);
    if (this.tile(x - 1, y) !== 'O') g.fillRect(px, py, 4, 16);
  }

  drawPillar(g, px, py) {
    g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(px + 4, py + 12, 12, 4);
    g.fillStyle = K; g.fillRect(px + 2, py + 1, 12, 14);
    g.fillStyle = '#9aa0ad'; g.fillRect(px + 3, py + 2, 10, 12);
    g.fillStyle = '#c0c5cf'; g.fillRect(px + 3, py + 2, 3, 12);
    g.fillStyle = '#6f7584'; g.fillRect(px + 11, py + 2, 2, 12);
    g.fillStyle = '#b5bac5'; g.fillRect(px + 3, py + 2, 10, 2);
  }

  drawVending(g, x, y) {
    const px = x * TILE, py = y * TILE;
    g.fillStyle = K; g.fillRect(px + 1, py, 14, 16);
    g.fillStyle = hash2(x, y, 4) < 0.5 ? AVANS_RED : '#2f5fa8'; g.fillRect(px + 2, py + 1, 12, 14);
    g.fillStyle = '#1d2633'; g.fillRect(px + 3, py + 2, 7, 8);
    const cols = ['#ffd23f', '#4fc16a', '#f25f5c'];
    for (let i = 0; i < 6; i++) {
      g.fillStyle = cols[i % 3];
      g.fillRect(px + 4 + (i % 3) * 2, py + 3 + Math.floor(i / 3) * 3, 1, 2);
    }
    g.fillStyle = '#d8dde6'; g.fillRect(px + 11, py + 3, 2, 5);
    g.fillStyle = '#11151c'; g.fillRect(px + 3, py + 12, 7, 2);
  }

  drawTable(g, x, y) {
    const px = x * TILE, py = y * TILE;
    const L = this.tile(x - 1, y) === 'T', R = this.tile(x + 1, y) === 'T';
    const U = this.tile(x, y - 1) === 'T', D = this.tile(x, y + 1) === 'T';
    if (!U) { // stoel achter de tafel
      g.fillStyle = K; g.fillRect(px + 4, py, 8, 3);
      g.fillStyle = AVANS_RED; g.fillRect(px + 5, py, 6, 2);
    }
    const x0 = px + (L ? 0 : 1), x1 = px + (R ? 16 : 15), y0 = py + (U ? 0 : 2), y1 = py + (D ? 16 : 12);
    g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(x0 + 1, y0 + 2, x1 - x0, y1 - y0);
    g.fillStyle = '#6e655a'; g.fillRect(x0, y0, x1 - x0, y1 - y0);
    g.fillStyle = '#efe9de';
    g.fillRect(x0 + (L ? 0 : 1), y0 + (U ? 0 : 1), x1 - x0 - (L ? 0 : 1) - (R ? 0 : 1), y1 - y0 - (U ? 0 : 1) - (D ? 0 : 1));
    if (hash2(x, y, 11) < 0.3) { g.fillStyle = '#f4f4f4'; g.fillRect(px + 6, py + 5, 3, 3); g.fillStyle = AVANS_RED; g.fillRect(px + 6, py + 7, 3, 1); }
    if (!D) { // stoel voor de tafel
      g.fillStyle = K; g.fillRect(px + 4, py + 12, 8, 4);
      g.fillStyle = AVANS_RED; g.fillRect(px + 5, py + 13, 6, 2);
    }
  }

  drawDesk(g, x, y) {
    const px = x * TILE, py = y * TILE;
    const L = this.tile(x - 1, y) === 'B', R = this.tile(x + 1, y) === 'B';
    const x0 = px + (L ? 0 : 2), x1 = px + (R ? 16 : 14);
    g.fillStyle = K; g.fillRect(px + 5, py + 10, 6, 5);
    g.fillStyle = '#2f4f86'; g.fillRect(px + 6, py + 11, 4, 3);
    g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(x0 + 1, py + 4, x1 - x0, 7);
    g.fillStyle = '#6b4a2a'; g.fillRect(x0, py + 2, x1 - x0, 8);
    g.fillStyle = '#d8b27e'; g.fillRect(x0 + (L ? 0 : 1), py + 3, x1 - x0 - (L ? 0 : 1) - (R ? 0 : 1), 6);
    const r = hash2(x, y, 12);
    if (r < 0.4) {
      g.fillStyle = '#f4f4f4'; g.fillRect(px + 5, py + 4, 5, 4);
      g.fillStyle = '#9aa3ad'; g.fillRect(px + 6, py + 5, 3, 1);
    } else if (r < 0.7) {
      g.fillStyle = '#30343c'; g.fillRect(px + 4, py + 4, 7, 4);
      g.fillStyle = '#7fb3d5'; g.fillRect(px + 5, py + 5, 5, 2);
    }
  }

  drawPlant(g, px, py) {
    g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(px + 3, py + 13, 11, 3);
    g.fillStyle = K; g.fillRect(px + 4, py + 9, 8, 7);
    g.fillStyle = '#b5643a'; g.fillRect(px + 5, py + 10, 6, 5);
    g.fillStyle = '#d07a4a'; g.fillRect(px + 5, py + 10, 6, 1);
    g.fillStyle = '#1f6e35';
    g.fillRect(px + 3, py + 3, 10, 7); g.fillRect(px + 1, py + 5, 4, 3);
    g.fillRect(px + 11, py + 5, 4, 3); g.fillRect(px + 6, py, 4, 4);
    g.fillStyle = '#3fae5a';
    g.fillRect(px + 4, py + 3, 3, 3); g.fillRect(px + 9, py + 2, 3, 3);
    g.fillRect(px + 2, py + 6, 2, 2); g.fillRect(px + 7, py + 6, 3, 2);
    g.fillStyle = '#7fd68f'; g.fillRect(px + 5, py + 3, 1, 1); g.fillRect(px + 10, py + 2, 1, 1);
  }

  drawCounter(g, x, y) {
    const px = x * TILE, py = y * TILE;
    g.fillStyle = K; g.fillRect(px, py + 1, 16, 15);
    g.fillStyle = '#e6e6ea'; g.fillRect(px, py + 2, 16, 5);
    g.fillStyle = '#c9c9cf'; g.fillRect(px, py + 7, 16, 1);
    g.fillStyle = AVANS_RED; g.fillRect(px, py + 8, 16, 6);
    g.fillStyle = '#8f0b20'; g.fillRect(px, py + 14, 16, 1);
    g.fillStyle = K;
    if (this.tile(x - 1, y) !== 'K') g.fillRect(px, py + 1, 1, 15);
    if (this.tile(x + 1, y) !== 'K') g.fillRect(px + 15, py + 1, 1, 15);
    const r = hash2(x, y, 13);
    if (r < 0.25) { g.fillStyle = '#f4f4f4'; g.fillRect(px + 6, py + 3, 3, 3); g.fillStyle = '#6b3e26'; g.fillRect(px + 7, py + 3, 1, 1); }
    else if (r < 0.4) { g.fillStyle = '#e0b341'; g.fillRect(px + 4, py + 3, 6, 3); }
  }

  drawRailing(g, x, y) {
    const px = x * TILE, py = y * TILE;
    const hor = this.tile(x - 1, y) === 'H' || this.tile(x + 1, y) === 'H';
    const ver = this.tile(x, y - 1) === 'H' || this.tile(x, y + 1) === 'H';
    if (hor || !ver) {
      g.fillStyle = 'rgba(150,210,235,0.55)'; g.fillRect(px, py + 6, 16, 5);
      g.fillStyle = '#d0d5dd'; g.fillRect(px, py + 5, 16, 2);
      g.fillStyle = '#5c626e'; g.fillRect(px, py + 11, 16, 1);
      g.fillStyle = '#8a909c'; g.fillRect(px + 1, py + 5, 2, 7);
    }
    if (ver) {
      g.fillStyle = 'rgba(150,210,235,0.55)'; g.fillRect(px + 6, py, 5, 16);
      g.fillStyle = '#d0d5dd'; g.fillRect(px + 5, py, 2, 16);
      g.fillStyle = '#5c626e'; g.fillRect(px + 11, py, 1, 16);
    }
  }

  drawBench(g, x, y) {
    const px = x * TILE, py = y * TILE;
    const L = this.tile(x - 1, y) === 'N', R = this.tile(x + 1, y) === 'N';
    g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(px, py + 11, 16, 3);
    g.fillStyle = K; g.fillRect(px + 2, py + 10, 2, 4); g.fillRect(px + 12, py + 10, 2, 4);
    g.fillRect(px, py + 5, 16, 6);
    g.fillStyle = '#b07a3e';
    g.fillRect(px + (L ? 0 : 1), py + 6, 16 - (L ? 0 : 1) - (R ? 0 : 1), 4);
    g.fillStyle = '#8a5a2a'; g.fillRect(px + (L ? 0 : 1), py + 8, 16 - (L ? 0 : 1) - (R ? 0 : 1), 1);
  }
}
