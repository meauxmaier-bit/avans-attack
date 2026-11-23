'use strict';
/* UI: startmenu, HUD (healthbar, score, levelvoortgang), banners en eindschermen. */
const UI = {
  // Knop tekenen; geeft true terug als erop geklikt is.
  button(g, x, y, w, h, label, scale = 2) {
    const m = Input.mouse;
    const hover = m.x >= x && m.x < x + w && m.y >= y && m.y < y + h;
    g.fillStyle = K; g.fillRect(x - 1, y - 1, w + 2, h + 2);
    g.fillStyle = hover ? '#ef3b55' : AVANS_RED; g.fillRect(x, y, w, h);
    g.fillStyle = hover ? '#ff8a9a' : '#e5485e'; g.fillRect(x, y, w, 2);
    g.fillStyle = '#7a0a1c'; g.fillRect(x, y + h - 3, w, 3);
    PixelFont.draw(g, label, x + w / 2, y + Math.round((h - 3 - 5 * scale) / 2) + 1, { scale, align: 'center', color: '#ffffff', shadow: '#5e0714' });
    if (hover && Input.consumeClick()) { Sound.click(); return true; }
    return false;
  },

  bar(g, x, y, w, h, ratio, color) {
    g.fillStyle = K; g.fillRect(x - 1, y - 1, w + 2, h + 2);
    g.fillStyle = '#2a1a2e'; g.fillRect(x, y, w, h);
    const fw = Math.round(w * clamp(ratio, 0, 1));
    g.fillStyle = color; g.fillRect(x, y, fw, h);
    g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(x, y, fw, 1);
  },

  overlay(g, color) { g.fillStyle = color; g.fillRect(0, 0, VIEW_W, VIEW_H); },

  // ---------------- STARTMENU ----------------
  drawMenu(g, t) {
    if (!Game.menuWorld) Game.menuWorld = new World(LEVELS[0]);
    const w = Game.menuWorld;
    const cx = Math.round((Math.sin(t * 0.12) * 0.5 + 0.5) * (w.pw - VIEW_W));
    const cy = Math.round((Math.cos(t * 0.09) * 0.5 + 0.5) * Math.max(0, w.ph - VIEW_H));
    this.overlay(g, '#0b0710');
    g.drawImage(w.canvas, -cx, -cy);
    this.overlay(g, 'rgba(11,7,16,0.72)');

    const bob = Math.round(Math.sin(t * 2) * 2);
    PixelFont.draw(g, 'AVANS ATTACK', VIEW_W / 2, 22 + bob, { scale: 5, color: AVANS_RED, align: 'center', shadow: '#3a0410', outline: '#f4f1e8' });
    PixelFont.draw(g, 'HOGESCHOOLLAAN BREDA', VIEW_W / 2, 56, { scale: 2, color: '#f4f1e8', align: 'center', shadow: K });
    PixelFont.draw(g, 'OVERLEEF DE DEADLINES, BUGS EN DE TENTAMENCOMMISSIE', VIEW_W / 2, 74, { color: '#ffd166', align: 'center', shadow: K });

    // Speler die schiet (links)
    const pf = Sprites.player.walk[Math.floor(t * 8) % 4];
    g.drawImage(pf, 40, 112, 36, 48);
    g.drawImage(Sprites.gun, 55, 133, 33, 18);
    const shotPhase = (t * 3) % 1;
    if (shotPhase < 0.12) { g.fillStyle = '#ffd166'; g.fillRect(88, 136, 9, 9); g.fillStyle = '#fff'; g.fillRect(90, 138, 5, 5); }
    for (let i = 0; i < 3; i++) {
      const bx = 96 + ((t * 220 + i * 95) % 285);
      g.fillStyle = '#ff9f1c'; g.fillRect(Math.round(bx), 139, 5, 5);
      g.fillStyle = '#fff3b0'; g.fillRect(Math.round(bx) + 1, 140, 3, 3);
    }
    // Vijanden (rechts)
    const zf = Sprites.zombie.walk[Math.floor(t * 6) % 4];
    g.save(); g.translate(440, 112); g.scale(-1, 1); g.drawImage(zf, 0, 0, 36, 48); g.restore();
    const bf = Sprites.bug[Math.floor(t * 12) % 2];
    g.save(); g.translate(396, 146); g.scale(-1, 1); g.drawImage(bf, 0, 0, 24, 18); g.restore();
    g.drawImage(Sprites.deadline[Math.floor(t * 4) % 2], 398, 92 + Math.round(Math.sin(t * 3) * 3), 32, 32);

    if (this.button(g, 180, 104, 120, 30, 'PLAY', 3)) Game.start();

    g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(110, 172, 260, 42);
    const lines = ['PIJLTJES / WASD : LOPEN', 'MUIS : RICHTEN    KLIK : SCHIETEN', 'P : PAUZE    M : GELUID AAN/UIT'];
    lines.forEach((l, i) => PixelFont.draw(g, l, VIEW_W / 2, 177 + i * 12, { align: 'center', color: '#e8e4da' }));

    PixelFont.draw(g, `HIGHSCORE: ${String(Game.highscore).padStart(6, '0')}`, VIEW_W / 2, 224, { scale: 2, align: 'center', color: '#ffd166', shadow: K });
    if (Math.floor(t * 2) % 2) PixelFont.draw(g, 'DRUK OP ENTER OF KLIK OP PLAY', VIEW_W / 2, 248, { align: 'center', color: '#9a93a8' });
  },

  // ---------------- HUD ----------------
  drawHUD(g) {
    const p = Game.player, L = Game.level;
    g.fillStyle = 'rgba(14,9,22,0.85)'; g.fillRect(0, 0, VIEW_W, 20);
    g.fillStyle = AVANS_RED; g.fillRect(0, 20, VIEW_W, 1);

    // healthbar
    PixelFont.draw(g, 'HEALTH', 15, 1, { color: '#9a93a8' });
    g.drawImage(Sprites.heart, 5, 8);
    const ratio = p.hp / p.maxHp;
    const col = ratio > 0.6 ? '#4fc16a' : ratio > 0.3 ? '#ffd23f' : '#ff4d5e';
    this.bar(g, 15, 8, 70, 7, ratio, col);
    PixelFont.draw(g, String(Math.ceil(p.hp)), 89, 9, { color: '#ffffff' });

    // level + voortgang
    PixelFont.draw(g, `LEVEL ${Game.levelIndex + 1}/${LEVELS.length}  ${L.name}`, VIEW_W / 2, 2, { align: 'center', color: '#ffffff' });
    const prog = Game.levelTotal ? Game.levelKills / Game.levelTotal : 0;
    this.bar(g, VIEW_W / 2 - 60, 10, 120, 6, prog, '#ffd166');
    PixelFont.draw(g, `${Math.round(prog * 100)}%`, VIEW_W / 2 - 65, 11, { align: 'right', color: '#9a93a8' });
    const waveTxt = Game.levelDone ? 'KLAAR!' : `GOLF ${Math.max(1, Game.waveIndex + 1)}/${L.waves.length}`;
    PixelFont.draw(g, waveTxt, VIEW_W / 2 + 65, 11, { color: '#9a93a8' });

    // score
    PixelFont.draw(g, 'SCORE', VIEW_W - 4, 1, { align: 'right', color: '#9a93a8' });
    PixelFont.draw(g, String(Game.score).padStart(6, '0'), VIEW_W - 4, 8, { align: 'right', color: '#ffffff', scale: 2 });
    const m = Game.comboMult();
    if (m > 1) PixelFont.draw(g, `COMBO X${m}`, VIEW_W - 4, 25, { align: 'right', color: '#ffd166', shadow: K });

    // turbo (energydrink)
    if (p.rapid > 0) {
      PixelFont.draw(g, 'TURBO', 5, 25, { color: '#ffd23f', shadow: K });
      this.bar(g, 27, 25, 40, 5, p.rapid / 6, '#ffd23f');
    }

    // eindbaas
    const b = Game.boss;
    if (b && !b.dead) {
      PixelFont.draw(g, 'DE TENTAMENCOMMISSIE', VIEW_W / 2, VIEW_H - 19, { align: 'center', color: '#ffffff', shadow: K });
      this.bar(g, VIEW_W / 2 - 100, VIEW_H - 11, 200, 6, b.hp / b.maxHp, '#d4202c');
    }

    PixelFont.draw(g, 'P: PAUZE  M: GELUID', 4, VIEW_H - 8, { color: 'rgba(255,255,255,0.35)' });

    // tips in level 1
    if (Game.levelIndex === 0 && !Game.levelDone) {
      let tip = '';
      if (Game.levelTime < 10) tip = 'TIP: HOUD DE MUISKNOP INGEDRUKT OM DOOR TE SCHIETEN';
      else if (Game.levelTime < 20) tip = 'TIP: KOFFIE = +25 HP   ENERGYDRINK = SNELLER SCHIETEN';
      if (tip) PixelFont.draw(g, tip, VIEW_W / 2, VIEW_H - 30, { align: 'center', color: '#ffffff', shadow: K });
    }
  },

  drawBanner(g) {
    const b = Game.bannerData;
    if (!b) return;
    const a = Math.min(1, (b.dur - b.t) / 0.25, b.t / 0.35);
    const h = b.sub ? 46 : 34;
    g.save();
    g.globalAlpha = clamp(a, 0, 1);
    g.fillStyle = 'rgba(11,7,16,0.78)'; g.fillRect(0, 100, VIEW_W, h);
    g.fillStyle = AVANS_RED; g.fillRect(0, 100, VIEW_W, 2); g.fillRect(0, 100 + h - 2, VIEW_W, 2);
    PixelFont.draw(g, b.title, VIEW_W / 2, 109, { scale: 3, align: 'center', color: b.color || '#ffffff', shadow: K });
    if (b.sub) PixelFont.draw(g, b.sub, VIEW_W / 2, 132, { align: 'center', color: '#ffd166' });
    g.restore();
  },

  // Pijltjes aan de rand van het scherm voor vijanden/uitgang buiten beeld
  drawIndicators(g, cx, cy, t) {
    for (const e of Game.enemies) {
      if (e.dead) continue;
      const sx = e.x - cx, sy = e.y - cy;
      if (sx >= 0 && sx <= VIEW_W && sy >= 21 && sy <= VIEW_H) continue;
      const x = Math.round(clamp(sx, 3, VIEW_W - 7)), y = Math.round(clamp(sy, 24, VIEW_H - 7));
      g.fillStyle = K; g.fillRect(x - 1, y - 1, 5, 5);
      g.fillStyle = e.type === 'boss' ? '#ff4df0' : '#ff3b4f'; g.fillRect(x, y, 3, 3);
    }
    const w = Game.world;
    if (w.exitOpen && w.exits.length) {
      const c = w.exitCenter();
      const sx = c.x - cx, sy = c.y - cy;
      if (sx < 0 || sx > VIEW_W || sy < 21 || sy > VIEW_H) {
        const x = clamp(sx, 14, VIEW_W - 14), y = clamp(sy, 30, VIEW_H - 14);
        if (Math.floor(t * 4) % 2) drawPlate(g, 'UIT', x, y - 4, 'green');
      }
    }
  },

  drawVignette(g, t) {
    let a = 0;
    if (Game.damageFlash > 0) a = Game.damageFlash * 1.6;
    const p = Game.player;
    if (p && !p.dead && p.hp <= 30 && Game.state === 'playing') a = Math.max(a, 0.18 + 0.12 * Math.sin(t * 6));
    if (a <= 0) return;
    g.fillStyle = `rgba(220,20,40,${Math.min(0.6, a)})`;
    const s = 8;
    g.fillRect(0, 0, VIEW_W, s); g.fillRect(0, VIEW_H - s, VIEW_W, s);
    g.fillRect(0, 0, s, VIEW_H); g.fillRect(VIEW_W - s, 0, s, VIEW_H);
  },

  // ---------------- PAUZE / GAME OVER / GEWONNEN ----------------
  drawPause(g) {
    this.overlay(g, 'rgba(11,7,16,0.7)');
    PixelFont.draw(g, 'PAUZE', VIEW_W / 2, 70, { scale: 6, align: 'center', color: '#ffffff', shadow: AVANS_RED });
    if (this.button(g, VIEW_W / 2 - 60, 120, 120, 26, 'VERDER')) Game.state = 'playing';
    if (this.button(g, VIEW_W / 2 - 60, 156, 120, 26, 'MENU')) Game.state = 'menu';
    PixelFont.draw(g, 'DRUK OP P OM VERDER TE SPELEN', VIEW_W / 2, 200, { align: 'center', color: '#9a93a8' });
  },

  drawStats(g, y, t) {
    PixelFont.draw(g, `SCORE: ${Game.score}`, VIEW_W / 2, y, { scale: 2, align: 'center', color: '#ffffff', shadow: K });
    const hs = `HIGHSCORE: ${Game.highscore}`;
    PixelFont.draw(g, hs, VIEW_W / 2, y + 16, { align: 'center', color: '#ffd166', shadow: K });
    if (Game.newHigh && Math.floor(t * 3) % 2) {
      PixelFont.draw(g, 'NIEUW!', VIEW_W / 2 + PixelFont.width(hs) / 2 + 6, y + 16, { color: '#4fc16a', shadow: K });
    }
  },

  endButtons(g) {
    if (this.button(g, VIEW_W / 2 - 115, 196, 150, 26, 'OPNIEUW SPELEN')) Game.start();
    if (this.button(g, VIEW_W / 2 + 45, 196, 70, 26, 'MENU')) Game.state = 'menu';
    PixelFont.draw(g, 'OF DRUK OP ENTER', VIEW_W / 2, 232, { align: 'center', color: '#9a93a8' });
  },

  drawGameOver(g, t) {
    this.overlay(g, 'rgba(40,0,10,0.8)');
    PixelFont.draw(g, 'GAME OVER', VIEW_W / 2, 36, { scale: 6, align: 'center', color: '#ff3b4f', shadow: '#3a0410', outline: K });
    PixelFont.draw(g, 'DE DEADLINES HEBBEN GEWONNEN...', VIEW_W / 2, 78, { align: 'center', color: '#f4f1e8' });
    PixelFont.draw(g, `BEREIKT: LEVEL ${Game.levelIndex + 1} - ${Game.level.name}`, VIEW_W / 2, 96, { align: 'center', color: '#9a93a8' });
    this.drawStats(g, 124, t);
    this.endButtons(g);
  },

  drawVictory(g, t) {
    this.overlay(g, 'rgba(8,24,14,0.82)');
    const colors = ['#ffd166', AVANS_RED, '#4fc16a', '#7fb3d5', '#ffffff'];
    for (let i = 0; i < 70; i++) { // confetti
      const x = (i * 53 + t * 30 * ((i % 3) + 1)) % VIEW_W;
      const y = (i * 97 + t * 45 * ((i % 4) + 1)) % VIEW_H;
      g.fillStyle = colors[i % colors.length];
      g.fillRect(Math.round(x), Math.round(y), 2, 2);
    }
    PixelFont.draw(g, 'GESLAAGD!', VIEW_W / 2, 30, { scale: 6, align: 'center', color: '#ffd166', shadow: '#5a3a00', outline: K });
    PixelFont.draw(g, 'JE HEBT DE TENTAMENCOMMISSIE VERSLAGEN', VIEW_W / 2, 72, { align: 'center', color: '#f4f1e8', shadow: K });
    PixelFont.draw(g, 'EN JE DIPLOMA GEHAALD!', VIEW_W / 2, 82, { align: 'center', color: '#f4f1e8', shadow: K });
    g.drawImage(Sprites.player.idle[Math.floor(t * 2) % 2], VIEW_W / 2 - 12, 94, 24, 32);
    this.drawStats(g, 140, t);
    this.endButtons(g);
  },

  drawCrosshair(g) {
    g.drawImage(Sprites.crosshair, Math.round(Input.mouse.x) - 5, Math.round(Input.mouse.y) - 5);
  },
};
