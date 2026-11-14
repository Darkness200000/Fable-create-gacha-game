/* Veilfall — real-time squad battles rendered on canvas */
(function () {
  /* shared additive particle system */
  function Parts() { this.a = []; }
  Parts.prototype = {
    add(p) { if (this.a.length < 700) this.a.push(p); },
    burst(x, y, col, n, spd, size, life, grav) {
      for (let i = 0; i < n; i++) { const an = Math.random() * 6.283, v = (0.25 + Math.random()) * spd;
        this.add({ x, y, vx: Math.cos(an) * v, vy: Math.sin(an) * v, l: 0, m: life * (0.5 + Math.random() * 0.7), s: size * (0.5 + Math.random()), c: col, g: grav || 0 }); }
    },
    step(dt) { const a = this.a; for (let i = a.length - 1; i >= 0; i--) { const p = a[i]; p.l += dt; if (p.l >= p.m) { a[i] = a[a.length - 1]; a.pop(); continue; }
      p.vy += p.g * dt; p.vx *= 1 - 1.6 * dt; p.vy *= 1 - 1.6 * dt; p.x += p.vx * dt; p.y += p.vy * dt; } },
    draw(c) { c.globalCompositeOperation = 'lighter';
      for (const p of this.a) { const k = 1 - p.l / p.m, s = p.s * (0.4 + k * 0.6); c.globalAlpha = k; c.drawImage(G.Art.dot(p.c), p.x - s, p.y - s, s * 2, s * 2); }
      c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; }
  };
  G.Parts = Parts;

  const B = G.Battle = { active: false }, cv = document.getElementById('stage'), c = cv.getContext('2d');
  let W = 0, H = 0, st = null, hud = {};
  const HS = [[.35, .43], [.15, .5], [.37, .6], [.16, .67]], ES = [[.65, .43], [.85, .5], [.63, .6], [.84, .67]];
  const BS = [[.68, .53], [.88, .42], [.87, .66]];
  const MELEE = { sword: 1, greatsword: 1, daggers: 1, lance: 1, scythe: 1, shield: 1 };

  B.resize = () => { const r = cv.parentNode.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1);
    W = r.width; H = r.height; cv.width = W * d; cv.height = H * d; c.setTransform(d, 0, 0, d, 0, 0); };

  function unit(side, o) {
    return Object.assign({ side, hp: o.maxhp, t: Math.random() * 0.7, energy: 0, lunge: null, flash: 0, dead: false, alpha: 1,
      stun: 0, shield: 0, atkUp: 0, bob: Math.random() * 6, enter: 1, scale: 1, x: 0, y: 0 }, o);
  }
  const alive = side => st.units.filter(u => u.side === side && !u.dead);
  const uh = u => Math.min(H * 0.17, W * 0.36) * u.scale;

  B.start = (n, done) => {
    const ch = n / 5 | 0, C = G.CHAPTERS[ch];
    B.resize();
    st = { n, ch, C, done, waves: G.WAVES[n % 5].split('|'), wave: -1, units: [], parts: new Parts(), nums: [], proj: [], ev: [], slashes: [],
      shake: 0, flash: 0, flashC: '#fff', cutin: null, over: false, banner: 0, bannerT: '', wait: 0, time: 0 };
    G.S.team.forEach((id, i) => { const h = G.HEROES[id], s = G.heroStats(id);
      st.units.push(unit(0, { id, name: h.name, el: h.el, maxhp: s.hp, atk: s.atk, interval: h.spd, sprite: G.Art.hero(id),
        ranged: !MELEE[h.look.weapon], ult: h.ult, slot: HS[i] })); });
    buildHud(); nextWave();
    cv.style.display = 'block'; B.active = true; G.Bg.set(C.pal);
  };
  B.stop = () => { B.active = false; st = null; cv.style.display = 'none'; };

  function nextWave() {
    st.wave++; st.units = st.units.filter(u => u.side === 0);
    const n = st.n, hs = 1 + 0.16 * n, as = 1 + 0.135 * n, code = st.waves[st.wave], hasBoss = code[0] === 'B';
    [...code].forEach((k, i) => {
      const el = st.C.els[(i + st.wave) % st.C.els.length];
      if (k === 'B') { const b = st.C.boss;
        st.units.push(unit(1, { name: b.name, el: b.el, maxhp: 5200 * hs, atk: 95 * as, interval: 2, sprite: G.Art.boss(st.ch), boss: true, scale: 1.75,
          ult: { name: 'Hollow Nova', aoe: true, pow: 1.5 }, slot: BS[0] }));
      } else { const e = G.ENEMIES[k];
        st.units.push(unit(1, { name: e.name, el, maxhp: e.hp * hs, atk: e.atk * as, interval: e.spd, sprite: G.Art.monster(e.shape, el), ranged: e.ranged,
          scale: e.shape === 'brute' ? 1.15 : e.shape === 'wisp' ? 0.8 : 0.95, slot: hasBoss ? BS[i] : ES[i] })); }
    });
    st.banner = 1.6; st.bannerT = hasBoss ? 'BOSS' : 'WAVE ' + (st.wave + 1);
    if (hasBoss) { st.shake = 14; G.Sfx.play('boom'); }
    hud.wave.textContent = `Wave ${st.wave + 1} / ${st.waves.length}`;
  }

  function buildHud() {
    const ui = document.getElementById('ui'), n = st.n;
    ui.innerHTML = `<div class="battle"><div class="b-top"><div><div class="b-name">${(n / 5 | 0) + 1}-${n % 5 + 1} · ${st.C.stages[n % 5]}</div><div class="b-wave"></div></div>
      <div class="b-btns"><button class="chip" id="bspd"></button><button class="chip" id="bauto">AUTO</button><button class="chip" id="bquit">✕</button></div></div>
      <div class="b-skills">${st.units.map((u, i) => `<button class="sk" data-i="${i}" style="--el:${G.EL[u.el].c}"><img src="${G.Art.url(u.id)}" alt=""><i class="ring"></i><em>ULT</em><b><u></u></b></button>`).join('')}</div></div>`;
    hud = { wave: ui.querySelector('.b-wave'), sk: [...ui.querySelectorAll('.sk')], spd: ui.querySelector('#bspd'), auto: ui.querySelector('#bauto') };
    const sync = () => { hud.spd.textContent = '×' + G.S.speed; hud.auto.classList.toggle('on', G.S.auto); };
    hud.spd.onclick = () => { G.S.speed = G.S.speed === 1 ? 2 : G.S.speed === 2 ? 3 : 1; G.save(); sync(); G.Sfx.play('click'); };
    hud.auto.onclick = () => { G.S.auto = !G.S.auto; G.save(); sync(); G.Sfx.play('click'); };
    ui.querySelector('#bquit').onclick = () => { if (st && !st.over) end(false, true); };
    hud.sk.forEach((b, i) => b.onclick = () => { const u = st.units[i]; if (u && u.side === 0) tryUlt(u); });
    sync();
  }

  function num(u, txt, col, big) { st.nums.push({ x: u.x + (Math.random() - .5) * 30, y: u.y - uh(u) * 0.8, t: 0, txt, col, big }); }
  function later(t, fn) { st.ev.push({ t, fn }); }

  function hit(a, tg, mult, isUlt) {
    if (tg.dead) return 0;
    const Ea = G.EL[a.el]; let d = a.atk * (a.atkUp > 0 ? 1.3 : 1) * mult * (0.92 + Math.random() * 0.16), adv = 0;
    if (Ea.beats === tg.el) { d *= 1.3; adv = 1; } else if (G.EL[tg.el].beats === a.el) d *= 0.8;
    const crit = Math.random() < 0.12; if (crit) d *= 1.6;
    if (tg.shield > 0) d *= 0.6;
    d = Math.round(d); tg.hp -= d; tg.flash = 0.16; tg.kb = 1;
    if (!isUlt) a.energy = Math.min(100, a.energy + 22); tg.energy = Math.min(100, tg.energy + 7);
    num(tg, d + (adv ? '▲' : ''), crit ? '#ffe45a' : adv ? Ea.c2 : '#ffffff', crit || isUlt);
    st.parts.burst(tg.x, tg.y - uh(tg) * 0.45, Ea.c, isUlt ? 26 : 9, isUlt ? 420 : 240, isUlt ? 16 : 10, 0.5);
    st.slashes.push({ x: tg.x, y: tg.y - uh(tg) * 0.45, a: Math.random() * 3.14, t: 0, c: Ea.c2, s: uh(tg) * (isUlt ? 0.9 : 0.5) });
    G.Sfx.play(crit || isUlt ? 'crit' : 'hit'); if (crit || isUlt) st.shake = Math.max(st.shake, isUlt ? 12 : 6);
    if (tg.hp <= 0) { tg.hp = 0; tg.dead = true; st.parts.burst(tg.x, tg.y - uh(tg) * 0.45, tg.side ? '#b48cff' : '#ffffff', 40, 380, 14, 0.9);
      if (tg.boss) { st.flash = 1; st.flashC = '#fff'; st.shake = 24; G.Sfx.play('boom'); G.Bg.pulse(1); } }
    return d;
  }
  function heal(u, amt) { if (u.dead) return; amt = Math.round(amt); u.hp = Math.min(u.maxhp, u.hp + amt); num(u, '+' + amt, '#7dffb0');
    for (let i = 0; i < 12; i++) st.parts.add({ x: u.x + (Math.random() - .5) * 60, y: u.y - Math.random() * uh(u) * 0.7, vx: 0, vy: -90 - Math.random() * 80, l: 0, m: 0.8, s: 9, c: '#7dffb0', g: 0 }); }

  function attack(u) {
    const foes = alive(1 - u.side); if (!foes.length) return;
    const tg = u.side === 0 ? foes[0] : (Math.random() < 0.6 ? foes[0] : foes[Math.random() * foes.length | 0]);
    if (u.ranged) { u.recoil = 1; st.proj.push({ a: u, tg, t: 0, d: 0.3, c: G.EL[u.el].c }); }
    else { u.lunge = { t: 0, d: 0.36, tg }; later(0.15, () => !u.dead && hit(u, tg, 1)); }
  }
  function tryUlt(u) { if (!st || st.over || st.cutin || u.dead || u.energy < 100 || u.stun > 0 || !alive(1).length) return;
    u.energy = 0; st.cutin = { u, t: 0, d: 1.05 }; G.Sfx.play('ult'); }
  function resolveUlt(u) {
    const ult = u.ult, foes = alive(1 - u.side), allies = alive(u.side), E = G.EL[u.el]; let total = 0;
    if (ult.pow) (ult.aoe ? foes : foes.slice(0, 1)).forEach(tg => { total += hit(u, tg, ult.pow, true); if (ult.stun && !tg.dead) tg.stun = tg.boss ? ult.stun * 0.5 : ult.stun; });
    if (ult.drain) heal(u, total * ult.drain);
    if (ult.heal) { allies.forEach(a => heal(a, u.atk * ult.heal)); G.Sfx.play('heal'); }
    if (ult.shield) allies.forEach(a => a.shield = ult.shield);
    if (ult.atkUp) allies.forEach(a => a.atkUp = ult.atkUp);
    st.flash = 0.7; st.flashC = E.c; st.shake = Math.max(st.shake, 16); G.Bg.pulse(0.8); G.Sfx.play('boom');
  }

  function end(win, quit) {
    if (st.over) return; st.over = true; const done = st.done;
    if (!quit) G.Sfx.play(win ? 'win' : 'lose');
    setTimeout(() => done(win, quit), quit ? 0 : 1300);
  }

  B.frame = (raw) => {
    if (!st) return;
    let dt = Math.min(raw, 0.05) * (G.S.speed || 1);
    st.time += raw;
    if (st.cutin) { st.cutin.t += raw; dt = 0; if (st.cutin.t >= st.cutin.d) { const u = st.cutin.u; st.cutin = null; resolveUlt(u); } }
    if (st.over) dt *= 0.35;
    // layout
    for (const u of st.units) { u.enter = Math.max(0, u.enter - raw * 2.2); const e = u.enter * u.enter;
      u.x = u.slot[0] * W + (u.side ? 1 : -1) * e * W * 0.5; u.y = (0.06 + u.slot[1] * 0.92) * H; }
    // timed events
    for (let i = st.ev.length - 1; i >= 0; i--) { const e = st.ev[i]; e.t -= dt; if (e.t <= 0) { st.ev.splice(i, 1); e.fn(); } }
    // units
    if (!st.over) for (const u of st.units) {
      if (u.dead) continue;
      u.shield = Math.max(0, u.shield - dt); u.atkUp = Math.max(0, u.atkUp - dt);
      if (u.stun > 0) { u.stun -= dt; continue; }
      if (u.enter > 0) continue;
      u.t += dt; if (u.t >= u.interval) { u.t = 0; attack(u); }
      if (u.energy >= 100) {
        if (u.side === 0) { if (G.S.auto) tryUlt(u); }
        else if (u.ult && !u.warn) { u.warn = 1; later(0.9, () => { u.warn = 0; if (!u.dead && st && !st.over) { u.energy = 0; resolveUlt(u); } }); }
      }
    }
    for (const u of st.units) {
      u.flash = Math.max(0, u.flash - dt); u.kb = Math.max(0, (u.kb || 0) - dt * 6); u.recoil = Math.max(0, (u.recoil || 0) - dt * 5);
      if (u.lunge) { u.lunge.t += dt; if (u.lunge.t >= u.lunge.d) u.lunge = null; }
      if (u.dead) u.alpha = Math.max(0, u.alpha - dt * 2.2);
    }
    for (let i = st.proj.length - 1; i >= 0; i--) { const p = st.proj[i]; p.t += dt;
      const k = Math.min(1, p.t / p.d), sx = p.a.x, sy = p.a.y - uh(p.a) * 0.5, tx = p.tg.x, ty = p.tg.y - uh(p.tg) * 0.45;
      p.x = sx + (tx - sx) * k; p.y = sy + (ty - sy) * k - Math.sin(k * 3.14) * 40;
      st.parts.add({ x: p.x, y: p.y, vx: 0, vy: 0, l: 0, m: 0.25, s: 9, c: p.c, g: 0 });
      if (k >= 1) { st.proj.splice(i, 1); if (!p.a.dead || true) hit(p.a, p.tg, 1); } }
    // ambient motes
    if (Math.random() < 0.25) st.parts.add({ x: Math.random() * W, y: H * (0.35 + Math.random() * 0.5), vx: (Math.random() - .5) * 20, vy: -20 - Math.random() * 30, l: 0, m: 2.5, s: 4 + Math.random() * 4, c: st.C.pal[2], g: 0 });
    st.parts.step(dt || raw * 0.3);
    for (let i = st.nums.length - 1; i >= 0; i--) { st.nums[i].t += raw; if (st.nums[i].t > 0.9) st.nums.splice(i, 1); }
    for (let i = st.slashes.length - 1; i >= 0; i--) { st.slashes[i].t += raw; if (st.slashes[i].t > 0.22) st.slashes.splice(i, 1); }
    st.shake *= Math.pow(0.002, raw); st.flash = Math.max(0, st.flash - raw * 2.2); st.banner = Math.max(0, st.banner - raw);
    // flow
    if (!st.over && !st.cutin) {
      if (!alive(0).length) end(false);
      else if (!alive(1).length && !st.proj.length) { if (st.wave >= st.waves.length - 1) end(true); else { st.wait += dt; if (st.wait > 0.8) { st.wait = 0; nextWave(); } } }
    }
    draw(); syncHud();
  };

  function syncHud() {
    hud.sk.forEach((b, i) => { const u = st.units[i]; if (!u || u.side) return;
      const e = Math.round(u.energy), h = Math.round(u.hp / u.maxhp * 100);
      if (b._e !== e) { b._e = e; b.style.setProperty('--e', e); b.classList.toggle('ready', e >= 100); }
      if (b._h !== h) { b._h = h; b.style.setProperty('--h', h + '%'); b.classList.toggle('dead', u.dead); } });
  }

  function draw() {
    const t = st.time, pal = st.C.pal, rgba = G.Art.rgba;
    c.clearRect(0, 0, W, H); c.save();
    if (st.shake > 0.3) c.translate((Math.random() - .5) * st.shake, (Math.random() - .5) * st.shake);
    // mirror floor
    const hz = H * 0.36; let g = c.createLinearGradient(0, hz, 0, H);
    g.addColorStop(0, rgba(pal[2], .16)); g.addColorStop(0.05, 'rgba(6,4,18,.55)'); g.addColorStop(1, 'rgba(4,2,12,.9)');
    c.fillStyle = g; c.fillRect(-20, hz, W + 40, H);
    c.strokeStyle = rgba(pal[2], .1); c.lineWidth = 1; c.beginPath();
    for (let i = -8; i <= 8; i++) { c.moveTo(W / 2 + i * W * 0.03, hz); c.lineTo(W / 2 + i * W * 0.3, H); }
    for (let i = 1; i < 8; i++) { const y = hz + (H - hz) * Math.pow(i / 8, 1.8); c.moveTo(-20, y); c.lineTo(W + 20, y); }
    c.stroke();
    g = c.createLinearGradient(0, hz - 2, 0, hz + 3); g.addColorStop(0, rgba(pal[2], 0)); g.addColorStop(.5, rgba(pal[2], .7)); g.addColorStop(1, rgba(pal[2], 0));
    c.fillStyle = g; c.fillRect(-20, hz - 2, W + 40, 5);

    const list = st.units.filter(u => u.alpha > 0).sort((a, b) => a.y - b.y);
    for (const u of list) {
      const h = uh(u), w = h * 400 / 520, E = G.EL[u.el]; let x = u.x, y = u.y + Math.sin(t * 2 + u.bob) * 3;
      const dir = u.side ? -1 : 1;
      if (u.lunge) { const p = Math.sin(Math.PI * u.lunge.t / u.lunge.d); x += (u.lunge.tg.x - u.x) * 0.62 * p; y += (u.lunge.tg.y - u.y) * 0.62 * p - p * 14; }
      x -= dir * ((u.kb || 0) * 9 + (u.recoil || 0) * 7);
      c.globalAlpha = u.alpha * 0.5; c.fillStyle = 'rgba(0,0,0,.6)'; c.beginPath(); c.ellipse(u.x, u.y, w * 0.34, h * 0.05, 0, 0, 7); c.fill();
      // reflection
      c.save(); c.globalAlpha = u.alpha * 0.13; c.translate(x, u.y + h * 0.02); c.scale(dir, -0.55); c.drawImage(u.sprite, -w / 2, -h * 0.93, w, h); c.restore();
      if (u.warn) { c.globalAlpha = 0.5 + 0.5 * Math.sin(t * 30); c.strokeStyle = '#ff4466'; c.lineWidth = 4; c.beginPath(); c.ellipse(u.x, u.y, w * 0.6, h * 0.1, 0, 0, 7); c.stroke(); }
      c.save(); c.globalAlpha = u.alpha; c.translate(x, y); c.scale(dir * (1 + (u.dead ? (1 - u.alpha) * 0.3 : 0)), 1);
      c.drawImage(u.sprite, -w / 2, -h * 0.93, w, h);
      if (u.flash > 0 || u.dead) { c.globalCompositeOperation = 'lighter'; c.globalAlpha = u.dead ? u.alpha : Math.min(1, u.flash * 6); c.drawImage(u.sprite, -w / 2, -h * 0.93, w, h); }
      c.restore(); c.globalAlpha = 1;
      if (u.dead) continue;
      if (u.shield > 0) { c.strokeStyle = rgba('#9fe8ff', .55 + .25 * Math.sin(t * 5)); c.lineWidth = 3; c.beginPath(); c.ellipse(x, y - h * 0.45, w * 0.44, h * 0.5, 0, 0, 7); c.stroke(); }
      if (u.stun > 0) for (let i = 0; i < 3; i++) { const a = t * 5 + i * 2.09; c.drawImage(G.Art.dot('#ffe45a'), x + Math.cos(a) * w * 0.25 - 8, y - h * 0.98 + Math.sin(a) * 5 - 8, 16, 16); }
      if (u.atkUp > 0) { c.fillStyle = '#ffb347'; c.font = `bold ${h * 0.11}px system-ui`; c.textAlign = 'center'; c.fillText('▲ATK', x, y - h * 1.06); }
      if (!u.boss) { const bw = w * 0.62, bx = u.x - bw / 2, by = u.y - h * 0.99;
        c.fillStyle = 'rgba(0,0,0,.6)'; c.fillRect(bx - 1, by - 1, bw + 2, 6);
        c.fillStyle = u.side ? '#ff5d73' : '#6dff9c'; c.fillRect(bx, by, bw * u.hp / u.maxhp, 4);
        c.fillStyle = E.c; c.beginPath(); c.arc(bx - 6, by + 2, 4, 0, 7); c.fill(); }
    }
    // projectiles, slashes, particles
    c.globalCompositeOperation = 'lighter';
    for (const p of st.proj) if (p.x) c.drawImage(G.Art.dot(p.c), p.x - 16, p.y - 16, 32, 32);
    for (const s of st.slashes) { const k = s.t / 0.22; c.save(); c.translate(s.x, s.y); c.rotate(s.a); c.globalAlpha = 1 - k;
      c.fillStyle = s.c; c.beginPath(); c.ellipse(0, 0, s.s * (0.4 + k), s.s * 0.07 * (1 - k), 0, 0, 7); c.fill();
      c.fillStyle = '#fff'; c.beginPath(); c.ellipse(0, 0, s.s * (0.3 + k * 0.8), s.s * 0.025 * (1 - k), 0, 0, 7); c.fill(); c.restore(); }
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    st.parts.draw(c);
    // numbers
    c.textAlign = 'center'; c.lineJoin = 'round';
    for (const n of st.nums) { const k = n.t / 0.9, sc = n.t < 0.12 ? 1 + (0.12 - n.t) * 6 : 1, fs = (n.big ? 26 : 19) * sc * Math.min(1.3, W / 400);
      c.globalAlpha = k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1; c.font = `900 ${fs}px system-ui, sans-serif`;
      c.lineWidth = 4; c.strokeStyle = 'rgba(10,5,25,.85)'; c.strokeText(n.txt, n.x, n.y - k * 46); c.fillStyle = n.col; c.fillText(n.txt, n.x, n.y - k * 46); }
    c.globalAlpha = 1;
    // boss bar
    const boss = st.units.find(u => u.boss && !u.dead);
    if (boss) { const bw = W * 0.74, bx = (W - bw) / 2, by = H * 0.135;
      c.font = `700 ${Math.min(16, W * 0.04)}px Georgia, serif`; c.fillStyle = '#fff'; c.fillText(boss.name, W / 2, by - 8);
      c.fillStyle = 'rgba(0,0,0,.6)'; c.fillRect(bx - 2, by - 2, bw + 4, 12);
      g = c.createLinearGradient(bx, 0, bx + bw, 0); g.addColorStop(0, '#ff3d6e'); g.addColorStop(1, G.EL[boss.el].c);
      c.fillStyle = g; c.fillRect(bx, by, bw * boss.hp / boss.maxhp, 8);
      c.fillStyle = rgba('#ffe45a', .9); c.fillRect(bx, by + 10, bw * boss.energy / 100, 2); }
    c.restore();
    if (st.flash > 0) { c.globalAlpha = st.flash * 0.55; c.fillStyle = st.flashC; c.fillRect(0, 0, W, H); c.globalAlpha = 1; }
    if (st.banner > 0) { const k = st.banner / 1.6, a = Math.min(1, (1 - k) * 6, k * 4);
      c.globalAlpha = a; c.fillStyle = 'rgba(5,3,15,.55)'; c.fillRect(0, H * 0.235, W, H * 0.07);
      c.font = `italic 900 ${W * 0.085}px Georgia, serif`; c.textAlign = 'center'; c.fillStyle = st.bannerT === 'BOSS' ? '#ff5d73' : '#fff';
      c.fillText(st.bannerT, W / 2 + (k - 0.5) * 60, H * 0.29); c.globalAlpha = 1; }
    if (st.cutin) cutin();
  }

  function cutin() {
    const q = st.cutin, k = q.t / q.d, u = q.u, E = G.EL[u.el], a = Math.min(1, k * 8, (1 - k) * 6), ease = 1 - Math.pow(1 - Math.min(1, k * 2.2), 3);
    c.globalAlpha = a * 0.7; c.fillStyle = '#04020c'; c.fillRect(0, 0, W, H);
    c.globalAlpha = a; c.save(); c.translate(W / 2, H * 0.47); c.rotate(-0.14);
    const bh = H * 0.3 * Math.min(1, k * 7); let g = c.createLinearGradient(-W, 0, W, 0);
    g.addColorStop(0, G.Art.rgba(E.c, .05)); g.addColorStop(.45, E.c); g.addColorStop(.55, E.c2); g.addColorStop(1, G.Art.rgba(E.c, .05));
    c.fillStyle = g; c.fillRect(-W, -bh / 2, W * 2, bh);
    c.fillStyle = 'rgba(255,255,255,.35)'; for (let i = 0; i < 14; i++) { const y = ((i * 37) % 100 / 100 - .5) * bh, x = ((q.t * (900 + i * 130) + i * 211) % (W * 2.4)) - W * 1.2; c.fillRect(x, y, 120 + i * 9, 2); }
    c.restore();
    const h = H * 0.5, w = h * 400 / 520, x = -w + (W * 0.3 + w) * ease + k * 26;
    c.drawImage(u.sprite, x - w / 2, H * 0.47 - h * 0.52, w, h);
    c.textAlign = 'right'; c.font = `italic 900 ${W * 0.078}px Georgia, serif`; c.lineWidth = 6; c.strokeStyle = 'rgba(8,4,20,.9)'; c.lineJoin = 'round';
    const tx = W * 1.5 - (W * 0.55) * ease - k * 20;
    c.strokeText(u.ult.name, tx, H * 0.6); c.fillStyle = '#fff'; c.fillText(u.ult.name, tx, H * 0.6);
    c.font = `700 ${W * 0.036}px system-ui`; c.fillStyle = E.c2; c.strokeText(u.name.toUpperCase(), tx, H * 0.6 + W * 0.055); c.fillText(u.name.toUpperCase(), tx, H * 0.6 + W * 0.055);
    c.globalAlpha = 1;
  }
})();
