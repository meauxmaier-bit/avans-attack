'use strict';
/* Main: game-states (menu, spelen, pauze, game over, gewonnen), golven/levels en de gameloop. */
const VIEW_W = 480, VIEW_H = 270;
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const HS_KEY = 'avansAttackHighscore';
function loadHigh() {
  try { return Number(localStorage.getItem(HS_KEY)) || 0; } catch (e) { return 0; }
}

const Game = {
  state: 'menu',
  t: 0,
  highscore: loadHigh(),
  newHigh: false,
  score: 0, combo: 0, comboT: 0,
  player: null, world: null, level: null, levelIndex: 0,
  enemies: [], bullets: [], enemyBullets: [], pickups: [],
  camera: { x: 0, y: 0 }, shake: 0, damageFlash: 0,
  bannerData: null, fadeIn: 0, transition: 0, deathT: 0, victoryT: 0, levelTime: 0,
  waveIndex: -1, waveActive: false, nextWaveT: 0, spawnQueue: [], spawnT: 0,
  levelKills: 0, levelTotal: 0, levelDone: false, boss: null,
  menuWorld: null, muteMsg: '', muteMsgT: 0,

  // ---------------- Spel starten / levels ----------------
  start() {
    this.score = 0; this.combo = 0; this.comboT = 0; this.newHigh = false;
    this.player = new Player(0, 0);
    this.loadLevel(0);
    this.state = 'playing';
  },

  loadLevel(i) {
    this.levelIndex = i;
    this.level = LEVELS[i];
    this.world = new World(this.level);
    const p = this.player;
    p.x = this.world.start.x; p.y = this.world.start.y - 4;
    p.kx = p.ky = 0;
    this.enemies = []; this.bullets = []; this.enemyBullets = []; this.pickups = [];
    Effects.clear();
    this.waveIndex = -1; this.waveActive = false; this.nextWaveT = 2.8;
    this.spawnQueue = []; this.levelDone = false; this.boss = null;
    this.levelKills = 0;
    this.levelTotal = this.level.waves.reduce((n, w) => n + Object.values(w).reduce((a, b) => a + b, 0), 0);
    this.levelTime = 0; this.deathT = 0; this.victoryT = 0; this.transition = 0;
    this.fadeIn = 0.5;
    this.updateCamera(0, true);
    this.banner(`LEVEL ${i + 1}: ${this.level.name}`, this.level.sub, 2.6);
  },

  banner(title, sub = '', dur = 2, color) {
    this.bannerData = { title, sub, t: dur, dur, color };
  },

  addShake(a) { this.shake = Math.min(12, this.shake + a); },

  comboMult() { return 1 + Math.min(3, Math.floor(this.combo / 5)); },

  mouseWorld() {
    return { x: Input.mouse.x + Math.round(this.camera.x), y: Input.mouse.y + Math.round(this.camera.y) };
  },

  // ---------------- Golven ----------------
  startWave(i) {
    this.waveIndex = i;
    this.waveActive = true;
    const def = this.level.waves[i];
    const q = [];
    for (const type in def) for (let n = 0; n < def[type]; n++) q.push(type);
    shuffle(q);
    const bi = q.indexOf('boss');
    if (bi > 0) { q.splice(bi, 1); q.unshift('boss'); }
    this.spawnQueue = q;
    this.spawnT = 0.6;
    if (bi < 0) this.banner(`GOLF ${i + 1}/${this.level.waves.length}`, '', 1.6);
  },

  updateWaves(dt) {
    if (this.levelDone) return;
    if (!this.waveActive) {
      this.nextWaveT -= dt;
      if (this.nextWaveT <= 0) this.startWave(this.waveIndex + 1);
      return;
    }
    this.spawnT -= dt;
    const alive = this.enemies.reduce((n, e) => n + (e.dead ? 0 : 1), 0);
    if (this.spawnQueue.length && this.spawnT <= 0 && alive < this.level.maxAlive) {
      this.spawnEnemy(this.spawnQueue.shift());
      this.spawnT = this.level.spawnInterval * (0.6 + Math.random() * 0.8);
    }
    if (!this.spawnQueue.length && alive === 0) {
      this.waveActive = false;
      if (this.waveIndex >= this.level.waves.length - 1) {
        this.completeLevel();
      } else {
        const bonus = 50 * (this.levelIndex + 1);
        this.score += bonus;
        this.banner('GOLF VOLTOOID!', `BONUS +${bonus}`, 1.8, '#4fc16a');
        Sound.wave();
        this.nextWaveT = 2.6;
      }
    }
  },

  spawnEnemy(type, summoned = false) {
    const T = ENEMY_TYPES[type];
    let x, y;
    if (type === 'boss') {
      x = this.level.boss.x * TILE + 8;
      y = this.level.boss.y * TILE + 8;
      this.banner('EINDBAAS!', 'DE TENTAMENCOMMISSIE', 2.4, '#ff4d5e');
      Sound.boss();
      this.addShake(8);
    } else {
      // spawn bij een deur/trap die niet te dichtbij de speler is
      const p = this.player;
      let cands = this.world.spawns.filter(s => Math.hypot(s.x - p.x, s.y - p.y) > 110);
      if (!cands.length) cands = this.world.spawns;
      const s = cands[Math.floor(Math.random() * cands.length)];
      x = s.x;
      y = s.y - (T.fy0 + T.fy1) / 2;
    }
    const e = new Enemy(type, x, y, this.level);
    e.summoned = summoned;
    this.enemies.push(e);
    if (type === 'boss') this.boss = e;
    Effects.burst(x, y, ['#ffffff', '#bbbbbb'], 8, 40, 0.4, 1);
    Sound.spawn();
    return e;
  },

  completeLevel() {
    this.levelDone = true;
    if (this.levelIndex >= LEVELS.length - 1) {
      this.victoryT = 3;
      this.banner('GESLAAGD!', 'DE TENTAMENCOMMISSIE IS VERSLAGEN', 3, '#ffd166');
      Sound.victory();
      return;
    }
    const p = this.player;
    p.hp = Math.min(p.maxHp, p.hp + 30);
    this.world.exitOpen = true;
    this.banner('LEVEL VOLTOOID!', '+30 HP  -  LOOP NAAR DE GROENE UITGANG', 3, '#4fc16a');
    Sound.levelUp();
  },

  // ---------------- Gebeurtenissen ----------------
  onEnemyKilled(e) {
    this.combo++;
    this.comboT = 2;
    const pts = e.T.score * this.comboMult();
    this.score += pts;
    if (!e.summoned) this.levelKills++;
    Effects.text(e.x, e.y - 10, `+${pts}`, this.comboMult() > 1 ? '#ffd166' : '#ffffff');
    Effects.burst(e.x, e.y, e.T.colors, 14, 90, 0.5, 2);
    Sound.kill();
    this.addShake(1.5);

    if (e.type === 'boss') {
      for (const o of this.enemies) {
        if (!o.dead && o !== e) { o.dead = true; Effects.burst(o.x, o.y, o.T.colors, 8, 60, 0.4, 1); }
      }
      this.spawnQueue.length = 0;
      this.enemyBullets.length = 0;
      this.levelKills = this.levelTotal;
      for (let i = 0; i < 5; i++) Effects.burst(e.x + (Math.random() - 0.5) * 30, e.y + (Math.random() - 0.5) * 30, e.T.colors, 16, 140, 0.9, 2);
      this.addShake(14);
      Sound.bossDeath();
      return;
    }
    // kans op een pickup
    const r = Math.random();
    const coffeeChance = e.type === 'deadline' ? 0.2 : 0.06;
    if (r < coffeeChance) this.pickups.push(new Pickup(e.x, e.y, 'coffee'));
    else if (r < coffeeChance + 0.035) this.pickups.push(new Pickup(e.x, e.y, 'energy'));
  },

  collect(pk) {
    const p = this.player;
    pk.dead = true;
    if (pk.type === 'coffee') {
      p.hp = Math.min(p.maxHp, p.hp + 25);
      Effects.text(p.x, p.y - 14, '+25 HP', '#4fc16a');
    } else {
      p.rapid = 6;
      Effects.text(p.x, p.y - 14, 'TURBO!', '#ffd23f');
    }
    Sound.pickup();
  },

  onPlayerDeath() {
    this.deathT = 1.6;
    const p = this.player;
    Effects.burst(p.x, p.y, ['#d42a3c', '#f0c09a', '#2f4f86', '#ffffff'], 30, 120, 0.9, 2);
    this.addShake(10);
  },

  endGame(won) {
    this.state = won ? 'victory' : 'gameover';
    if (this.score > this.highscore) {
      this.highscore = this.score;
      this.newHigh = true;
      try { localStorage.setItem(HS_KEY, String(this.score)); } catch (e) { /* ok */ }
    }
    if (!won) Sound.gameOver();
  },

  separateEnemies() {
    const es = this.enemies;
    for (let i = 0; i < es.length; i++) {
      const a = es[i];
      if (a.dead || a.type === 'boss') continue;
      for (let j = i + 1; j < es.length; j++) {
        const b = es[j];
        if (b.dead || b.type === 'boss') continue;
        const dx = b.x - a.x, dy = b.y - a.y, min = (a.r + b.r) * 0.75;
        const d2 = dx * dx + dy * dy;
        if (d2 < min * min && d2 > 0.0001) {
          const d = Math.sqrt(d2), push = (min - d) / 2, nx = dx / d, ny = dy / d;
          this.world.move(a, -nx * push, -ny * push, a.mode);
          this.world.move(b, nx * push, ny * push, b.mode);
        }
      }
    }
  },

  updateCamera(dt, snap = false) {
    const p = this.player, w = this.world, m = Input.mouse;
    let tx = p.x + (m.x - VIEW_W / 2) * 0.18 - VIEW_W / 2;
    let ty = p.y + (m.y - VIEW_H / 2) * 0.18 - VIEW_H / 2;
    tx = w.pw <= VIEW_W ? (w.pw - VIEW_W) / 2 : clamp(tx, 0, w.pw - VIEW_W);
    ty = w.ph + 21 <= VIEW_H ? (w.ph - VIEW_H) / 2 - 10 : clamp(ty, -21, w.ph - VIEW_H);
    if (snap) { this.camera.x = tx; this.camera.y = ty; return; }
    const k = Math.min(1, dt * 8);
    this.camera.x += (tx - this.camera.x) * k;
    this.camera.y += (ty - this.camera.y) * k;
  },

  // ---------------- Update ----------------
  update(dt) {
    this.t += dt;
    if (Input.wasPressed('KeyM')) {
      this.muteMsg = Sound.toggleMute() ? 'GELUID UIT' : 'GELUID AAN';
      this.muteMsgT = 1.5;
    }
    if (this.muteMsgT > 0) this.muteMsgT -= dt;
    Sound.setMusic(this.state === 'playing' || this.state === 'menu');

    switch (this.state) {
      case 'menu':
        if (Input.wasPressed('Enter', 'Space')) this.start();
        break;
      case 'playing':
        this.updatePlaying(dt);
        break;
      case 'paused':
        if (Input.wasPressed('KeyP', 'Escape')) this.state = 'playing';
        break;
      case 'gameover':
      case 'victory':
        if (Input.wasPressed('Enter')) this.start();
        break;
    }
  },

  updatePlaying(dt) {
    if (Input.wasPressed('KeyP', 'Escape')) { this.state = 'paused'; return; }
    const p = this.player;

    if (this.transition > 0) { // overgang naar volgend level
      this.transition -= dt;
      if (this.transition <= 0) this.loadLevel(this.levelIndex + 1);
      return;
    }
    this.levelTime += dt;
    if (this.fadeIn > 0) this.fadeIn -= dt;
    if (this.damageFlash > 0) this.damageFlash -= dt;
    this.shake = Math.max(0, this.shake - dt * 25);
    if (this.bannerData) {
      this.bannerData.t -= dt;
      if (this.bannerData.t <= 0) this.bannerData = null;
    }

    p.update(dt, this.world, this.mouseWorld());
    this.world.updateFlow(p.x, p.y + 4);
    this.updateWaves(dt);

    for (const e of this.enemies) if (!e.dead) e.update(dt, this.world, p);
    this.separateEnemies();

    // aanraken = schade
    if (!p.dead) {
      for (const e of this.enemies) {
        if (e.dead || e.age < 0.35) continue;
        if (Math.hypot(e.x - p.x, e.y - p.y) < e.r + p.r) p.hurt(e.T.dmg, e.x, e.y);
      }
    }
    // kogels van de speler
    for (const b of this.bullets) {
      b.update(dt, this.world);
      if (b.dead) continue;
      for (const e of this.enemies) {
        if (e.dead) continue;
        const dx = b.x - e.x, dy = b.y - e.y, rr = e.r + 2;
        if (dx * dx + dy * dy < rr * rr) {
          e.hit(b.dmg, b.vx, b.vy);
          Effects.sparks(b.x, b.y, '#ffb347');
          b.dead = true;
          break;
        }
      }
    }
    // kogels van vijanden
    for (const b of this.enemyBullets) {
      b.update(dt, this.world);
      if (b.dead || p.dead) continue;
      const dx = b.x - p.x, dy = b.y - p.y, rr = p.r + 1;
      if (dx * dx + dy * dy < rr * rr) {
        p.hurt(b.dmg, b.x - b.vx * 0.1, b.y - b.vy * 0.1);
        b.dead = true;
      }
    }
    for (const pk of this.pickups) {
      pk.update(dt);
      if (!pk.dead && !p.dead && Math.hypot(pk.x - p.x, pk.y - p.y) < 13) this.collect(pk);
    }
    Effects.update(dt);
    this.bullets = this.bullets.filter(b => !b.dead);
    this.enemyBullets = this.enemyBullets.filter(b => !b.dead);
    this.enemies = this.enemies.filter(e => !e.dead);
    this.pickups = this.pickups.filter(pk => !pk.dead);

    if (this.comboT > 0) {
      this.comboT -= dt;
      if (this.comboT <= 0) this.combo = 0;
    }
    this.updateCamera(dt);

    if (this.world.exitOpen && !p.dead && this.world.touchesExit(p)) {
      this.transition = 0.6;
      Sound.door();
    }
    if (p.dead) {
      this.deathT -= dt;
      if (this.deathT <= 0) this.endGame(false);
    }
    if (this.victoryT > 0) {
      this.victoryT -= dt;
      if (this.victoryT <= 0) this.endGame(true);
    }
  },

  // ---------------- Render ----------------
  render() {
    const g = ctx;
    if (this.state === 'menu') {
      UI.drawMenu(g, this.t);
    } else {
      this.renderScene(g);
      if (this.state === 'paused') UI.drawPause(g);
      else if (this.state === 'gameover') UI.drawGameOver(g, this.t);
      else if (this.state === 'victory') UI.drawVictory(g, this.t);
    }
    if (this.muteMsgT > 0) PixelFont.draw(g, this.muteMsg, VIEW_W - 4, VIEW_H - 8, { align: 'right', color: '#ffffff', shadow: K });
    UI.drawCrosshair(g);
  },

  renderScene(g) {
    const w = this.world, p = this.player;
    const sh = this.state === 'playing' ? this.shake : 0;
    const cx = Math.round(this.camera.x + (sh ? (Math.random() - 0.5) * sh : 0));
    const cy = Math.round(this.camera.y + (sh ? (Math.random() - 0.5) * sh : 0));

    g.fillStyle = '#0b0710'; g.fillRect(0, 0, VIEW_W, VIEW_H);
    g.save();
    g.translate(-cx, -cy);
    g.drawImage(w.canvas, 0, 0);
    w.drawDynamic(g, this.t);

    const actors = [...this.pickups, ...this.enemies.filter(e => !e.dead)];
    if (!p.dead) actors.push(p);
    for (const a of actors) a.drawShadow(g);
    actors.sort((a, b) => a.sortY - b.sortY);
    for (const a of actors) a.draw(g);
    for (const b of this.bullets) b.draw(g);
    for (const b of this.enemyBullets) b.draw(g);
    Effects.draw(g);
    g.restore();

    UI.drawIndicators(g, cx, cy, this.t);
    UI.drawVignette(g, this.t);
    UI.drawHUD(g);
    UI.drawBanner(g);

    let fade = 0;
    if (this.fadeIn > 0) fade = this.fadeIn / 0.5;
    if (this.transition > 0) fade = 1 - this.transition / 0.6;
    if (fade > 0) { g.fillStyle = `rgba(0,0,0,${clamp(fade, 0, 1)})`; g.fillRect(0, 0, VIEW_W, VIEW_H); }
  },
};

// ---------------- Schalen naar venstergrootte ----------------
function resize() {
  const s = Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H);
  canvas.style.width = Math.floor(VIEW_W * s) + 'px';
  canvas.style.height = Math.floor(VIEW_H * s) + 'px';
}
window.addEventListener('resize', resize);
resize();

// ---------------- Gameloop (vaste tijdstap 60x per seconde) ----------------
Input.init(canvas);
const STEP = 1 / 60;
let last = performance.now(), acc = 0;
function frame(now) {
  acc += Math.min(0.25, (now - last) / 1000);
  last = now;
  let steps = 0;
  while (acc >= STEP && steps < 5) {
    Game.update(STEP);
    acc -= STEP;
    steps++;
  }
  if (steps === 5) acc = 0;
  Game.render();
  if (steps > 0) Input.endFrame();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
