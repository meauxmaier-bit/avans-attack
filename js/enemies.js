'use strict';
/* Vijanden:
   zombie   - langzame zombie-student, houdt wat klappen
   bug      - snel kevertje dat zigzagt
   deadline - zwevend monster dat afstand houdt en klokken schiet
   boss     - De Tentamencommissie (eindbaas level 5), 3 fases */
const ENEMY_TYPES = {
  zombie:   { hp: 3,   speed: 30, dmg: 14, score: 10,   r: 6,  hw: 4,  fy0: 1,  fy1: 7,  shadowY: 6,  mode: 'walker', colors: ['#86b86a', '#56804a', '#6c7a8e'] },
  bug:      { hp: 1,   speed: 66, dmg: 8,  score: 15,   r: 5,  hw: 4,  fy0: -1, fy1: 4,  shadowY: 3,  mode: 'walker', colors: ['#f2a541', '#c0661f', '#ffffff'] },
  deadline: { hp: 5,   speed: 26, dmg: 12, score: 30,   r: 7,  hw: 5,  fy0: 0,  fy1: 7,  shadowY: 10, mode: 'flyer',  colors: ['#7b5cd6', '#4e3a9a', '#f4efe2'] },
  boss:     { hp: 180, speed: 20, dmg: 25, score: 1000, r: 14, hw: 10, fy0: 2,  fy1: 15, shadowY: 15, mode: 'flyer',  colors: ['#f4f1e8', '#d4202c', '#b9b3a5'] },
};

class Enemy {
  constructor(type, x, y, level) {
    const T = ENEMY_TYPES[type];
    this.type = type; this.T = T;
    this.x = x; this.y = y;
    this.maxHp = T.hp; this.hp = T.hp;
    this.speed = T.speed * level.speedMul * (type === 'boss' ? 1 : 0.9 + Math.random() * 0.2);
    this.hw = T.hw; this.fy0 = T.fy0; this.fy1 = T.fy1; this.r = T.r; this.mode = T.mode;
    this.flash = 0; this.kx = 0; this.ky = 0;
    this.anim = Math.random() * 4; this.age = 0; this.facing = 1;
    this.dead = false; this.summoned = false;
    this.shootT = 1.5 + Math.random() * 1.5;
    this.wob = Math.random() * Math.PI * 2;
    // eindbaas-timers
    this.atk1 = 2.5; this.atk2 = 1.5; this.atk3 = 6; this.spin = 0; this.spinT = 0; this.phase = 1;
  }

  get footY() { return this.y + (this.fy0 + this.fy1) / 2; }
  get sortY() { return this.y + this.fy1; }

  update(dt, world, player) {
    this.age += dt; this.anim += dt;
    if (this.flash > 0) this.flash -= dt;
    const dxp = player.x - this.x, dyp = player.y - this.y;
    const dist = Math.hypot(dxp, dyp) || 1;
    this.facing = dxp >= 0 ? 1 : -1;

    let mx = 0, my = 0;
    if (this.type === 'boss') {
      [mx, my] = this.bossAI(dt, dist, dxp, dyp);
    } else {
      const tgt = world.flowTarget(this.x, this.footY);
      if (tgt) {
        const tx = tgt.x - this.x, ty = tgt.y - this.footY, l = Math.hypot(tx, ty) || 1;
        mx = tx / l; my = ty / l;
      } else {
        mx = dxp / dist; my = dyp / dist;
      }
      if (this.type === 'bug') { // zigzaggen
        this.wob += dt * 10;
        const s = Math.sin(this.wob) * 0.6;
        const ox = -my * s, oy = mx * s;
        mx += ox; my += oy;
      }
      if (this.type === 'deadline') {
        const los = dist < 190 && world.los(this.x, this.y, player.x, player.y);
        if (los && dist < 85) { mx = -dxp / dist; my = -dyp / dist; }               // afstand houden
        else if (los && dist < 130) { mx = -dyp / dist * 0.7; my = dxp / dist * 0.7; } // eromheen cirkelen
        this.shootT -= dt;
        if (this.shootT <= 0 && los && !player.dead) {
          this.shootT = Math.max(1.3, 2.6 - 0.25 * Game.levelIndex);
          this.fire(Math.atan2(dyp, dxp), 80, 'clock', 12);
          Sound.enemyShoot();
        }
      }
    }
    const sp = this.speed * (this.age < 0.4 ? 0.5 : 1);
    world.move(this, mx * sp * dt + this.kx * dt, my * sp * dt + this.ky * dt, this.mode);
    const damp = Math.pow(0.0005, dt);
    this.kx *= damp; this.ky *= damp;
  }

