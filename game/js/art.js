/* Veilfall — procedural character painter. Everything is drawn in code, no image assets. */
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

  const BEHIND = { greatsword: 1, staff: 1, scythe: 1, lance: 1, bow: 1 };

  function weapon(c, L, E) {
    const metal = grad(c, -10, 0, 10, 0, ['#f4f7ff', '#9aa6c8', '#e9eeff']);
    c.save();
    switch (L.weapon) {
      case 'sword':
        c.translate(272, 378); c.rotate(0.55);
        glow(c, E.c, 18); c.fillStyle = grad(c, 0, -170, 0, 0, [E.c2, '#ffffff', '#c9d2f0']);
        c.beginPath(); c.moveTo(-9, -18); c.lineTo(-9, -140); c.lineTo(0, -168); c.lineTo(9, -140); c.lineTo(9, -18); c.fill(); noGlow(c);
        c.fillStyle = E.c; c.fillRect(-24, -22, 48, 9); c.fillStyle = '#3a2a22'; c.fillRect(-5, -14, 10, 30);
        c.fillStyle = E.c2; c.beginPath(); c.arc(0, 18, 7, 0, 7); c.fill(); break;
      case 'greatsword':
        c.translate(205, 330); c.rotate(-0.72);
        glow(c, E.c, 22); c.fillStyle = grad(c, -20, 0, 20, 0, [dark(E.c, .3), E.c2, '#fff', E.c]);
        c.beginPath(); c.moveTo(-19, 10); c.lineTo(-19, -230); c.lineTo(0, -272); c.lineTo(19, -230); c.lineTo(19, 10); c.fill(); noGlow(c);
        c.fillStyle = '#2a2233'; c.fillRect(-36, 8, 72, 13); c.fillRect(-6, 20, 12, 60);
        c.fillStyle = E.c; c.beginPath(); c.arc(0, 14, 9, 0, 7); c.fill(); break;
      case 'staff':
        c.strokeStyle = grad(c, 0, 110, 0, 490, ['#e8d9b0', '#6b5136']); c.lineWidth = 9; c.lineCap = 'round';
        c.beginPath(); c.moveTo(292, 488); c.lineTo(306, 130); c.stroke();
        glow(c, E.c, 30); c.strokeStyle = E.c2; c.lineWidth = 7; c.beginPath(); c.arc(308, 96, 30, 0.9, 5.4); c.stroke();
        c.fillStyle = grad(c, 290, 80, 325, 115, ['#fff', E.c]); c.beginPath(); c.arc(308, 96, 15, 0, 7); c.fill(); noGlow(c); break;
      case 'scythe':
        c.strokeStyle = grad(c, 0, 60, 0, 490, ['#c9c2e8', '#3a2f55']); c.lineWidth = 9; c.lineCap = 'round';
        c.beginPath(); c.moveTo(310, 490); c.lineTo(286, 70); c.stroke();
        glow(c, E.c, 28); c.fillStyle = grad(c, 80, 40, 290, 110, ['#fff', E.c2, E.c]);
        c.beginPath(); c.moveTo(292, 62); c.quadraticCurveTo(170, 6, 70, 96); c.quadraticCurveTo(180, 62, 286, 108); c.fill(); noGlow(c); break;
      case 'lance':
        c.translate(200, 300); c.rotate(0.5);
        c.strokeStyle = '#4a4660'; c.lineWidth = 9; c.lineCap = 'round'; c.beginPath(); c.moveTo(0, 200); c.lineTo(0, -210); c.stroke();
        glow(c, E.c, 22); c.fillStyle = grad(c, -16, 0, 16, 0, [E.c, '#fff', E.c2]);
        c.beginPath(); c.moveTo(0, -282); c.lineTo(17, -214); c.lineTo(0, -196); c.lineTo(-17, -214); c.fill(); noGlow(c);
        c.fillStyle = E.c; c.fillRect(-12, -200, 24, 8); break;
      case 'bow':
        c.translate(110, 345);
        glow(c, E.c, 16); c.strokeStyle = grad(c, 0, -120, 0, 120, [E.c2, E.c, E.c2]); c.lineWidth = 10; c.lineCap = 'round';
        c.beginPath(); c.moveTo(22, -120); c.quadraticCurveTo(-58, 0, 22, 120); c.stroke(); noGlow(c);
        c.strokeStyle = 'rgba(255,255,255,.8)'; c.lineWidth = 2; c.beginPath(); c.moveTo(22, -120); c.lineTo(22, 120); c.stroke(); break;
      case 'shield':
        c.translate(138, 372);
        c.fillStyle = grad(c, -50, -60, 50, 70, [light(E.c, .3), E.c, dark(E.c, .55)]);
        c.beginPath(); c.moveTo(0, -66); c.quadraticCurveTo(52, -60, 52, -26); c.quadraticCurveTo(50, 44, 0, 76); c.quadraticCurveTo(-50, 44, -52, -26); c.quadraticCurveTo(-52, -60, 0, -66); c.fill();
        c.strokeStyle = E.c2; c.lineWidth = 5; c.stroke();
        glow(c, E.c2, 14); c.fillStyle = E.c2; c.beginPath(); c.moveTo(0, -30); c.lineTo(16, 2); c.lineTo(0, 34); c.lineTo(-16, 2); c.fill(); noGlow(c); break;
      case 'daggers':
        [[130, 382, -0.6], [270, 382, 0.6]].forEach(p => {
          c.save(); c.translate(p[0], p[1]); c.rotate(p[2]);
          glow(c, E.c, 14); c.fillStyle = grad(c, 0, -80, 0, 0, ['#fff', E.c2]);
          c.beginPath(); c.moveTo(-7, -10); c.lineTo(0, -84); c.lineTo(7, -10); c.fill(); noGlow(c);
          c.fillStyle = '#2a2233'; c.fillRect(-13, -12, 26, 6); c.fillRect(-4, -8, 8, 22); c.restore();
        }); break;
      case 'orb':
        glow(c, E.c, 40); const g = c.createRadialGradient(112, 318, 2, 118, 326, 34);
        g.addColorStop(0, '#fff'); g.addColorStop(.45, E.c2); g.addColorStop(1, E.c);
        c.fillStyle = g; c.beginPath(); c.arc(118, 326, 30, 0, 7); c.fill(); noGlow(c);
        c.strokeStyle = rgba(E.c2, .7); c.lineWidth = 3; c.beginPath(); c.ellipse(118, 326, 46, 14, -0.4, 0, 7); c.stroke(); break;
      case 'tome':
        c.translate(128, 372); c.rotate(-0.25);
        c.fillStyle = dark(E.c, .45); c.fillRect(-38, -30, 76, 58);
        c.fillStyle = '#fdf6e3'; c.fillRect(-33, -34, 66, 54);
        c.strokeStyle = '#c9b98f'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, -34); c.lineTo(0, 20); c.stroke();
        glow(c, E.c, 16); c.fillStyle = E.c; for (let i = 0; i < 3; i++) { c.fillRect(-27, -24 + i * 13, 20, 4); c.fillRect(7, -24 + i * 13, 20, 4); } noGlow(c); break;
    }
    c.restore();
  }

  function chibi(c, L) {
    const E = G.EL[L.el], c1 = L.c1 || mix(dark(E.c, .6), '#34346a', .4), c2 = L.c2 || E.c;
    const hollow = !!L.hollow, skin = hollow ? '#171022' : (L.skin || '#ffe3cf');
    const hair = L.hairC || '#444', hairD = dark(hair, .45), hairL = light(hair, .45), eye = L.eye || E.c;
    if (BEHIND[L.weapon]) weapon(c, L, E);

    // cape
    if (L.cape) {
      c.fillStyle = grad(c, 0, 280, 0, 490, [dark(c2, .35), dark(c1, .3)]);
      c.beginPath(); c.moveTo(146, 286); c.quadraticCurveTo(88, 380, 92, 478);
      c.lineTo(122, 462); c.lineTo(150, 484); c.lineTo(178, 464); c.lineTo(200, 486); c.lineTo(222, 464); c.lineTo(250, 484); c.lineTo(278, 462); c.lineTo(308, 478);
      c.quadraticCurveTo(312, 380, 254, 286); c.fill();
    }
    // back hair
    c.fillStyle = grad(c, 0, 100, 0, 440, [hair, hairD]);
    if (L.hair === 'long') {
      c.beginPath(); c.moveTo(104, 180); c.quadraticCurveTo(70, 330, 108, 440); c.lineTo(134, 410); c.lineTo(150, 446); c.lineTo(172, 300);
      c.lineTo(228, 300); c.lineTo(250, 446); c.lineTo(266, 410); c.lineTo(292, 440); c.quadraticCurveTo(330, 330, 296, 180); c.fill();
    } else if (L.hair === 'twin') {
      [-1, 1].forEach(s => { c.beginPath(); c.moveTo(200 + s * 84, 170); c.quadraticCurveTo(200 + s * 170, 200, 200 + s * 150, 330);
        c.quadraticCurveTo(200 + s * 140, 390, 200 + s * 118, 410); c.quadraticCurveTo(200 + s * 118, 300, 200 + s * 78, 232); c.fill(); });
    } else if (L.hair === 'pony') {
      c.beginPath(); c.moveTo(262, 120); c.quadraticCurveTo(360, 130, 340, 270); c.quadraticCurveTo(332, 340, 300, 372); c.quadraticCurveTo(318, 250, 264, 196); c.fill();
    }
    // legs + boots
    c.fillStyle = dark(c1, .3); c.fillRect(170, 420, 24, 56); c.fillRect(206, 420, 24, 56);
    c.fillStyle = dark(c2, .5);
    [[182, 482], [218, 482]].forEach(p => { c.beginPath(); c.ellipse(p[0], p[1], 19, 12, 0, 0, 7); c.fill(); });
    // body / tunic
    c.fillStyle = grad(c, 140, 280, 260, 450, [light(c1, .12), c1, dark(c1, .35)]);
    c.beginPath(); c.moveTo(152, 290); c.quadraticCurveTo(200, 268, 248, 290); c.quadraticCurveTo(262, 372, 274, 436);
    c.quadraticCurveTo(200, 462, 126, 436); c.quadraticCurveTo(138, 372, 152, 290); c.fill();
    // trim
    c.strokeStyle = c2; c.lineWidth = 5; c.beginPath(); c.moveTo(128, 432); c.quadraticCurveTo(200, 458, 272, 432); c.stroke();
    c.lineWidth = 3; c.beginPath(); c.moveTo(200, 296); c.lineTo(200, 444); c.stroke();
    c.fillStyle = dark(c2, .3); c.fillRect(146, 356, 108, 12);
    glow(c, c2, 16); c.fillStyle = light(c2, .4); c.beginPath(); c.moveTo(200, 292); c.lineTo(212, 308); c.lineTo(200, 324); c.lineTo(188, 308); c.fill();
    c.beginPath(); c.arc(200, 362, 8, 0, 7); c.fill(); noGlow(c);
    // arms + hands
    c.fillStyle = grad(c, 0, 290, 0, 380, [light(c1, .15), dark(c1, .2)]);
    [[142, 332, 0.28], [258, 332, -0.28]].forEach(p => { c.beginPath(); c.ellipse(p[0], p[1], 19, 46, p[2], 0, 7); c.fill(); });
    c.fillStyle = c2; [[148, 296], [252, 296]].forEach(p => { c.beginPath(); c.ellipse(p[0], p[1], 24, 15, 0, 0, 7); c.fill(); });
    c.fillStyle = skin; [[132, 378], [268, 378]].forEach(p => { c.beginPath(); c.arc(p[0], p[1], 14, 0, 7); c.fill(); });

    // hood shell (behind face)
    if (L.hair === 'hood') {
      c.fillStyle = grad(c, 100, 80, 300, 300, [light(hair, .2), hair, hairD]);
      c.beginPath(); c.moveTo(200, 62); c.quadraticCurveTo(318, 74, 312, 214); c.quadraticCurveTo(306, 280, 262, 300); c.lineTo(138, 300);
      c.quadraticCurveTo(94, 280, 88, 214); c.quadraticCurveTo(82, 74, 200, 62); c.fill();
    }
    // head
    c.fillStyle = hollow ? skin : grad(c, 0, 110, 0, 290, [light(skin, .2), skin, mix(skin, '#e8a58c', .45)]);
    c.beginPath(); c.ellipse(200, 196, 90, 86, 0, 0, 7); c.fill();
    // face
    [165, 235].forEach((x, i) => {
      if (hollow) {
        glow(c, E.c, 26); c.fillStyle = E.c2; c.beginPath(); c.moveTo(x - 20, 196 + (i ? 10 : -4)); c.quadraticCurveTo(x, 186, x + 20, 196 + (i ? -4 : 10));
        c.quadraticCurveTo(x, 226, x - 20, 196 + (i ? 10 : -4)); c.fill(); noGlow(c); return;
      }
      c.fillStyle = '#2a1e2e'; c.beginPath(); c.ellipse(x, 208, 17, 23, 0, 0, 7); c.fill();
      const g = c.createLinearGradient(0, 188, 0, 230); g.addColorStop(0, dark(eye, .5)); g.addColorStop(.55, eye); g.addColorStop(1, light(eye, .55));
      c.fillStyle = g; c.beginPath(); c.ellipse(x, 210, 13.5, 19.5, 0, 0, 7); c.fill();
      c.fillStyle = '#1a1020'; c.beginPath(); c.ellipse(x, 208, 6, 10, 0, 0, 7); c.fill();
      c.fillStyle = '#fff'; c.beginPath(); c.ellipse(x - 5, 199, 5.5, 7, -0.3, 0, 7); c.fill();
      c.beginPath(); c.arc(x + 6, 220, 2.6, 0, 7); c.fill();
      c.strokeStyle = '#2a1e2e'; c.lineWidth = 4; c.lineCap = 'round'; c.beginPath(); c.moveTo(x - 19, 192); c.quadraticCurveTo(x, 178, x + 19, 192); c.stroke();
      c.strokeStyle = hairD; c.lineWidth = 3.5; c.beginPath(); c.moveTo(x - 16 + i * 6, 170 + (i ? 0 : 3)); c.lineTo(x + 10 + i * 6, 170 + (i ? 3 : 0)); c.stroke();
    });
    if (!hollow) {
      c.fillStyle = 'rgba(255,120,130,.32)'; [[146, 236], [254, 236]].forEach(p => { c.beginPath(); c.ellipse(p[0], p[1], 15, 8, 0, 0, 7); c.fill(); });
      c.strokeStyle = '#8a4a4a'; c.lineWidth = 3; c.lineCap = 'round'; c.beginPath(); c.moveTo(191, 246); c.quadraticCurveTo(200, 253, 209, 246); c.stroke();
    } else {
      glow(c, E.c, 10); c.strokeStyle = rgba(E.c, .8); c.lineWidth = 2.5;
      c.beginPath(); c.moveTo(200, 232); c.lineTo(192, 250); c.lineTo(204, 262); c.lineTo(198, 278); c.stroke(); noGlow(c);
    }
    // front hair
    c.fillStyle = grad(c, 0, 90, 0, 220, [light(hair, .18), hair, hairD]);
    if (L.hair === 'hood') {
      c.beginPath(); c.moveTo(108, 190); c.quadraticCurveTo(110, 96, 200, 92); c.quadraticCurveTo(290, 96, 292, 190);
      c.quadraticCurveTo(260, 138, 200, 150); c.quadraticCurveTo(140, 138, 108, 190); c.fill();
    } else {
      c.beginPath(); c.moveTo(106, 214); c.quadraticCurveTo(92, 96, 200, 92); c.quadraticCurveTo(308, 96, 294, 214);
      c.quadraticCurveTo(286, 180, 272, 158); c.lineTo(262, 196); c.lineTo(240, 150); c.lineTo(222, 190); c.lineTo(200, 146); c.lineTo(176, 192); c.lineTo(158, 150); c.lineTo(138, 198); c.lineTo(128, 158);
      c.quadraticCurveTo(112, 180, 106, 214); c.fill();
      if (L.hair === 'spiky') {
        c.beginPath(); c.moveTo(118, 140); c.lineTo(96, 84); c.lineTo(150, 108); c.lineTo(160, 52); c.lineTo(204, 96); c.lineTo(246, 50); c.lineTo(254, 106); c.lineTo(306, 86); c.lineTo(282, 142); c.fill();
      }
      if (L.hair === 'bob') { c.beginPath(); c.moveTo(106, 200); c.quadraticCurveTo(96, 262, 126, 276); c.quadraticCurveTo(118, 232, 122, 190); c.fill();
        c.beginPath(); c.moveTo(294, 200); c.quadraticCurveTo(304, 262, 274, 276); c.quadraticCurveTo(282, 232, 278, 190); c.fill(); }
      c.strokeStyle = hairL; c.globalAlpha = .55; c.lineWidth = 6; c.lineCap = 'round';
      c.beginPath(); c.arc(200, 190, 78, -2.25, -1.25); c.stroke(); c.globalAlpha = 1;
    }
    // accessories
    switch (L.acc) {
      case 'halo': glow(c, E.c2, 26); c.strokeStyle = '#fff6cf'; c.lineWidth = 8; c.beginPath(); c.ellipse(200, 60, 62, 15, 0, 0, 7); c.stroke(); noGlow(c); break;
      case 'horns': [-1, 1].forEach(s => { c.fillStyle = grad(c, 0, 40, 0, 140, [E.c2, dark(E.c, .6)]);
        c.beginPath(); c.moveTo(200 + s * 58, 122); c.quadraticCurveTo(200 + s * 122, 96, 200 + s * 104, 30); c.quadraticCurveTo(200 + s * 92, 84, 200 + s * 34, 104); c.fill(); }); break;
      case 'crown': glow(c, E.c2, 18); c.fillStyle = grad(c, 0, 50, 0, 108, ['#fff6c2', '#e3a83a']);
        c.beginPath(); c.moveTo(152, 106); c.lineTo(146, 54); c.lineTo(174, 82); c.lineTo(200, 40); c.lineTo(226, 82); c.lineTo(254, 54); c.lineTo(248, 106); c.fill(); noGlow(c);
        c.fillStyle = E.c; c.beginPath(); c.arc(200, 84, 8, 0, 7); c.fill(); break;
      case 'sprout': c.strokeStyle = '#3c9a4c'; c.lineWidth = 6; c.lineCap = 'round'; c.beginPath(); c.moveTo(200, 96); c.quadraticCurveTo(196, 66, 204, 46); c.stroke();
        c.fillStyle = '#7de06a'; [[-1, 0.5], [1, -0.5]].forEach(p => { c.save(); c.translate(204, 48); c.rotate(p[1]); c.beginPath(); c.ellipse(p[0] * 24, -6, 26, 13, 0, 0, 7); c.fill(); c.restore(); }); break;
      case 'hat': c.fillStyle = grad(c, 0, 0, 0, 130, [c1, dark(c1, .3)]);
        c.beginPath(); c.moveTo(128, 120); c.quadraticCurveTo(180, 70, 236, 2); c.quadraticCurveTo(250, 80, 276, 120); c.fill();
        c.beginPath(); c.ellipse(200, 122, 128, 24, -0.06, 0, 7); c.fill();
        c.strokeStyle = c2; c.lineWidth = 9; c.beginPath(); c.moveTo(136, 112); c.quadraticCurveTo(200, 128, 270, 110); c.stroke(); break;
      case 'ears': [-1, 1].forEach(s => { c.fillStyle = hair; c.beginPath(); c.moveTo(200 + s * 88, 138); c.lineTo(200 + s * 84, 50); c.lineTo(200 + s * 30, 100); c.fill();
        c.fillStyle = '#ffc9d6'; c.beginPath(); c.moveTo(200 + s * 76, 120); c.lineTo(200 + s * 76, 74); c.lineTo(200 + s * 48, 102); c.fill(); }); break;
    }
    if (!BEHIND[L.weapon]) weapon(c, L, E);
    finish(c, E);
  }

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
  A.hero = id => make('h_' + id, c => { const h = G.HEROES[id] || G.NPC[id]; chibi(c, Object.assign({ el: h.el }, h.look)); });
  A.boss = ch => { const b = G.CHAPTERS[ch].boss; return b.hero ? A.hero(b.hero) : make('b_' + ch, c => chibi(c, Object.assign({ el: b.el }, b.look))); };
  A.monster = (shape, el) => make('m_' + shape + el, c => monster(c, shape, el));
  A.url = id => urls[id] || (urls[id] = A.hero(id).toDataURL());

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
