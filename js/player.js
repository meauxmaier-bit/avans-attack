'use strict';
/* De speler: lopen met pijltjes/WASD, richten met de muis, schieten met klikken. */
class Player {
  constructor(x, y) {
    this.x = x; this.y = y;
    // botsingsbox (rond de voeten) en raak-straal
    this.hw = 4; this.fy0 = 1; this.fy1 = 7; this.r = 5;
    this.maxHp = 100; this.hp = 100;
    this.speed = 88;
    this.fireCd = 0;
    this.aim = 0; this.facing = 1;
    this.anim = 0; this.moving = false;
    this.invuln = 0; this.flash = 0;
    this.recoil = 0; this.muzzle = 0;
    this.rapid = 0;           // tijd die de energydrink nog werkt
    this.kx = 0; this.ky = 0; // knockback
    this.dead = false;
  }

  get sortY() { return this.y + this.fy1; }
  get fireRate() { return this.rapid > 0 ? 0.07 : 0.14; }

  pivot() { return { x: this.x + this.facing, y: this.y + 2 }; }

  update(dt, world, mouseWorld) {
    if (this.dead) return;
    let dx = 0, dy = 0;
    if (Input.held('ArrowLeft', 'KeyA')) dx -= 1;
    if (Input.held('ArrowRight', 'KeyD')) dx += 1;
    if (Input.held('ArrowUp', 'KeyW')) dy -= 1;
    if (Input.held('ArrowDown', 'KeyS')) dy += 1;
    this.moving = dx !== 0 || dy !== 0;
    if (dx && dy) { dx *= Math.SQRT1_2; dy *= Math.SQRT1_2; }
    world.move(this, (dx * this.speed + this.kx) * dt, (dy * this.speed + this.ky) * dt, 'player');
    const damp = Math.pow(0.001, dt);
    this.kx *= damp; this.ky *= damp;

    const pv = this.pivot();
    this.aim = Math.atan2(mouseWorld.y - pv.y, mouseWorld.x - pv.x);
    this.facing = Math.cos(this.aim) >= 0 ? 1 : -1;

    this.anim += dt;
    this.fireCd -= dt;
    if (this.invuln > 0) this.invuln -= dt;
    if (this.flash > 0) this.flash -= dt;
    if (this.muzzle > 0) this.muzzle -= dt;
    if (this.rapid > 0) this.rapid -= dt;
    this.recoil = Math.max(0, this.recoil - dt * 25);

    if (Input.mouse.down && this.fireCd <= 0) this.shoot();
  }

  shoot() {
    this.fireCd = this.fireRate;
    const pv = this.pivot();
    const spread = (Math.random() - 0.5) * 0.08;
    const tipX = pv.x + Math.cos(this.aim) * 10, tipY = pv.y + Math.sin(this.aim) * 10;
    Game.bullets.push(new Bullet(tipX, tipY, this.aim + spread, 270, { friendly: true, dmg: 1, kind: 'coffee', life: 1.2 }));
    this.recoil = 3;
    this.muzzle = 0.06;
    // uitgeworpen "koffieboon"
    Effects.add(pv.x, pv.y - 1, -Math.cos(this.aim) * 30 + (Math.random() - 0.5) * 20, -45, 0.4, '#8a5a2a', 1, 260);
    Sound.shoot();
  }

  hurt(dmg, sx, sy) {
    if (this.invuln > 0 || this.dead) return;
    this.hp = Math.max(0, this.hp - dmg);
    this.invuln = 0.9;
    this.flash = 0.1;
    const a = Math.atan2(this.y - sy, this.x - sx);
    this.kx = Math.cos(a) * 160; this.ky = Math.sin(a) * 160;
    Game.addShake(5);
    Game.damageFlash = 0.25;
    Sound.hurt();
    Effects.burst(this.x, this.y, ['#d42a3c', '#ff6b6b'], 8, 70, 0.4, 1);
    if (this.hp <= 0) {
      this.dead = true;
      Game.onPlayerDeath();
    }
  }

  drawShadow(g) { g.drawImage(Sprites.shadow, Math.round(this.x) - 5, Math.round(this.y) + 6); }

  draw(g) {
    // knipperen tijdens onkwetsbaarheid
    if (this.invuln > 0 && this.flash <= 0 && Math.floor(this.invuln * 20) % 2 === 0) return;
    const frames = this.moving ? Sprites.player.walk : Sprites.player.idle;
    const fi = this.moving ? Math.floor(this.anim * 10) % 4 : Math.floor(this.anim * 2) % 2;
    let spr = frames[fi];
    if (this.flash > 0) spr = Sprites.white(spr);
    const aimUp = Math.sin(this.aim) < -0.35;
    if (aimUp) this.drawGun(g);           // wapen achter het lichaam als je omhoog richt
    const kick = this.recoil > 1.5 ? -this.facing : 0;
    g.save();
    g.translate(Math.round(this.x) + kick, Math.round(this.y));
    g.scale(this.facing, 1);
    g.drawImage(spr, -6, -8);
    g.restore();
    if (!aimUp) this.drawGun(g);
  }

  drawGun(g) {
    const pv = this.pivot();
    g.save();
    g.translate(Math.round(pv.x), Math.round(pv.y));
    g.rotate(this.aim);
    if (this.facing < 0) g.scale(1, -1);
    g.drawImage(Sprites.gun, -2 - Math.round(this.recoil), -3);
    if (this.muzzle > 0) {
      g.fillStyle = '#ffd166'; g.fillRect(9, -3, 5, 5);
      g.fillStyle = '#ffffff'; g.fillRect(10, -2, 3, 3);
    }
    g.restore();
  }
}
