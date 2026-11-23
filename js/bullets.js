'use strict';
/* Kogels (van speler en vijanden), pickups en visuele effecten (deeltjes, zwevende tekst). */

class Bullet {
  constructor(x, y, angle, speed, o = {}) {
    this.x = x; this.y = y;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.friendly = !!o.friendly;
    this.dmg = o.dmg || 1;
    this.kind = o.kind || 'coffee';
    this.life = o.life || 2;
    this.t = 0;
    this.dead = false;
  }

  update(dt, world) {
    this.t += dt;
    this.life -= dt;
    if (this.life <= 0) { this.dead = true; return; }
    for (let i = 0; i < 2; i++) {
      this.x += this.vx * dt / 2;
      this.y += this.vy * dt / 2;
      if (world.solid(Math.floor(this.x / TILE), Math.floor(this.y / TILE), 'bullet')) {
        this.dead = true;
        Effects.sparks(this.x - this.vx * dt / 2, this.y - this.vy * dt / 2, this.friendly ? '#ffb347' : '#c9a7ff');
        return;
      }
    }
  }

  draw(g) {
    const x = Math.round(this.x), y = Math.round(this.y);
    switch (this.kind) {
      case 'coffee': { // koffiedruppel uit de koffieblaster
        const tx = Math.round(this.vx * 0.015), ty = Math.round(this.vy * 0.015);
        g.fillStyle = 'rgba(255,170,60,0.45)'; g.fillRect(x - tx - 1, y - ty - 1, 2, 2);
        g.fillStyle = '#ff9f1c'; g.fillRect(x - 2, y - 2, 4, 4);
        g.fillStyle = '#fff3b0'; g.fillRect(x - 1, y - 1, 2, 2);
        break;
      }
      case 'clock': { // tikkende klok van het deadline-monster
        g.fillStyle = K; g.fillRect(x - 3, y - 3, 6, 6);
        g.fillStyle = Math.floor(this.t * 10) % 2 ? '#ff4d6d' : '#b04dff'; g.fillRect(x - 2, y - 2, 4, 4);
        g.fillStyle = '#ffffff'; g.fillRect(x - 1, y - 2, 1, 2); g.fillRect(x - 1, y - 1, 2, 1);
        break;
      }
      case 'paper': { // ronddwarrelend tentamenblaadje van de eindbaas
        const flip = Math.floor(this.t * 8) % 2;
        const w = flip ? 6 : 4, h = flip ? 4 : 6;
        g.fillStyle = K; g.fillRect(x - w / 2 - 1, y - h / 2 - 1, w + 2, h + 2);
        g.fillStyle = '#f4f1e8'; g.fillRect(x - w / 2, y - h / 2, w, h);
        g.fillStyle = '#d4202c'; g.fillRect(x - 1, y, 2, 1);
        break;
      }
    }
  }
}

class Pickup {
  constructor(x, y, type) {
    this.x = x; this.y = y; this.type = type;
    this.t = 0; this.life = 12; this.dead = false;
  }
  get sortY() { return this.y + 4; }
  update(dt) {
    this.t += dt;
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
  }
  drawShadow(g) { g.drawImage(Sprites.shadow, Math.round(this.x) - 5, Math.round(this.y) + 3); }
  draw(g) {
    if (this.life < 3 && Math.floor(this.t * 8) % 2) return; // knippert voor het verdwijnt
    const spr = this.type === 'coffee' ? Sprites.cup : Sprites.can;
    const bob = Math.round(Math.sin(this.t * 4) * 1.5);
    g.drawImage(spr, Math.round(this.x - spr.width / 2), Math.round(this.y - spr.height / 2 - 2 + bob));
  }
}

const Effects = {
  particles: [],
  texts: [],

  clear() { this.particles = []; this.texts = []; },

  add(x, y, vx, vy, life, color, size = 1, grav = 0) {
    this.particles.push({ x, y, vx, vy, life, max: life, color, size, grav });
  },

  burst(x, y, colors, n, speed, life, size = 1) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random() * 0.7);
      this.add(x, y, Math.cos(a) * s, Math.sin(a) * s, life * (0.6 + Math.random() * 0.6), colors[i % colors.length], size);
    }
  },

  sparks(x, y, color) { this.burst(x, y, [color, '#ffffff'], 5, 70, 0.22, 1); },

  text(x, y, str, color = '#ffffff') { this.texts.push({ x, y, str, color, life: 0.9 }); },

  update(dt) {
    const f = Math.pow(0.02, dt);
    for (const p of this.particles) {
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= f; p.vy = p.vy * f + p.grav * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter(p => p.life > 0);
    for (const t of this.texts) { t.y -= 18 * dt; t.life -= dt; }
    this.texts = this.texts.filter(t => t.life > 0);
  },

  draw(g) {
    for (const p of this.particles) {
      const s = p.life < p.max * 0.35 ? Math.max(1, p.size - 1) : p.size;
      g.fillStyle = p.color;
      g.fillRect(Math.round(p.x - s / 2), Math.round(p.y - s / 2), s, s);
    }
    for (const t of this.texts) PixelFont.draw(g, t.str, t.x, t.y, { align: 'center', color: t.color, shadow: K });
  },
};
