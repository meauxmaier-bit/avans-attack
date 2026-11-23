'use strict';
/* Sprites: alle pixel-art wordt bij het opstarten in code getekend naar kleine
   offscreen canvassen (sprite sheets). Zo zijn er geen externe afbeeldingen nodig.
   In de "rows" staat elk teken voor een kleur uit het palet; '.' is transparant. */
const K = '#1b1426';          // standaard outline-kleur
const AVANS_RED = '#c8102e';  // Avans-rood als accentkleur

const Sprites = (() => {
  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  function build(w, h, fn) {
    const c = makeCanvas(w, h);
    fn(c.getContext('2d'));
    return c;
  }
  function paint(g, rows, pal, ox = 0, oy = 0) {
    for (let y = 0; y < rows.length; y++) {
      const row = rows[y];
      for (let x = 0; x < row.length; x++) {
        const col = pal[row[x]];
        if (!col) continue;
        g.fillStyle = col;
        g.fillRect(ox + x, oy + y, 1, 1);
      }
    }
  }
  function tint(src, color) {
    return build(src.width, src.height, g => {
      g.drawImage(src, 0, 0);
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = color;
      g.fillRect(0, 0, src.width, src.height);
    });
  }
  // Witte versie van een sprite (voor de "geraakt"-flits), gecachet.
  const whiteCache = new Map();
  function white(src) {
    let w = whiteCache.get(src);
    if (!w) { w = tint(src, '#ffffff'); whiteCache.set(src, w); }
    return w;
  }

  // ---------- Benen + loopanimatie (gedeeld door speler en zombie) ----------
  const LEG_POSE = [[1, -1], [0, 0], [-1, 1], [0, 0]];
  const BOB = [0, 1, 0, 1];
  function leg(g, x, col, shoe) {
    g.fillStyle = K; g.fillRect(x - 1, 12, 4, 4);
    g.fillStyle = col; g.fillRect(x, 12, 2, 2);
    g.fillStyle = shoe; g.fillRect(x, 14, 3, 1);
  }
  function humanoid(body, pal, lc) {
    const frame = (pose, bob) => build(12, 16, g => {
      const [a, b] = LEG_POSE[pose];
      leg(g, 4 + b, lc.back, lc.shoe);
      leg(g, 6 + a, lc.front, lc.shoe);
      paint(g, body, pal, 0, bob);
    });
    return {
      walk: [0, 1, 2, 3].map(f => frame(f, BOB[f])),
      idle: [frame(1, 0), frame(1, 1)],
    };
  }

  // ---------- Speler: student in een rode hoodie met rugzak ----------
  const player = humanoid([
    '...kkkkk....',
    '..khhhhhkk..',
    '.khhhhhhhhk.',
    '.khhhhssssk.',
    '.khhssssesk.',
    '..khssssssk.',
    '..kksssskk..',
    '.kbkrrrrrk..',
    'kbbkrrrrrrk.',
    'kbbkrrrrdrk.',
    'kbbkrrrrdrk.',
    '.kkkdddddk..',
  ], { k: K, h: '#5a3520', s: '#f0c09a', e: K, r: '#d42a3c', d: '#8f1626', b: '#2f4f86' },
  { front: '#3d5a9e', back: '#2a3f73', shoe: '#eeeeee' });

  // ---------- Zombie-student ----------
  const zombie = humanoid([
    '...kkkkk....',
    '..khhhhhk...',
    '.khhzzzzzk..',
    '.khzzzzzzk..',
    '.kzzzzezzzk.',
    '.kzzzzzzZk..',
    '..kZzzzZk...',
    '.kktttttkkkk',
    'kTkttttzzzzk',
    'kTkttTtkkkkk',
    'kTkttttTk...',
    '.kktTtttk...',
  ], { k: K, h: '#3a2a2a', z: '#86b86a', Z: '#56804a', e: '#ff3030', t: '#6c7a8e', T: '#46505f' },
  { front: '#4a4458', back: '#363244', shoe: '#6b4f3a' });

  // ---------- Bug (snel kevertje) ----------
  const BUG = [
    '........k.k.',
    '..kkkkk..kk.',
    '.kgGgGgkkkk.',
    'kgGgGgGkwwek',
    'kgggggGkwwwk',
    '.kggggkkkkk.',
    '..kkkkkk....',
  ];
  const bugPal = { k: K, g: '#f2a541', G: '#c0661f', w: '#ffffff', e: '#ff2a2a' };
  const bug = [0, 1].map(f => build(12, 9, g => {
    paint(g, BUG, bugPal);
    g.fillStyle = K;
    for (let i = 0; i < 3; i++) {
      const x = 3 + i * 3, off = ((i + f) % 2) ? 1 : -1;
      g.fillRect(x, 7, 1, 1);
      g.fillRect(x + off, 8, 1, 1);
    }
  }));

  // ---------- Deadline-monster (zwevend spookje met klok) ----------
  const DL_TOP = [
    '.....kkkkkk.....',
    '...kkppppppkk...',
    '..kppppppppppk..',
    '.kppekppppekpPk.',
    '.kpppeppppeppPk.',
    'kppppppppppppPPk',
    'kpppkkkkkkkpppPk',
    'kppkwwwkwwwkppPk',
    'kppkwwwkwwwkppPk',
    'kppkwwwkkkwkppPk',
    'kppkwwwwwwwkppPk',
    'kpppkkkkkkkpppPk',
    'kppppppppppppPPk',
    'kpppppppppppPPPk',
  ];
  const DL_BOTTOM = [
    ['kppk.kpk.kpk.kPk', '.kk...k...k...k.'],
    ['kpk.kpk.kpk.kpPk', '.k...k...k...kk.'],
  ];
  const dlPal = { k: K, p: '#7b5cd6', P: '#4e3a9a', w: '#f4efe2', e: '#ff3b3b' };
  const deadline = [0, 1].map(f => build(16, 16, g => {
    paint(g, DL_TOP, dlPal);
    paint(g, DL_BOTTOM[f], dlPal, 0, 14);
  }));

  // ---------- Eindbaas: De Tentamencommissie (boos tentamenblad) ----------
  function bossFrame(f) {
    return build(32, 32, g => {
      // armpjes met vuistjes
      const ay = f ? 15 : 19;
      g.fillStyle = K;
      g.fillRect(0, ay, 4, 2); g.fillRect(28, ay, 4, 2);
      g.fillRect(0, ay - 1, 2, 4); g.fillRect(30, ay - 1, 2, 4);
      // papier
      g.fillStyle = K; g.fillRect(3, 1, 26, 30);
      g.fillStyle = '#f4f1e8'; g.fillRect(4, 2, 24, 28);
      g.fillStyle = '#e2ddcf'; g.fillRect(4, 27, 24, 3);
      // ezelsoor rechtsboven
      for (let i = 0; i < 6; i++) {
        g.clearRect(23 + i, 0, 1, 2 + i);
        g.fillStyle = K; g.fillRect(23 + i, 1 + i, 1, 1);
        g.fillStyle = '#d6cfbd'; g.fillRect(23, 2 + i, i + 1, 1);
      }
      g.fillStyle = K; g.fillRect(22, 2, 1, 6); g.fillRect(22, 8, 7, 1);
      // tekstregels
      g.fillStyle = '#b9b3a5';
      g.fillRect(6, 4, 14, 1); g.fillRect(6, 6, 11, 1);
      // boze ogen
      g.fillStyle = K; g.fillRect(7, 9, 7, 5); g.fillRect(18, 9, 7, 5);
      g.fillStyle = '#ffffff'; g.fillRect(8, 10, 5, 3); g.fillRect(19, 10, 5, 3);
      g.fillStyle = '#d4202c'; g.fillRect(10, 11, 2, 2); g.fillRect(20, 11, 2, 2);
      g.fillStyle = K;
      g.fillRect(6, 7, 3, 1); g.fillRect(9, 8, 3, 1);
      g.fillRect(23, 7, 3, 1); g.fillRect(20, 8, 3, 1);
      // mond
      if (f) {
        g.fillStyle = K; g.fillRect(11, 15, 10, 4);
        g.fillStyle = '#ffffff'; g.fillRect(12, 15, 2, 1); g.fillRect(15, 15, 2, 1); g.fillRect(18, 15, 2, 1);
        g.fillStyle = '#d4202c'; g.fillRect(13, 17, 6, 1);
      } else {
        g.fillStyle = K; g.fillRect(11, 16, 10, 1); g.fillRect(10, 17, 1, 1); g.fillRect(21, 17, 1, 1);
      }
      // het cijfer...
      PixelFont.draw(g, '2,4', 16, 20, { scale: 2, color: '#d4202c', align: 'center' });
    });
  }
  const boss = [bossFrame(0), bossFrame(1)];

  // ---------- Wapen: de koffieblaster ----------
  const gun = build(11, 6, g => paint(g, [
    '...kkkkkk..',
    '..kRRRRRRkk',
    'kkkRwwwwRRk',
    'kcckRRRRkk.',
    '.kck.......',
    '..k........',
  ], { k: K, R: '#d42a3c', w: '#f2f2f2', c: '#6b3e26' }));

  // ---------- Pickups ----------
  const cup = build(8, 8, g => paint(g, [
    '..m..m..',
    '.m..m...',
    'kkkkkk..',
    'kwwwwkkk',
    'kRRRRk.k',
    'kRwwRkkk',
    'kwwwwk..',
    '.kkkk...',
  ], { k: K, m: '#dfe8ff', w: '#f4f4f4', R: AVANS_RED }));

  const can = build(6, 9, g => paint(g, [
    '.kkkk.',
    'kssssk',
    'kyyyyk',
    'kybbyk',
    'kyybyk',
    'kybyyk',
    'kyyyyk',
    'kssssk',
    '.kkkk.',
  ], { k: K, s: '#c0c8d0', y: '#ffd23f', b: '#2b6cff' }));

  // ---------- UI ----------
  const heart = build(7, 6, g => paint(g, [
    '.kk.kk.',
    'kwrkrrk',
    'krrrrrk',
    '.krrrk.',
    '..krk..',
    '...k...',
  ], { k: K, r: '#ff4d5e', w: '#ffd0d5' }));

  const crosshair = build(11, 11, g => {
    const arms = [[5, 0, 1, 4], [5, 7, 1, 4], [0, 5, 4, 1], [7, 5, 4, 1]];
    g.fillStyle = K;
    for (const [x, y, w, h] of arms) g.fillRect(x - 1, y - 1, w + 2, h + 2);
    g.fillStyle = '#ffffff';
    for (const [x, y, w, h] of arms) g.fillRect(x, y, w, h);
    g.fillStyle = '#ff3b4f'; g.fillRect(5, 5, 1, 1);
  });

  const shadow = build(10, 3, g => {
    g.fillStyle = 'rgba(0,0,0,0.28)';
    g.fillRect(2, 0, 6, 1); g.fillRect(0, 1, 10, 1); g.fillRect(2, 2, 6, 1);
  });
  const shadowBig = build(28, 5, g => {
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.fillRect(6, 0, 16, 1); g.fillRect(2, 1, 24, 1); g.fillRect(0, 2, 28, 1);
    g.fillRect(2, 3, 24, 1); g.fillRect(6, 4, 16, 1);
  });

  return { player, zombie, bug, deadline, boss, gun, cup, can, heart, crosshair, shadow, shadowBig, white };
})();
