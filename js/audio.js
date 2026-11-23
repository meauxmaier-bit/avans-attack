'use strict';
/* Geluid: alle effecten en de muziek worden live gesynthetiseerd met de Web Audio API
   (chiptune-stijl), dus er zijn geen audiobestanden nodig. */
const Sound = (() => {
  let ac = null, master = null, sfx = null, music = null, noiseBuf = null;
  let muted = false, musicOn = false, nextTime = 0, step = 0;
  const VOL = 0.45;
  const midi = m => 440 * Math.pow(2, (m - 69) / 12);

  // Browsers staan audio pas toe na een klik/toets, dus init wordt dan aangeroepen.
  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    master = ac.createGain(); master.gain.value = muted ? 0 : VOL; master.connect(ac.destination);
    sfx = ac.createGain(); sfx.gain.value = 0.8; sfx.connect(master);
    music = ac.createGain(); music.gain.value = 0.2; music.connect(master);
    noiseBuf = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.6), ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    nextTime = ac.currentTime + 0.1;
    setInterval(scheduler, 25);
  }

  function tone(f, d, o = {}) {
    if (!ac) return;
    const t0 = ac.currentTime + Math.max(0, o.t || 0);
    const osc = ac.createOscillator(), g = ac.createGain();
    osc.type = o.type || 'square';
    osc.frequency.setValueAtTime(f, t0);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t0 + d);
    g.gain.setValueAtTime(o.v || 0.2, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    osc.connect(g); g.connect(o.out || sfx);
    osc.start(t0); osc.stop(t0 + d + 0.05);
  }

  function noise(d, o = {}) {
    if (!ac) return;
    const t0 = ac.currentTime + Math.max(0, o.t || 0);
    const src = ac.createBufferSource(); src.buffer = noiseBuf;
    const f = ac.createBiquadFilter(); f.type = o.filter || 'lowpass'; f.frequency.value = o.f || 1200;
    const g = ac.createGain();
    g.gain.setValueAtTime(o.v || 0.2, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    src.connect(f); f.connect(g); g.connect(o.out || sfx);
    src.start(t0); src.stop(t0 + d + 0.05);
  }

  // ---------- Muziek: simpele chiptune-loop (Am - F - C - G) ----------
  const STEP = 60 / 140 / 4;
  const BARS = [[45, [0, 3, 7]], [41, [0, 4, 7]], [48, [0, 4, 7]], [43, [0, 4, 7]]];
  const LEAD = [0, -1, 1, 2, -1, 1, 0, -1, 2, -1, 1, -1, 0, 1, 2, -1];

  function scheduler() {
    if (!ac) return;
    if (!musicOn || muted) { nextTime = ac.currentTime + 0.05; return; }
    if (nextTime < ac.currentTime - 0.2) nextTime = ac.currentTime + 0.05;
    while (nextTime < ac.currentTime + 0.15) {
      const t = nextTime - ac.currentTime;
      const [root, chord] = BARS[Math.floor(step / 16) % 4];
      const s = step % 16;
      if (s % 2 === 0) tone(midi(root + (s % 4 === 2 ? 12 : 0)), STEP * 1.6, { type: 'triangle', v: 0.55, t, out: music });
      if (s % 8 === 0) tone(140, 0.12, { type: 'sine', f2: 45, v: 0.7, t, out: music });
      if (s % 8 === 4) noise(0.08, { v: 0.25, f: 2500, filter: 'bandpass', t, out: music });
      if (s % 2 === 1) noise(0.025, { v: 0.1, f: 7000, filter: 'highpass', t, out: music });
      const li = LEAD[s];
      if (li >= 0 && Math.floor(step / 64) % 2 === 1) {
        tone(midi(root + 24 + chord[li]), STEP * 0.9, { type: 'square', v: 0.09, t, out: music });
      }
      nextTime += STEP;
      step++;
    }
  }

  // ---------- Geluidseffecten ----------
  return {
    init,
    shoot() { tone(900, 0.07, { f2: 240, v: 0.06 }); noise(0.04, { v: 0.05, f: 3000 }); },
    hit() { tone(320, 0.05, { f2: 160, v: 0.07 }); },
    kill() { noise(0.18, { v: 0.22, f: 900 }); tone(220, 0.15, { f2: 60, v: 0.08 }); },
    hurt() { tone(220, 0.22, { type: 'sawtooth', f2: 70, v: 0.18 }); noise(0.15, { v: 0.2, f: 600 }); },
    pickup() { [660, 990, 1320].forEach((f, i) => tone(f, 0.1, { v: 0.1, t: i * 0.07 })); },
    enemyShoot() { tone(520, 0.14, { type: 'triangle', f2: 240, v: 0.12 }); },
    spawn() { noise(0.12, { v: 0.05, f: 500 }); },
    wave() { [523, 659, 784].forEach((f, i) => tone(f, 0.14, { v: 0.1, t: i * 0.09 })); },
    levelUp() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.16, { v: 0.1, t: i * 0.09 })); },
    gameOver() { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.35, { type: 'sawtooth', v: 0.12, t: i * 0.25 })); },
    victory() { [523, 523, 784, 659, 1047].forEach((f, i) => tone(f, 0.22, { v: 0.12, t: i * 0.16 })); },
    boss() { tone(110, 0.6, { type: 'sawtooth', f2: 45, v: 0.25 }); noise(0.5, { v: 0.2, f: 300 }); },
    bossShoot() { tone(260, 0.2, { type: 'square', f2: 120, v: 0.08 }); },
    bossDeath() { noise(0.6, { v: 0.4, f: 700 }); tone(300, 0.6, { type: 'sawtooth', f2: 30, v: 0.2 }); },
    door() { tone(300, 0.1, { v: 0.1 }); tone(450, 0.15, { v: 0.1, t: 0.08 }); },
    click() { tone(700, 0.05, { v: 0.1 }); },
    setMusic(on) { musicOn = on; },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : VOL;
      return muted;
    },
  };
})();
