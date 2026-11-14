/* Veilfall — save state, screens, story, summoning */
(function () {
  const $ = s => document.querySelector(s), ui = $('#ui'), KEY = 'veilfall_save_v1', MAXLV = 50;
  const fresh = () => ({ dust: 1600, gold: 2000, heroes: { kael: { lv: 1, asc: 0, shards: 0 } }, team: ['kael'], prog: 0, seen: {}, pity: 0, mute: false, auto: true, speed: 1 });
  let S, backFn = null;
  try { S = Object.assign(fresh(), JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { S = fresh(); }
  G.S = S;
  G.save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };
  G.heroStats = id => { const h = G.HEROES[id], o = S.heroes[id] || { lv: 1, asc: 0 }, m = (1 + 0.07 * (o.lv - 1)) * (1 + 0.12 * o.asc);
    const hp = Math.round(h.hp * m), atk = Math.round(h.atk * m); return { hp, atk, power: Math.round(atk * 4 + hp * 0.5) }; };
  const lvCost = lv => Math.round(2 * Math.pow(lv, 1.3)) * 10;
  const teamPower = () => S.team.reduce((a, id) => a + G.heroStats(id).power, 0);
  const recPower = n => Math.round(26 * (1 + 0.16 * n)) * 100;
  function grant(id) { if (S.heroes[id]) { S.heroes[id].shards++; return false; }
    S.heroes[id] = { lv: 1, asc: 0, shards: 0 }; if (S.team.length < 4) S.team.push(id); return true; }
  G.back = () => { if (backFn) backFn(); }; G.canBack = () => !!backFn;

  const stars = n => '★'.repeat(n), fmt = n => n.toLocaleString('en-US');
  const click = () => G.Sfx.play('click');
  function toast(msg) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; $('#app').appendChild(t); setTimeout(() => t.remove(), 2600); }
  function top(title, back) { backFn = back || null;
    return `<div class="top">${back ? '<button class="chip" id="back">‹ Back</button>' : '<span class="brand">VEILFALL</span>'}<span class="ttl">${title || ''}</span>
      <span class="cur"><i class="d"></i>${fmt(S.dust)}</span><span class="cur"><i class="g"></i>${fmt(S.gold)}</span></div>`; }
  function bind(map) { for (const k in map) { const e = ui.querySelector(k); if (e) e.onclick = ev => { click(); map[k](ev); }; }
    const b = ui.querySelector('#back'); if (b) b.onclick = () => { click(); backFn(); }; }
  const elChip = el => `<span class="el" style="--el:${G.EL[el].c}"><i></i>${G.EL[el].name}</span>`;
  function card(id, extra) { const h = G.HEROES[id], o = S.heroes[id];
    return `<button class="card r${h.rar} ${o ? '' : 'locked'}" data-id="${id}" style="--el:${G.EL[h.el].c}"><img src="${G.Art.url(id)}" alt="">
      <span class="st">${stars(h.rar)}</span>${o ? `<span class="lv">Lv ${o.lv}</span>` : ''}${S.team.includes(id) ? '<span class="tm">TEAM</span>' : ''}<b>${o || extra ? h.name : '???'}</b>${extra || ''}</button>`; }

  /* ---------- title ---------- */
  function title() {
    G.Bg.set(G.HOME_PAL); backFn = null;
    ui.innerHTML = `<div class="title"><div class="logo"><small>✦ Echoes of the Last Star ✦</small><h1>VEILFALL</h1></div>
      <img class="hero-art float" src="${G.Art.url('lyra')}" alt=""><div class="tap">TAP TO BEGIN</div><div class="ver">Act I · v1.0</div></div>`;
    ui.firstChild.onclick = () => { G.Sfx.play('reveal'); G.Sfx.music();
      if (!S.seen.pro) story(G.PROLOGUE, () => { S.seen.pro = 1; G.save(); home(); }); else home(); };
  }

  /* ---------- home ---------- */
  function home() {
    G.Bg.set(G.HOME_PAL);
    const lead = S.team[0], h = G.HEROES[lead], owned = Object.keys(S.heroes).length, ch = Math.min(4, S.prog / 5 | 0);
    const hint = owned <= 1 && S.dust >= 1600 ? 'The Star Altar is glowing! Call your first Echoes — a ten-call always brings a rare one.'
      : S.prog === 0 ? 'Your Echoes are ready. The Ashen Vale is waiting — tap Story!'
      : S.prog >= 25 ? 'The sky is awake again. Replay any stage to grow stronger, Caller.'
      : `Next: ${G.CHAPTERS[ch].name}. If a fight feels rough, level up your Echoes first!`;
    ui.innerHTML = top() + `<div class="home">
      <div class="lyra"><img src="${G.Art.url('lyra')}" alt=""><p><b>Lyra</b>${hint}</p></div>
      <div class="feature"><img class="hero-art float" src="${G.Art.url(lead)}" alt=""><div class="fname"><span class="st r${h.rar}">${stars(h.rar)}</span><h2>${h.name}</h2><em>${h.title}</em></div></div>
      <div class="nav"><button class="btn big" id="nStory"><small>Chapter ${ch + 1}</small>STORY</button>
        <div class="row"><button class="btn alt ${owned <= 1 ? 'pulse' : ''}" id="nSummon">SUMMON</button><button class="btn alt" id="nEchoes">ECHOES</button></div>
        <button class="link" id="nMute">${S.mute ? 'Sound: off' : 'Sound: on'}</button></div></div>`;
    bind({ '#nStory': () => map(ch), '#nSummon': summon, '#nEchoes': echoes,
      '#nMute': () => { S.mute = !S.mute; G.Sfx.mute(S.mute); G.save(); home(); } });
  }

  /* ---------- story map ---------- */
  function map(ch) {
    const C = G.CHAPTERS[ch], open = S.prog >= ch * 5; G.Bg.set(C.pal);
    ui.innerHTML = top('Story', home) + `<div class="map"><div class="chead"><button class="chip" id="cp" ${ch ? '' : 'disabled'}>‹</button>
      <div><small>CHAPTER ${ch + 1}</small><h2>${C.name}</h2><em>${C.sub}</em></div><button class="chip" id="cn" ${ch < 4 ? '' : 'disabled'}>›</button></div>
      <div class="bossprev" style="--el:${G.EL[C.boss.el].c}"><img class="float" src="${G.Art.boss(ch).toDataURL()}" alt=""><span>${S.prog >= ch * 5 + 5 ? C.boss.name.toUpperCase() + ' · DEFEATED' : 'SOMETHING WAITS AT THE END'}</span></div>
      <div class="stages">${open ? C.stages.map((nm, s) => { const n = ch * 5 + s, done = n < S.prog, lock = n > S.prog;
        return `<button class="stage ${done ? 'done' : ''} ${lock ? 'lock' : ''} ${s === 4 ? 'boss' : ''}" data-n="${n}" ${lock ? 'disabled' : ''}>
          <span class="num">${ch + 1}-${s + 1}</span><span class="nm">${nm}${s === 4 ? ' <i>BOSS</i>' : ''}<small>Power ${fmt(recPower(n))} · ${C.els.map(e => G.EL[e].name).join(' / ')}</small></span>
          <span class="go">${lock ? '🔒' : done ? '✓' : 'GO'}</span></button>`; }).join('')
        : '<div class="locked-ch">Clear the previous chapter to lift this part of the Veil.</div>'}</div>
      <div class="tp">Team power <b>${fmt(teamPower())}</b></div></div>`;
    bind({ '#cp': () => map(ch - 1), '#cn': () => map(ch + 1) });
    ui.querySelectorAll('.stage').forEach(b => b.onclick = () => { click(); startStage(+b.dataset.n); });
  }

  function startStage(n) {
    const ch = n / 5 | 0, s = n % 5, C = G.CHAPTERS[ch], q = [];
    if (s === 0 && !S.seen['i' + ch]) q.push(next => story(C.intro, () => { S.seen['i' + ch] = 1;
      if (C.gift) { const isNew = grant(C.gift); toast(G.HEROES[C.gift].name + (isNew ? ' joined your Echoes!' : ' — Echo shard gained')); }
      G.save(); next(); }, C.pal));
    if (s === 4 && !S.seen['p' + ch]) q.push(next => story(C.pre, () => { S.seen['p' + ch] = 1; G.save(); next(); }, C.pal));
    q.push(() => G.Battle.start(n, (win, quit) => { G.Battle.stop(); quit ? map(ch) : result(n, win); }));
    (function run() { const f = q.shift(); f && f(run); })();
  }

  function result(n, win) {
    const ch = n / 5 | 0, s = n % 5, first = win && n >= S.prog; let gold = 0, dust = 0;
    if (win) { gold = (300 + 120 * n) * (first ? 2 : 1); dust = first ? (s === 4 ? 300 : 80) : 10; S.gold += gold; S.dust += dust; S.prog = Math.max(S.prog, n + 1); G.save(); }
    backFn = null;
    ui.innerHTML = `<div class="result ${win ? 'win' : 'lose'}"><div class="panel pop"><h1>${win ? 'VICTORY' : 'DEFEAT'}</h1>
      ${win ? `<p>${first ? 'First clear bonus!' : 'Stage cleared again.'}</p><div class="rew"><span class="cur"><i class="d"></i>+${fmt(dust)}</span><span class="cur"><i class="g"></i>+${fmt(gold)}</span></div>`
        : '<p>Your Echoes fade back into the lantern...<br>Level them up, ascend them, or try a different team.</p>'}
      <button class="btn" id="rOk">${win ? 'CONTINUE' : 'RETRY'}</button>${win ? '' : '<button class="link" id="rBack">Back to map</button>'}</div></div>`;
    if (win) G.fxBurst(.5, .4, '#ffcf5a', 70);
    bind({ '#rBack': () => map(ch), '#rOk': () => {
      if (!win) return startStage(n);
      if (first && s === 4) return story(G.CHAPTERS[ch].outro, () => {
        if (ch === 4) { grant('vesper'); G.save(); reveal([{ id: 'vesper', isNew: true }], home); } else map(ch + 1); }, G.CHAPTERS[ch].pal);
      map(ch); } });
  }

  /* ---------- visual-novel story scenes ---------- */
  function story(lines, done, pal) {
    if (pal) G.Bg.set(pal); let i = -1, typing = null, full = '';
    ui.innerHTML = `<div class="vn"><button class="chip skip">Skip ›</button><img class="vn-art" alt=""><div class="vn-narr"></div>
      <div class="vn-box"><div class="vn-name"></div><p></p><span class="vn-next">▼</span></div></div>`;
    const art = ui.querySelector('.vn-art'), nm = ui.querySelector('.vn-name'), p = ui.querySelector('.vn-box p'), box = ui.querySelector('.vn-box'), narr = ui.querySelector('.vn-narr');
    const fin = () => { clearInterval(typing); typing = null; backFn = null; done(); };
    backFn = fin;
    function next() {
      if (typing) { clearInterval(typing); typing = null; (lines[i][0] ? p : narr).textContent = full; return; }
      if (++i >= lines.length) return fin();
      const [sp, txt] = lines[i], who = G.HEROES[sp] || G.NPC[sp]; full = txt;
      const tgt = sp ? p : narr; box.style.display = sp ? '' : 'none'; narr.style.display = sp ? 'none' : ''; tgt.textContent = '';
      if (sp) { nm.textContent = who ? who.name : sp; nm.style.setProperty('--el', who ? G.EL[who.el].c : '#888');
        if (who) { if (art.dataset.id !== sp) { art.dataset.id = sp; art.src = G.Art.url(sp); art.classList.remove('in'); void art.offsetWidth; art.classList.add('in'); } art.style.opacity = 1; }
        else art.style.opacity = 0; } else { art.style.opacity = 0.0; narr.classList.remove('in'); void narr.offsetWidth; narr.classList.add('in'); }
      let k = 0; typing = setInterval(() => { k += 2; tgt.textContent = txt.slice(0, k); if (k % 6 === 0) G.Sfx.play('text'); if (k >= txt.length) { clearInterval(typing); typing = null; } }, 22);
    }
    ui.querySelector('.vn').onclick = next; ui.querySelector('.skip').onclick = e => { e.stopPropagation(); click(); fin(); };
    next();
  }

  /* ---------- summon ---------- */
  const POOL = r => Object.keys(G.HEROES).filter(id => G.HEROES[id].rar === r && !G.HEROES[id].story);
  function summon() {
    G.Bg.set(['#0d0620', '#3a1a7a', '#ffcf5a']);
    const f = POOL(5);
    ui.innerHTML = top('Star Altar', home) + `<div class="summon"><div class="banner"><div class="trio">${f.slice(0, 3).map((id, i) => `<img class="float" style="animation-delay:-${i * 1.3}s" src="${G.Art.url(id)}" alt="">`).join('')}</div>
      <h2>Call of the Fallen Stars</h2><p>5★ 3% · 4★ 15% · 3★ 82%<br>Ten-call guarantees 4★ or higher</p>
      <div class="pity"><u style="width:${S.pity * 2}%"></u><span>Guaranteed 5★ in ${50 - S.pity} calls</span></div></div>
      <div class="row"><button class="btn alt" id="p1">CALL ×1<small><i class="d"></i>160</small></button><button class="btn" id="p10">CALL ×10<small><i class="d"></i>1,600</small></button></div>
      <p class="fine">Stardust is earned only by playing. No purchases, ever.</p></div>`;
    bind({ '#p1': () => pull(1), '#p10': () => pull(10) });
  }
  function pull(n) {
    const cost = n * 160; if (S.dust < cost) return toast('Not enough stardust — clear story stages to earn more!');
    S.dust -= cost; const res = []; let got4 = false;
    for (let i = 0; i < n; i++) { S.pity++; const r = Math.random();
      let rar = S.pity >= 50 || r < 0.03 ? 5 : r < 0.18 ? 4 : 3; if (n === 10 && i === 9 && !got4 && rar < 4) rar = 4;
      if (rar >= 4) got4 = true; if (rar === 5) S.pity = 0;
      const p = POOL(rar), id = p[Math.random() * p.length | 0]; res.push({ id, isNew: grant(id) }); }
    G.save();
    const best = Math.max(...res.map(r => G.HEROES[r.id].rar)), col = G.RARC[best]; backFn = null;
    ui.innerHTML = `<div class="sum-anim" style="--c:${col}"><div class="ring"></div><div class="meteor"></div><div class="flash"></div></div>`;
    G.Sfx.play('star'); G.Bg.pulse(0.5);
    const iv = setInterval(() => G.fxBurst(.5, .46, col, 6, 260), 80);
    setTimeout(() => { clearInterval(iv); G.Bg.pulse(1.4); G.Sfx.play('boom'); G.fxBurst(.5, .46, col, 110, 620); }, 1500);
    setTimeout(() => reveal(res, summon), 2100);
  }
  function reveal(res, done) {
    let i = -1; backFn = null;
    function show() {
      if (++i >= res.length) return res.length > 1 ? grid() : done();
      const { id, isNew } = res[i], h = G.HEROES[id], E = G.EL[h.el];
      ui.innerHTML = `<div class="reveal r${h.rar}" style="--el:${E.c};--rc:${G.RARC[h.rar]}"><div class="rays"></div><img class="hero-art" src="${G.Art.url(id)}" alt="">
        <div class="rinfo"><span class="st">${stars(h.rar)}</span><h1>${h.name}</h1><em>${h.title}</em><div>${elChip(h.el)} <span class="el plain">${h.role}</span></div>
        <b class="${isNew ? 'new' : ''}">${isNew ? 'NEW ECHO!' : '+1 Echo Shard'}</b></div>${res.length > 1 ? '<button class="chip skip">Skip ›</button>' : ''}<span class="tap">tap to continue</span></div>`;
      G.Sfx.play(h.rar === 5 ? 'gold' : 'reveal'); G.Bg.pulse(h.rar === 5 ? 1 : 0.35); G.fxBurst(.5, .42, G.RARC[h.rar], h.rar * h.rar * 5, 300 + h.rar * 60);
      ui.firstChild.onclick = show; const sk = ui.querySelector('.skip'); if (sk) sk.onclick = e => { e.stopPropagation(); i = res.length; grid(); };
    }
    function grid() {
      ui.innerHTML = `<div class="sum-grid"><h2>Echoes Answered</h2><div class="grid">${res.map(r => card(r.id, r.isNew ? '<span class="tm new">NEW</span>' : '')).join('')}</div><button class="btn" id="gOk">OK</button></div>`;
      bind({ '#gOk': done });
    }
    show();
  }

  /* ---------- echoes ---------- */
  function echoes() {
    G.Bg.set(G.HOME_PAL);
    const ids = Object.keys(G.HEROES).sort((a, b) => (!!S.heroes[b] - !!S.heroes[a]) || G.HEROES[b].rar - G.HEROES[a].rar);
    ui.innerHTML = top('Echoes', home) + `<div class="echoes"><div class="teambar"><span>Team power <b>${fmt(teamPower())}</b></span><span>${S.team.length}/4 · first slot fights in front</span></div>
      <div class="grid">${ids.map(id => card(id)).join('')}</div></div>`;
    bind({}); ui.querySelectorAll('.card').forEach(b => b.onclick = () => { if (S.heroes[b.dataset.id]) { click(); detail(b.dataset.id); } else toast('This Echo has not answered your call yet.'); });
  }
  function detail(id) {
    const h = G.HEROES[id], o = S.heroes[id], E = G.EL[h.el], s = G.heroStats(id), cost = lvCost(o.lv), need = o.asc + 1, inTeam = S.team.includes(id);
    ui.innerHTML = top(h.name, echoes) + `<div class="detail" style="--el:${E.c};--rc:${G.RARC[h.rar]}"><div class="dart"><img class="hero-art float" src="${G.Art.url(id)}" alt="">
      <div class="dhead"><span class="st">${stars(h.rar)}</span><h2>${h.name}</h2><em>${h.title}</em><div>${elChip(h.el)} <span class="el plain">${h.role}</span></div></div></div>
      <div class="panel"><div class="stats"><div><small>LEVEL</small><b>${o.lv}<i>/${MAXLV}</i></b></div><div><small>HP</small><b>${fmt(s.hp)}</b></div><div><small>ATK</small><b>${fmt(s.atk)}</b></div><div><small>POWER</small><b>${fmt(s.power)}</b></div></div>
      <div class="ult"><b>✦ ${h.ult.name}</b><span>${h.ult.desc}</span><small>${E.name} is strong against ${G.EL[E.beats].name}</small></div>
      <p class="lore">${h.lore}</p>
      <div class="row"><button class="btn sm" id="dLv" ${o.lv >= MAXLV ? 'disabled' : ''}>LEVEL UP<small><i class="g"></i>${o.lv >= MAXLV ? 'MAX' : fmt(cost)}</small></button>
        <button class="btn sm alt" id="dAsc" ${o.asc >= 5 ? 'disabled' : ''}>ASCEND ${'◆'.repeat(o.asc)}${'◇'.repeat(5 - o.asc)}<small>${o.asc >= 5 ? 'MAX' : `Shards ${o.shards}/${need}`}</small></button></div>
      <button class="btn sm ${inTeam ? 'ghost' : ''}" id="dTeam">${inTeam ? 'REMOVE FROM TEAM' : 'ADD TO TEAM'}</button></div></div>`;
    bind({ '#dLv': () => { if (S.gold < cost) return toast('Not enough gold — replay stages to earn more.'); S.gold -= cost; o.lv++; G.save(); G.Sfx.play('heal'); G.fxBurst(.5, .3, E.c, 30); detail(id); },
      '#dAsc': () => { if (o.shards < need) return toast('Summon duplicates of this Echo to gain shards.'); o.shards -= need; o.asc++; G.save(); G.Sfx.play('gold'); G.fxBurst(.5, .3, '#ffcf5a', 60); detail(id); },
      '#dTeam': () => { if (inTeam) { if (S.team.length < 2) return toast('Your team needs at least one Echo.'); S.team = S.team.filter(x => x !== id); }
        else { if (S.team.length >= 4) return toast('Team is full — remove an Echo first.'); S.team.push(id); } G.save(); detail(id); } });
  }

  /* ---------- overlay fx + main loop ---------- */
  const fxc = $('#fx'), fx = fxc.getContext('2d'), parts = new G.Parts(); let FW = 0, FH = 0;
  G.fxBurst = (x, y, col, n, spd) => parts.burst(x * FW, y * FH, col, n, spd || 380, 12, 1.1, 120);
  function resize() { const r = $('#app').getBoundingClientRect(); FW = r.width; FH = r.height; fxc.width = FW; fxc.height = FH; G.Battle.resize(); }
  addEventListener('resize', resize); resize();
  let last = performance.now();
  function loop(now) { const dt = Math.min(0.1, (now - last) / 1000); last = now;
    G.Bg.frame(now / 1000, dt); if (G.Battle.active) G.Battle.frame(dt);
    if (parts.a.length) { fx.clearRect(0, 0, FW, FH); parts.step(dt); parts.draw(fx); if (!parts.a.length) fx.clearRect(0, 0, FW, FH); }
    requestAnimationFrame(loop); }
  requestAnimationFrame(loop);
  document.addEventListener('visibilitychange', () => G.Sfx.pause(document.hidden));
  title();
})();