  fire(angle, speed, kind, dmg) {
    Game.enemyBullets.push(new Bullet(this.x, this.y, angle, speed, { kind, dmg, life: 6 }));
  }

  bossAI(dt, dist, dxp, dyp) {
    const ratio = this.hp / this.maxHp;
    const ph = ratio > 0.66 ? 1 : ratio > 0.33 ? 2 : 3;
    if (ph !== this.phase) {
      this.phase = ph;
      this.speed *= 1.25;
      Game.banner('DE COMMISSIE WORDT BOOS!', ph === 3 ? 'LAATSTE FASE - HOU VOL!' : '', 1.6, '#ff4d5e');
      Game.addShake(6);
      Sound.boss();
    }
    this.atk1 -= dt; this.atk2 -= dt; this.atk3 -= dt;
    const aim = Math.atan2(dyp, dxp);
    if (this.atk1 <= 0) { // ring van blaadjes
      const n = [0, 10, 14, 18][ph], off = Math.random() * Math.PI;
      for (let i = 0; i < n; i++) this.fire(off + i * Math.PI * 2 / n, 55 + ph * 8, 'paper', 10);
      this.atk1 = [0, 3, 2.6, 2.2][ph];
      Sound.bossShoot();
    }
    if (this.atk2 <= 0) { // gerichte waaier
      const n = ph === 2 ? 5 : 3;
      for (let i = 0; i < n; i++) this.fire(aim + (i - (n - 1) / 2) * 0.22, 95, 'paper', 10);
      this.atk2 = [0, 1.8, 1.5, 2][ph];
    }
    if (ph >= 2 && this.atk3 <= 0) { // roept bugs op
      Game.spawnEnemy('bug', true);
      Game.spawnEnemy('bug', true);
      this.atk3 = 8;
    }
    if (ph === 3) { // spiraal
      this.spinT -= dt;
      if (this.spinT <= 0) {
        this.spinT = 0.22; this.spin += 0.4;
        this.fire(this.spin, 60, 'paper', 10);
        this.fire(this.spin + Math.PI, 60, 'paper', 10);
      }
    }
    let mx = 0, my = 0;
    if (dist > 120) { mx = dxp / dist; my = dyp / dist; }
    else if (dist < 70) { mx = -dxp / dist; my = -dyp / dist; }
    mx += Math.cos(this.age * 0.8) * 0.5;
    return [mx, my];
  }

  hit(dmg, vx, vy) {
    if (this.dead) return;
    this.hp -= dmg;
    this.flash = 0.08;
    const l = Math.hypot(vx, vy) || 1;
    const kb = this.type === 'boss' ? 0 : this.type === 'bug' ? 140 : 80;
    this.kx += vx / l * kb; this.ky += vy / l * kb;
    if (this.hp <= 0) {
      this.dead = true;
      Game.onEnemyKilled(this);
    } else {
      Sound.hit();
    }
  }

  drawShadow(g) {
    const big = this.type === 'boss';
    const s = big ? Sprites.shadowBig : Sprites.shadow;
    g.drawImage(s, Math.round(this.x - s.width / 2), Math.round(this.y + this.T.shadowY));
  }

  draw(g) {
    let spr, yOff = 0, flip = true;
    switch (this.type) {
      case 'zombie': spr = Sprites.zombie.walk[Math.floor(this.anim * 6) % 4]; break;
      case 'bug': spr = Sprites.bug[Math.floor(this.anim * 12) % 2]; break;
      case 'deadline': spr = Sprites.deadline[Math.floor(this.anim * 4) % 2]; yOff = Math.round(Math.sin(this.anim * 3) * 2); break;
      case 'boss': spr = Sprites.boss[Math.floor(this.anim * 3) % 2]; yOff = Math.round(Math.sin(this.anim * 2) * 2); flip = false; break;
    }
    if (this.flash > 0) spr = Sprites.white(spr);
    g.save();
    if (this.age < 0.3) g.globalAlpha = this.age / 0.3; // infaden bij spawnen
    g.translate(Math.round(this.x), Math.round(this.y) + yOff);
    if (flip) g.scale(this.facing, 1);
    g.drawImage(spr, -Math.floor(spr.width / 2), -Math.floor(spr.height / 2));
    g.restore();
    // klein healthbalkje bij beschadigde vijanden
    if (this.type !== 'boss' && this.maxHp > 1 && this.hp < this.maxHp) {
      const bx = Math.round(this.x) - 5, by = Math.round(this.y) - Math.floor(spr.height / 2) - 4 + yOff;
      g.fillStyle = K; g.fillRect(bx, by, 10, 2);
      g.fillStyle = '#ff4d4d'; g.fillRect(bx, by, Math.round(10 * this.hp / this.maxHp), 2);
    }
  }
}
