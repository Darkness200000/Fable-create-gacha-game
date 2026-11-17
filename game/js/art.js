/* Veilfall — 2D art helpers: baked stills of the 3D characters, plus code-painted Hollow monsters and particle sprites. */
(function () {
  const A = G.Art = {}, cache = {}, urls = {};
  const W = 400, H = 520;

  function rgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
  function mix(a, b, t) { const x = rgb(a), y = rgb(b); return 'rgb(' + x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(',') + ')'; }
  const dark = (h, t) => mix(h, '#05030c', t), light = (h, t) => mix(h, '#ffffff', t);
  function rgba(h, a) { const x = rgb(h); return `rgba(${x[0]},${x[1]},${x[2]},${a})`; }
  A.rgba = rgba; A.mix = mix;
  function grad(c, x0, y0, x1, y1, stops) { const g = c.createLinearGradient(x0, y0, x1, y1); stops.forEach((s, i) => g.addColorStop(i / (stops.length - 1), s)); return g; }
  function glow(c, col, b) { c.shadowColor = col; c.shadowBlur = b; }
  function noGlow(c) { c.shadowBlur = 0; c.shadowColor = 'transparent'; }

  /* rim light on painted pixels, then soft aura behind */
  function finish(c, E, auraA) {
    c.globalCompositeOperation = 'source-atop';
    c.fillStyle = grad(c, 60, 0, 340, 0, [rgba(E.c, .34), 'rgba(0,0,0,0)', 'rgba(8,4,24,.22)']); c.fillRect(0, 0, W, H);
    c.fillStyle = grad(c, 0, 250, 0, H, ['rgba(0,0,0,0)', 'rgba(6,3,20,.3)']); c.fillRect(0, 0, W, H);
    c.globalCompositeOperation = 'destination-over';
    const g = c.createRadialGradient(200, 290, 30, 200, 290, 196);
    g.addColorStop(0, rgba(E.c, auraA || .32)); g.addColorStop(1, rgba(E.c, 0));
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.globalCompositeOperation = 'source-over';
  }

  function eyes(c, E, pts, r) {
    glow(c, E.c, 24); c.fillStyle = E.c2;
    pts.forEach(p => { c.beginPath(); c.ellipse(p[0], p[1], r, r * 1.25, p[2] || 0, 0, 7); c.fill(); }); noGlow(c);
  }
  function monster(c, shape, el) {
    const E = G.EL[el], body = (x0, y0, x1, y1) => grad(c, x0, y0, x1, y1, ['#3a2c58', '#1a1230', '#0b0716']);
    if (shape === 'wisp') {
      c.fillStyle = body(120, 160, 280, 460);
      c.beginPath(); c.moveTo(200, 120); c.quadraticCurveTo(250, 200, 292, 300); c.quadraticCurveTo(310, 420, 200, 440);
      c.quadraticCurveTo(90, 420, 108, 300); c.quadraticCurveTo(150, 200, 200, 120); c.fill();
      glow(c, E.c, 30); c.fillStyle = rgba(E.c, .85);
      c.beginPath(); c.moveTo(200, 70); c.quadraticCurveTo(226, 130, 200, 170); c.quadraticCurveTo(170, 130, 200, 70); c.fill(); noGlow(c);
      eyes(c, E, [[166, 310, 0.3], [234, 310, -0.3]], 17);
    } else if (shape === 'crawler') {
      c.fillStyle = '#0b0716'; [[110, 440], [160, 462], [240, 462], [290, 440]].forEach(p => { c.beginPath(); c.ellipse(p[0], p[1], 20, 30, 0, 0, 7); c.fill(); });
      c.fillStyle = rgba(E.c, .9); glow(c, E.c, 14);
      [[110, 300, -0.5], [156, 262, -0.2], [200, 250, 0], [244, 262, 0.2], [290, 300, 0.5]].forEach(p => { c.save(); c.translate(p[0], p[1]); c.rotate(p[2]);
        c.beginPath(); c.moveTo(-15, 16); c.lineTo(0, -52); c.lineTo(15, 16); c.fill(); c.restore(); }); noGlow(c);
      c.fillStyle = body(80, 270, 320, 460); c.beginPath(); c.ellipse(200, 366, 136, 96, 0, 0, 7); c.fill();
      eyes(c, E, [[156, 360, 0.35], [244, 360, -0.35]], 16);
      c.fillStyle = '#eee6ff'; for (let i = 0; i < 5; i++) { c.beginPath(); c.moveTo(160 + i * 18, 410); c.lineTo(169 + i * 18, 430); c.lineTo(178 + i * 18, 410); c.fill(); }
    } else if (shape === 'brute') {
      c.fillStyle = body(60, 150, 340, 480);
      [[92, 350], [308, 350]].forEach(p => { c.beginPath(); c.ellipse(p[0], p[1], 44, 92, p[0] < 200 ? 0.2 : -0.2, 0, 7); c.fill(); });
      c.beginPath(); c.moveTo(200, 150); c.quadraticCurveTo(330, 160, 318, 330); c.quadraticCurveTo(312, 470, 200, 476); c.quadraticCurveTo(88, 470, 82, 330); c.quadraticCurveTo(70, 160, 200, 150); c.fill();
      [-1, 1].forEach(s => { c.fillStyle = grad(c, 0, 80, 0, 200, [E.c2, '#1a1230']);
        c.beginPath(); c.moveTo(200 + s * 60, 180); c.quadraticCurveTo(200 + s * 140, 150, 200 + s * 122, 70); c.quadraticCurveTo(200 + s * 100, 136, 200 + s * 30, 160); c.fill(); });
      eyes(c, E, [[160, 260, 0.4], [240, 260, -0.4]], 13);
      glow(c, E.c, 14); c.strokeStyle = rgba(E.c, .9); c.lineWidth = 4; c.lineJoin = 'round';
      c.beginPath(); c.moveTo(200, 310); c.lineTo(182, 350); c.lineTo(214, 380); c.lineTo(190, 430); c.moveTo(214, 380); c.lineTo(250, 400); c.stroke(); noGlow(c);
    } else { // mage
      c.fillStyle = body(100, 120, 300, 480);
      c.beginPath(); c.moveTo(200, 150); c.quadraticCurveTo(290, 200, 300, 440); c.lineTo(266, 420); c.lineTo(234, 452); c.lineTo(200, 424); c.lineTo(166, 452); c.lineTo(134, 420); c.lineTo(100, 440);
      c.quadraticCurveTo(110, 200, 200, 150); c.fill();
      c.fillStyle = '#241a40'; c.beginPath(); c.moveTo(120, 190); c.quadraticCurveTo(190, 120, 244, 40); c.quadraticCurveTo(250, 130, 284, 190); c.fill();
      c.beginPath(); c.ellipse(200, 194, 118, 22, 0, 0, 7); c.fill();
      c.fillStyle = '#05030c'; c.beginPath(); c.ellipse(200, 250, 58, 46, 0, 0, 7); c.fill();
      eyes(c, E, [[200, 250, 0]], 20);
      glow(c, E.c, 30); c.fillStyle = E.c2; c.beginPath(); c.arc(300, 330, 20, 0, 7); c.fill(); noGlow(c);
    }
    finish(c, E, .22);
  }

  function make(key, fn) {
    if (cache[key]) return cache[key];
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    fn(cv.getContext('2d')); return cache[key] = cv;
  }
  /* characters are 3D models; these are stills baked from them (tools/bake.js) for cards, story scenes and battle sprites */
  const imgs = {};
  const who = id => G.HEROES[id] || G.NPC[id];
  A.url = (id, kind) => `img/${who(id).model}_${kind || 'bust'}.webp`;
  A.preload = () => { const files = new Set(); Object.values(G.HEROES).concat(Object.values(G.NPC)).forEach(h => files.add(h.model));
    return Promise.all([...files].flatMap(m => ['half', 'full'].map(k => new Promise(res => { const im = new Image(); im.onload = im.onerror = res; im.src = `img/${m}_${k}.webp`; imgs[m + k] = im; })))); };
  A.hero = (id, kind) => imgs[who(id).model + (kind || 'full')];
  /* a boss is a Hollow wearing a fallen hero's shape: the baked still, drained to shadow with element-coloured glow */
  A.boss = ch => { const b = G.CHAPTERS[ch].boss; if (b.hero) return A.hero(b.hero);
    const src = imgs[b.model + 'full'], E = G.EL[b.el];
    return make('b_' + ch, c => { c.drawImage(src, 0, 0, W, H); c.globalCompositeOperation = 'source-atop';
      c.fillStyle = 'rgba(14,8,30,.8)'; c.fillRect(0, 0, W, H);
      c.fillStyle = grad(c, 0, 0, W, 0, [rgba(E.c, .55), 'rgba(0,0,0,0)', rgba(E.c, .35)]); c.fillRect(0, 0, W, H);
      c.globalCompositeOperation = 'destination-over'; const g = c.createRadialGradient(200, 260, 20, 200, 260, 196);
      g.addColorStop(0, rgba(E.c, .5)); g.addColorStop(1, rgba(E.c, 0)); c.fillStyle = g; c.fillRect(0, 0, W, H); c.globalCompositeOperation = 'source-over'; }); };
  A.monster = (shape, el) => make('m_' + shape + el, c => monster(c, shape, el));

  /* soft glow dot sprites for particles */
  const dots = {};
  A.dot = col => {
    if (dots[col]) return dots[col];
    const cv = document.createElement('canvas'); cv.width = cv.height = 64; const c = cv.getContext('2d');
    const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, '#fff'); g.addColorStop(.25, col); g.addColorStop(1, rgba(col, 0));
    c.fillStyle = g; c.fillRect(0, 0, 64, 64); return dots[col] = cv;
  };
})();
