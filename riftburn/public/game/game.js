/**
 * The simulation. Fixed timestep, seeded RNG, no DOM and no rendering — the same
 * inputs always produce the same run, and it can be driven headless (see
 * tools/simtest.mjs). Everything visual or audible goes out through `S.fx(type,
 * …)`, so gameplay never pokes the renderer or the mixer directly.
 */

import { CFG, ENEMIES, BOSSES, BOSS_ORDER, UPGRADES, RARITY } from "./data.js";

const TAU = Math.PI * 2;
const W = CFG.world.w;
const H = CFG.world.h;
const CELL = 80;
const COLS = Math.ceil(W / CELL) + 1;
const ROWS = Math.ceil(H / CELL) + 1;

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export function xpNeed(level) {
  return Math.floor(6 + level * 6 + Math.pow(level, 1.85) * 1.3);
}

// ── run setup ──────────────────────────────────────────────────────────────

export function createRun({ seed = 1, armory = {}, fx = () => {} } = {}) {
  const S = {
    fx,
    seed,
    rng: mulberry32(seed),
    time: 0,
    wave: 0,
    phase: "break",
    phaseT: 1.4,
    queue: [],
    spawnT: 0,
    idleT: 0,
    enemies: [],
    bigs: [],
    bullets: [],
    ebullets: [],
    pickups: [],
    zones: [],
    beams: [],
    portals: [],
    drones: [],
    pool: { b: [], eb: [], pk: [] },
    grid: new Array(COLS * ROWS),
    used: [],
    boss: null,
    score: 0,
    combo: 0,
    comboT: 0,
    bestCombo: 0,
    kills: 0,
    bosses: 0,
    ups: {},
    armory,
    stats: {},
    pendingLevels: 0,
    status: "play",
    victoryShown: false,
    extract: false,
    hitstop: 0,
    slowmo: 0,
    nextId: 1,
    seen: {},
    rerolls: armory.reroll || 0,
    revives: armory.revive || 0,
    player: {
      x: W / 2,
      y: H / 2,
      r: CFG.player.r,
      vx: 0,
      vy: 0,
      aim: -Math.PI / 2,
      hp: 1,
      dashT: 0,
      dashCd: 0,
      dashX: 0,
      dashY: 0,
      inv: 1.5,
      fireCd: 0,
      od: 0,
      odT: 0,
      xp: 0,
      level: 0,
      xpNeed: xpNeed(0),
      shield: 0,
      shieldCd: 0,
      regenAcc: 0,
      vampAcc: 0,
      hurtT: 0,
      muzzle: 0,
    },
  };
  for (let i = 0; i < S.grid.length; i++) S.grid[i] = [];
  recalc(S);
  S.player.hp = S.stats.maxHp;
  S.pendingLevels = armory.head || 0;
  return S;
}

/** Derive every combat stat from base numbers + armory + mutations. */
export function recalc(S) {
  const u = (id) => S.ups[id] || 0;
  const a = (id) => S.armory[id] || 0;
  const st = S.stats;
  st.maxHp = CFG.player.hp + 10 * a("hull") + 20 * u("plating");
  st.dmg = CFG.gun.dmg * (1 + 0.05 * a("dmg")) * (1 + 0.2 * u("hot")) * Math.pow(0.92, u("split")) * (1 + 0.08 * u("velocity"));
  st.rate = CFG.gun.rate * (1 + 0.04 * a("rate")) * (1 + 0.15 * u("hair"));
  st.bulletSpeed = CFG.gun.speed * (1 + 0.2 * u("velocity"));
  st.projectiles = 1 + u("split");
  st.pierce = u("pierce");
  st.bounce = u("ricochet");
  st.crit = CFG.gun.crit + 0.1 * u("killshot");
  st.critMul = CFG.gun.critMul + 0.25 * u("killshot");
  st.regen = u("nanites");
  st.speed = CFG.player.speed * (1 + 0.03 * a("speed")) * (1 + 0.08 * u("servo"));
  st.magnet = CFG.player.magnet * (1 + 0.15 * a("magnet")) * (1 + 0.35 * u("coil"));
  st.dashCd = CFG.player.dashCd * Math.pow(0.94, a("dash")) * Math.pow(0.87, u("vents"));
  st.burn = 0.3 * u("burn");
  st.cryo = 0.15 * u("cryo");
  st.rear = u("rear");
  st.shock = u("shock");
  st.odCharge = 1 + 0.3 * u("charger");
  st.chain = u("chain");
  st.homing = u("seeker");
  st.blast = u("blast");
  st.drones = u("drone");
  st.aegis = u("aegis");
  st.vamp = u("vamp");
  while (S.drones.length < st.drones) S.drones.push({ x: S.player.x, y: S.player.y, cd: 0.4 * S.drones.length, ang: 0 });
}

export function applyUpgrade(S, id) {
  const def = UPGRADES.find((d) => d.id === id);
  if (!def || (S.ups[id] || 0) >= def.max) return false;
  S.ups[id] = (S.ups[id] || 0) + 1;
  recalc(S);
  const p = S.player;
  if (id === "plating") p.hp = Math.min(S.stats.maxHp, p.hp + 20);
  if (id === "aegis") {
    p.shield = 1;
    p.shieldCd = 0;
  }
  return true;
}

/** Three distinct mutations, rarity-weighted; epics grow likelier with level. */
export function rollOffers(S) {
  const open = UPGRADES.filter((d) => (S.ups[d.id] || 0) < d.max);
  const picks = [];
  for (let n = 0; n < 3 && open.length; n++) {
    const weights = RARITY.map((r, i) => {
      if (!open.some((d) => d.rarity === i)) return 0;
      return r.weight + (i === 2 ? S.player.level * 0.5 : i === 1 ? S.player.level * 0.4 : 0);
    });
    let roll = S.rng() * (weights[0] + weights[1] + weights[2]);
    let rarity = 0;
    for (let i = 0; i < 3; i++) {
      roll -= weights[i];
      if (roll < 0) {
        rarity = i;
        break;
      }
    }
    const tier = open.filter((d) => d.rarity === rarity);
    const pick = tier[Math.floor(S.rng() * tier.length)];
    picks.push(pick.id);
    open.splice(open.indexOf(pick), 1);
  }
  return picks;
}

// ── spatial grid (enemies with r <= 40; bosses are checked separately) ─────

function gridBuild(S) {
  const used = S.used;
  for (let i = 0; i < used.length; i++) used[i].length = 0;
  used.length = 0;
  S.bigs.length = 0;
  for (let i = 0; i < S.enemies.length; i++) {
    const e = S.enemies[i];
    if (e.dead) continue;
    if (e.r > 40) {
      S.bigs.push(e);
      continue;
    }
    const cx = clamp((e.x / CELL) | 0, 0, COLS - 1);
    const cy = clamp((e.y / CELL) | 0, 0, ROWS - 1);
    const cell = S.grid[cy * COLS + cx];
    if (cell.length === 0) used.push(cell);
    cell.push(e);
  }
}

/** Nearest living enemy to (x,y) within `range`, skipping ids in `skip`. */
function nearestEnemy(S, x, y, range, skip) {
  let best = null;
  let bd = range * range;
  const span = Math.ceil(range / CELL);
  const cx = clamp((x / CELL) | 0, 0, COLS - 1);
  const cy = clamp((y / CELL) | 0, 0, ROWS - 1);
  const x0 = Math.max(0, cx - span);
  const x1 = Math.min(COLS - 1, cx + span);
  const y0 = Math.max(0, cy - span);
  const y1 = Math.min(ROWS - 1, cy + span);
  for (let gy = y0; gy <= y1; gy++) {
    for (let gx = x0; gx <= x1; gx++) {
      const cell = S.grid[gy * COLS + gx];
      for (let i = 0; i < cell.length; i++) {
        const e = cell[i];
        if (e.dead || e.ghost || (skip && skip.indexOf(e.id) >= 0)) continue;
        const d = (e.x - x) * (e.x - x) + (e.y - y) * (e.y - y);
        if (d < bd) {
          bd = d;
          best = e;
        }
      }
    }
  }
  for (let i = 0; i < S.bigs.length; i++) {
    const e = S.bigs[i];
    if (e.dead || e.ghost || (skip && skip.indexOf(e.id) >= 0)) continue;
    const d = (e.x - x) * (e.x - x) + (e.y - y) * (e.y - y);
    if (d < bd) {
      bd = d;
      best = e;
    }
  }
  return best;
}

// ── spawning ───────────────────────────────────────────────────────────────

function waveScale(n) {
  return {
    hp: 1 + 0.11 * (n - 1) + (n > 15 ? Math.pow(1.09, n - 15) - 1 : 0),
    speed: 1 + Math.min(0.25, 0.012 * (n - 1)),
    dmg: Math.min(2, 1 + 0.03 * (n - 1)),
  };
}

export function spawnEnemy(S, type, x, y) {
  const boss = BOSSES[type];
  const def = boss || ENEMIES[type];
  const sc = waveScale(S.wave);
  let hpMul = sc.hp;
  if (boss) {
    const cycle = Math.max(0, Math.floor((S.wave / 5 - 1) / 3));
    hpMul = Math.pow(1.8, cycle) * (1 + 0.04 * Math.max(0, S.wave - 15));
  }
  const e = {
    id: S.nextId++,
    type,
    def,
    sprite: def.sprite || type,
    boss: Boolean(boss),
    x: clamp(x, def.r, W - def.r),
    y: clamp(y, def.r, H - def.r),
    vx: 0,
    vy: 0,
    kx: 0,
    ky: 0,
    r: def.r,
    hp: def.hp * hpMul,
    maxHp: def.hp * hpMul,
    dmg: def.dmg * sc.dmg,
    speed: def.speed * (boss ? 1 : sc.speed),
    ang: S.rng() * TAU,
    flash: 0,
    slowT: 0,
    burnT: 0,
    burnDps: 0,
    burnTick: 0,
    st: "chase",
    stT: 0,
    next: 0,
    n: 0,
    pat: 0,
    cd: 1 + S.rng() * 2,
    cx: 0,
    cy: 0,
    side: S.rng() < 0.5 ? -1 : 1,
    seed: S.rng() * 100,
    spawnT: boss ? 1.6 : 0.35,
    ghost: false,
    dead: false,
    phase: 1,
  };
  S.enemies.push(e);
  if (boss) {
    S.boss = e;
    e.st = "idle";
    e.stT = 0;
    e.cd = 1.2;
  }
  return e;
}

function portalSpot(S, minD, maxD) {
  const p = S.player;
  const m = CFG.world.margin + 40;
  for (let tries = 0; tries < 24; tries++) {
    const ang = S.rng() * TAU;
    const d = minD + S.rng() * (maxD - minD);
    const x = p.x + Math.cos(ang) * d;
    const y = p.y + Math.sin(ang) * d;
    if (x > m && x < W - m && y > m && y < H - m) return { x, y };
  }
  return { x: m + S.rng() * (W - 2 * m), y: m + S.rng() * (H - 2 * m) };
}

function addPortal(S, type, count, x, y, delay) {
  S.portals.push({ x, y, t: 0, delay, type, count, emitted: 0, big: Boolean(BOSSES[type]) });
  S.fx("portal", x, y, Boolean(BOSSES[type]));
}

function buildWave(S, n) {
  const queue = [];
  const isBoss = n % 5 === 0;
  let budget = 14 + n * 9 + n * n * 0.55;
  if (isBoss) budget *= 0.3;
  const types = Object.keys(ENEMIES).filter((k) => ENEMIES[k].from <= n);
  const newest = types.find((k) => ENEMIES[k].from === n);
  if (newest && !isBoss) {
    const cost = ENEMIES[newest].cost;
    const count = clamp(Math.round((budget * 0.25) / cost), 1, 8);
    queue.push({ type: newest, count });
    budget -= cost * count;
  }
  let guard = 0;
  while (budget > 0.5 && guard++ < 200) {
    let total = 0;
    const weights = types.map((k) => {
      const c = ENEMIES[k].cost;
      const w = c > budget + 2 ? 0 : (1 / Math.sqrt(c)) * (k === newest ? 2 : 1);
      total += w;
      return w;
    });
    if (total <= 0) break;
    let roll = S.rng() * total;
    let type = types[0];
    for (let i = 0; i < types.length; i++) {
      roll -= weights[i];
      if (roll < 0) {
        type = types[i];
        break;
      }
    }
    const cost = ENEMIES[type].cost;
    const want = Math.round((4 + S.rng() * 6) / Math.pow(cost, 0.8));
    const count = clamp(want, 1, Math.max(1, Math.floor((budget + 2) / cost)));
    queue.push({ type, count });
    budget -= cost * count;
  }
  return queue;
}

function startWave(S) {
  S.wave += 1;
  const n = S.wave;
  S.phase = "wave";
  S.queue = buildWave(S, n);
  S.spawnT = 0.2;
  S.idleT = 0;
  const isBoss = n % 5 === 0;
  if (isBoss) {
    const type = BOSS_ORDER[(n / 5 - 1) % BOSS_ORDER.length];
    const p = S.player;
    const bx = clamp(W - p.x, 420, W - 420);
    const by = clamp(H - p.y, 340, H - 340);
    addPortal(S, type, 1, bx, by, 1.9);
    S.fx("bossIntro", type);
    S.spawnT = 5;
  } else {
    S.fx("wave", n);
  }
  const fresh = Object.keys(ENEMIES).find((k) => ENEMIES[k].from === n);
  if (fresh && !S.seen[fresh]) {
    S.seen[fresh] = true;
    S.fx("intro", fresh);
  }
}

function updatePhase(S, dt) {
  if (S.phase === "break") {
    S.phaseT -= dt;
    if (S.phaseT <= 0) startWave(S);
    return;
  }
  // phase === "wave"
  const alive = S.enemies.length;
  if (S.queue.length) {
    S.spawnT -= dt;
    const cap = Math.min(CFG.caps.enemies, 46 + S.wave * 9);
    if (S.spawnT <= 0 && alive < cap) {
      const groups = S.wave >= 8 && S.queue.length > 1 && S.rng() < 0.45 ? 2 : 1;
      for (let g = 0; g < groups && S.queue.length; g++) {
        const grp = S.queue.shift();
        const spot = portalSpot(S, 360, 820);
        addPortal(S, grp.type, grp.count, spot.x, spot.y, 0.85);
      }
      S.spawnT = Math.max(0.7, 2.2 - S.wave * 0.09) * (S.boss ? 3 : 1);
    } else if (alive === 0 && S.portals.length === 0) {
      S.spawnT = Math.min(S.spawnT, 0.25);
    }
    return;
  }
  if (S.portals.length === 0) {
    if (alive === 0) {
      waveCleared(S);
    } else {
      S.idleT += dt;
    }
  }
}

function waveCleared(S) {
  S.score += S.wave * 100;
  S.phase = "break";
  S.phaseT = CFG.waveBreak;
  for (let i = 0; i < S.pickups.length; i++) S.pickups[i].vac = true;
  S.fx("waveClear", S.wave);
  if (S.wave === CFG.finalWave && !S.victoryShown) S.status = "victory";
}

// ── damage ─────────────────────────────────────────────────────────────────

function dropPickup(S, kind, v, x, y, burst) {
  let pk;
  if (S.pickups.length >= CFG.caps.pickups) {
    pk = S.pickups[(S.rng() * S.pickups.length) | 0];
    if (pk.kind === kind) pk.v += v;
    return;
  }
  pk = S.pool.pk.pop() || {};
  const ang = S.rng() * TAU;
  const sp = burst * (0.4 + S.rng() * 0.6);
  pk.x = x;
  pk.y = y;
  pk.vx = Math.cos(ang) * sp;
  pk.vy = Math.sin(ang) * sp;
  pk.kind = kind;
  pk.v = v;
  pk.t = 0;
  pk.vac = false;
  S.pickups.push(pk);
}

export function damageEnemy(S, e, dmg, crit, ang, quiet) {
  if (e.dead || e.ghost) return;
  if (e.spawnT > 0 && e.boss) dmg *= 0.25;
  e.hp -= dmg;
  e.flash = 0.09;
  if (!quiet) S.fx("hit", e.x, e.y, ang, crit, dmg, e.boss);
  if (!e.boss && ang !== null) {
    const push = Math.min(140, (dmg * 9) / Math.sqrt(e.maxHp)) * (e.st === "charge" ? 0.2 : 1);
    e.kx += Math.cos(ang) * push;
    e.ky += Math.sin(ang) * push;
  }
  if (e.hp <= 0) killEnemy(S, e, ang);
}

function killEnemy(S, e, ang) {
  if (e.dead) return;
  e.dead = true;
  const p = S.player;
  const def = e.def;
  S.kills += 1;
  S.combo = Math.min(S.combo + 1, 9999);
  if (S.combo > S.bestCombo) S.bestCombo = S.combo;
  S.comboT = CFG.combo.window;
  const mult = 1 + Math.min(S.combo, CFG.combo.cap) * CFG.combo.step;
  S.score += Math.round(def.score * mult);

  let xp = def.xp;
  while (xp >= 5) {
    dropPickup(S, "xp", 5, e.x, e.y, 150);
    xp -= 5;
  }
  while (xp >= 1) {
    dropPickup(S, "xp", 1, e.x, e.y, 110);
    xp -= 1;
  }
  const hpChance = e.type === "elite" ? 0.3 : e.type === "brute" ? 0.12 : 0.022;
  if (!e.boss && e.type !== "mite" && S.rng() < hpChance) dropPickup(S, "hp", 22, e.x, e.y, 90);

  if (p.odT <= 0) {
    const gain = CFG.overdrive.perKill * Math.sqrt(def.cost || 1) * S.stats.odCharge;
    const was = p.od;
    p.od = Math.min(CFG.overdrive.need, p.od + (e.boss ? 40 : gain));
    if (was < CFG.overdrive.need && p.od >= CFG.overdrive.need) S.fx("odReady");
  }
  if (S.stats.vamp > 0) {
    p.vampAcc += 1;
    if (p.vampAcc >= 15 - 3 * S.stats.vamp) {
      p.vampAcc = 0;
      p.hp = Math.min(S.stats.maxHp, p.hp + 1);
    }
  }

  S.fx("kill", e, ang);

  if (e.type === "splitter") {
    for (let i = 0; i < 3; i++) {
      const a = S.rng() * TAU;
      const m = spawnEnemy(S, "mite", e.x + Math.cos(a) * 14, e.y + Math.sin(a) * 14);
      m.kx = Math.cos(a) * 220;
      m.ky = Math.sin(a) * 220;
      m.spawnT = 0.15;
    }
  } else if (e.type === "bomber") {
    S.zones.push({ x: e.x, y: e.y, r: 108, t: 0, delay: e.st === "boom" ? 0 : 0.32, dmg: e.dmg, edmg: 48, kind: "bomb" });
  } else if (e.boss) {
    bossDeath(S, e);
  }
}

function bossDeath(S, e) {
  S.bosses += 1;
  S.boss = null;
  S.hitstop = 0.14;
  S.slowmo = 1.6;
  S.ebullets.length = 0;
  S.zones.length = 0;
  S.beams.length = 0;
  S.portals.length = 0;
  S.queue.length = 0;
  for (let i = 0; i < S.enemies.length; i++) {
    const o = S.enemies[i];
    if (!o.dead && o !== e) {
      o.type = o.type === "bomber" || o.type === "splitter" ? "crawler" : o.type;
      killEnemy(S, o, null);
    }
  }
  for (let i = 0; i < e.def.xp / 5; i++) dropPickup(S, "xp", 5, e.x, e.y, 420);
  dropPickup(S, "hp", 40, e.x, e.y, 160);
  dropPickup(S, "hp", 40, e.x, e.y, 160);
  S.fx("bossDie", e);
}

export function hurtPlayer(S, dmg) {
  const p = S.player;
  if (p.inv > 0 || S.status !== "play") return false;
  if (p.shield > 0) {
    p.shield = 0;
    p.shieldCd = S.stats.aegis >= 2 ? 8 : 12;
    p.inv = 0.6;
    S.fx("shield", p.x, p.y);
    return false;
  }
  p.hp -= dmg;
  p.inv = CFG.player.hitIframes;
  p.hurtT = 0.35;
  S.combo = Math.floor(S.combo / 2);
  S.hitstop = Math.max(S.hitstop, 0.05);
  S.fx("hurt", p.x, p.y, dmg);
  if (p.hp <= 0) {
    if (S.revives > 0) {
      S.revives -= 1;
      p.hp = Math.ceil(S.stats.maxHp * 0.5);
      p.inv = 2.2;
      nova(S, CFG.overdrive.novaR * 1.2, CFG.overdrive.novaDmg);
      S.fx("revive", p.x, p.y);
    } else {
      p.hp = 0;
      S.status = "dead";
      S.slowmo = 1.2;
      S.fx("death", p.x, p.y);
    }
  }
  return true;
}

function nova(S, radius, dmg) {
  const p = S.player;
  for (let i = S.enemies.length - 1; i >= 0; i--) {
    const e = S.enemies[i];
    if (e.dead) continue;
    const dx = e.x - p.x;
    const dy = e.y - p.y;
    const d = Math.hypot(dx, dy);
    if (d < radius + e.r) {
      const a = Math.atan2(dy, dx);
      if (!e.boss) {
        e.kx += Math.cos(a) * 520;
        e.ky += Math.sin(a) * 520;
      }
      damageEnemy(S, e, dmg, false, a, true);
    }
  }
  const r2 = radius * 1.35 * (radius * 1.35);
  for (let i = S.ebullets.length - 1; i >= 0; i--) {
    const b = S.ebullets[i];
    if ((b.x - p.x) * (b.x - p.x) + (b.y - p.y) * (b.y - p.y) < r2) {
      S.fx("spark", b.x, b.y);
      S.pool.eb.push(b);
      S.ebullets[i] = S.ebullets[S.ebullets.length - 1];
      S.ebullets.pop();
    }
  }
  S.fx("nova", p.x, p.y, radius);
}

// ── projectiles ────────────────────────────────────────────────────────────

function fireBullet(S, x, y, ang, dmg, od) {
  if (S.bullets.length >= CFG.caps.bullets) return;
  const st = S.stats;
  const b = S.pool.b.pop() || { hit: [] };
  const crit = S.rng() < st.crit;
  b.x = x;
  b.y = y;
  b.vx = Math.cos(ang) * st.bulletSpeed;
  b.vy = Math.sin(ang) * st.bulletSpeed;
  b.life = CFG.gun.life * (1 + 0.2 * (S.ups.velocity || 0));
  b.dmg = dmg * (crit ? st.critMul : 1);
  b.crit = crit;
  b.pierce = st.pierce + (od ? 2 : 0);
  b.bounce = st.bounce;
  b.od = od;
  b.hit.length = 0;
  S.bullets.push(b);
}

export function enemyShot(S, x, y, ang, speed, r, dmg) {
  if (S.ebullets.length >= CFG.caps.ebullets) return;
  const b = S.pool.eb.pop() || {};
  b.x = x;
  b.y = y;
  b.vx = Math.cos(ang) * speed;
  b.vy = Math.sin(ang) * speed;
  b.r = r;
  b.dmg = dmg;
  b.life = 9;
  S.ebullets.push(b);
}

function ring(S, x, y, n, speed, offset, r, dmg, gapAt, gapN) {
  for (let i = 0; i < n; i++) {
    if (gapN && ((i - gapAt + n) % n) < gapN) continue;
    enemyShot(S, x, y, offset + (i / n) * TAU, speed, r, dmg);
  }
}

function fan(S, x, y, ang, n, total, speed, r, dmg) {
  for (let i = 0; i < n; i++) {
    const a = n === 1 ? ang : ang - total / 2 + (total * i) / (n - 1);
    enemyShot(S, x, y, a, speed, r, dmg);
  }
}

function bulletHit(S, b, e) {
  const st = S.stats;
  const ang = Math.atan2(b.vy, b.vx);
  b.hit.push(e.id);
  if (st.burn > 0) {
    e.burnT = 3;
    e.burnDps = Math.max(e.burnDps, b.dmg * st.burn);
  }
  if (st.cryo > 0 && !e.boss && S.rng() < st.cryo) e.slowT = 2.5;
  damageEnemy(S, e, b.dmg, b.crit, ang, false);
  if (st.chain > 0) {
    let from = e;
    const skip = [e.id];
    for (let i = 0; i < 2; i++) {
      const o = nearestEnemy(S, from.x, from.y, 190, skip);
      if (!o) break;
      S.fx("arc", from.x, from.y, o.x, o.y);
      damageEnemy(S, o, b.dmg * (0.35 + 0.15 * st.chain), false, null, true);
      skip.push(o.id);
      from = o;
    }
  }
  if (st.blast > 0) {
    const R = 52 + 12 * st.blast;
    S.fx("blast", b.x, b.y, R);
    const cx = clamp((b.x / CELL) | 0, 0, COLS - 1);
    const cy = clamp((b.y / CELL) | 0, 0, ROWS - 1);
    for (let gy = Math.max(0, cy - 1); gy <= Math.min(ROWS - 1, cy + 1); gy++) {
      for (let gx = Math.max(0, cx - 1); gx <= Math.min(COLS - 1, cx + 1); gx++) {
        const cell = S.grid[gy * COLS + gx];
        for (let i = 0; i < cell.length; i++) {
          const o = cell[i];
          if (o === e || o.dead) continue;
          if ((o.x - b.x) * (o.x - b.x) + (o.y - b.y) * (o.y - b.y) < (R + o.r) * (R + o.r)) {
            damageEnemy(S, o, b.dmg * 0.35, false, null, true);
          }
        }
      }
    }
  }
  if (b.pierce > 0) {
    b.pierce -= 1;
    b.dmg *= 0.85;
    return false;
  }
  if (b.bounce > 0) {
    const o = nearestEnemy(S, b.x, b.y, 260, b.hit);
    if (o) {
      b.bounce -= 1;
      const a = Math.atan2(o.y - b.y, o.x - b.x);
      const sp = Math.hypot(b.vx, b.vy);
      b.vx = Math.cos(a) * sp;
      b.vy = Math.sin(a) * sp;
      b.life = Math.max(b.life, 0.3);
      return false;
    }
  }
  return true;
}

function updateBullets(S, dt) {
  const st = S.stats;
  const bullets = S.bullets;
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    let gone = false;
    b.life -= dt;
    if (st.homing > 0) {
      const t = nearestEnemy(S, b.x + b.vx * 0.08, b.y + b.vy * 0.08, 200, b.hit);
      if (t) {
        const sp = Math.hypot(b.vx, b.vy);
        const want = Math.atan2(t.y - b.y, t.x - b.x);
        let cur = Math.atan2(b.vy, b.vx);
        let diff = want - cur;
        while (diff > Math.PI) diff -= TAU;
        while (diff < -Math.PI) diff += TAU;
        const turn = (2.2 + 2.2 * st.homing) * dt;
        cur += clamp(diff, -turn, turn);
        b.vx = Math.cos(cur) * sp;
        b.vy = Math.sin(cur) * sp;
      }
    }
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.x < 0 || b.x > W || b.y < 0 || b.y > H) {
      if (b.bounce > 0) {
        b.bounce -= 1;
        if (b.x < 0 || b.x > W) b.vx = -b.vx;
        if (b.y < 0 || b.y > H) b.vy = -b.vy;
        b.x = clamp(b.x, 0, W);
        b.y = clamp(b.y, 0, H);
        S.fx("spark", b.x, b.y);
      } else {
        S.fx("spark", clamp(b.x, 0, W), clamp(b.y, 0, H));
        gone = true;
      }
    }
    if (!gone && b.life <= 0) gone = true;
    if (!gone) {
      const cx = clamp((b.x / CELL) | 0, 0, COLS - 1);
      const cy = clamp((b.y / CELL) | 0, 0, ROWS - 1);
      scan: for (let gy = Math.max(0, cy - 1); gy <= Math.min(ROWS - 1, cy + 1); gy++) {
        for (let gx = Math.max(0, cx - 1); gx <= Math.min(COLS - 1, cx + 1); gx++) {
          const cell = S.grid[gy * COLS + gx];
          for (let k = 0; k < cell.length; k++) {
            const e = cell[k];
            if (e.dead || e.ghost) continue;
            const rr = e.r + 7;
            if ((e.x - b.x) * (e.x - b.x) + (e.y - b.y) * (e.y - b.y) < rr * rr && b.hit.indexOf(e.id) < 0) {
              if (bulletHit(S, b, e)) {
                gone = true;
                break scan;
              }
            }
          }
        }
      }
      if (!gone) {
        for (let k = 0; k < S.bigs.length; k++) {
          const e = S.bigs[k];
          if (e.dead || e.ghost) continue;
          const rr = e.r + 7;
          if ((e.x - b.x) * (e.x - b.x) + (e.y - b.y) * (e.y - b.y) < rr * rr && b.hit.indexOf(e.id) < 0) {
            if (bulletHit(S, b, e)) {
              gone = true;
              break;
            }
          }
        }
      }
    }
    if (gone) {
      S.pool.b.push(b);
      bullets[i] = bullets[bullets.length - 1];
      bullets.pop();
    }
  }
}

function updateEnemyBullets(S, dt) {
  const p = S.player;
  const list = S.ebullets;
  for (let i = list.length - 1; i >= 0; i--) {
    const b = list[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    let gone = b.life <= 0 || b.x < -30 || b.x > W + 30 || b.y < -30 || b.y > H + 30;
    if (!gone) {
      const rr = b.r + p.r * 0.75;
      if ((b.x - p.x) * (b.x - p.x) + (b.y - p.y) * (b.y - p.y) < rr * rr) {
        if (p.inv <= 0) {
          hurtPlayer(S, b.dmg);
          gone = true;
        } else if (p.dashT > 0) {
          // dashing straight through a bullet is the intended answer to it
        }
      }
    }
    if (gone) {
      S.pool.eb.push(b);
      list[i] = list[list.length - 1];
      list.pop();
    }
  }
}

// ── player ─────────────────────────────────────────────────────────────────

function updatePlayer(S, inp, dt) {
  const p = S.player;
  const st = S.stats;
  let mx = inp.mx || 0;
  let my = inp.my || 0;
  const ml = Math.hypot(mx, my);
  if (ml > 1) {
    mx /= ml;
    my /= ml;
  }

  // aim: explicit angle, else auto-aim, else face the way we move
  let fire = Boolean(inp.fire);
  if (typeof inp.aim === "number") {
    p.aim = inp.aim;
  } else if (inp.autoAim) {
    const t = nearestEnemy(S, p.x, p.y, 640, null);
    if (t) {
      const lead = Math.hypot(t.x - p.x, t.y - p.y) / st.bulletSpeed;
      p.aim = Math.atan2(t.y + t.vy * lead - p.y, t.x + t.vx * lead - p.x);
      fire = true;
    } else {
      if (ml > 0.2) p.aim = Math.atan2(my, mx);
      fire = false;
    }
  } else if (ml > 0.2) {
    p.aim = Math.atan2(my, mx);
  }

  p.inv = Math.max(0, p.inv - dt);
  p.hurtT = Math.max(0, p.hurtT - dt);
  p.muzzle = Math.max(0, p.muzzle - dt);
  p.dashCd = Math.max(0, p.dashCd - dt);

  if (inp.dash && p.dashCd <= 0 && p.dashT <= 0) {
    let dx = mx;
    let dy = my;
    if (ml < 0.2) {
      dx = Math.cos(p.aim);
      dy = Math.sin(p.aim);
    } else {
      dx /= Math.max(ml, 0.001) > 1 ? 1 : Math.max(ml, 0.001);
      dy /= Math.max(ml, 0.001) > 1 ? 1 : Math.max(ml, 0.001);
    }
    p.dashX = dx;
    p.dashY = dy;
    p.dashT = CFG.player.dashTime;
    p.dashCd = st.dashCd;
    p.inv = Math.max(p.inv, CFG.player.dashIframes);
    S.fx("dash", p.x, p.y, Math.atan2(dy, dx));
  }

  if (p.dashT > 0) {
    p.dashT -= dt;
    p.vx = p.dashX * CFG.player.dashSpeed;
    p.vy = p.dashY * CFG.player.dashSpeed;
    if (p.dashT <= 0) {
      p.vx *= 0.35;
      p.vy *= 0.35;
      if (st.shock > 0) {
        S.zones.push({ x: p.x, y: p.y, r: 95 + 22 * st.shock, t: 0, delay: 0, dmg: 0, edmg: st.dmg * (2 + 1.5 * st.shock), kind: "shock" });
      }
    }
  } else {
    const k = Math.min(1, 16 * dt);
    p.vx += (mx * st.speed - p.vx) * k;
    p.vy += (my * st.speed - p.vy) * k;
  }
  p.x = clamp(p.x + p.vx * dt, p.r + 4, W - p.r - 4);
  p.y = clamp(p.y + p.vy * dt, p.r + 4, H - p.r - 4);

  // overdrive
  if (p.odT > 0) {
    p.odT -= dt;
    if (p.odT <= 0) S.fx("odEnd");
  } else if (inp.od && p.od >= CFG.overdrive.need) {
    p.od = 0;
    p.odT = CFG.overdrive.time;
    p.inv = Math.max(p.inv, 0.8);
    nova(S, CFG.overdrive.novaR, CFG.overdrive.novaDmg + S.stats.dmg * 4);
    S.hitstop = 0.09;
    S.fx("overdrive", p.x, p.y);
  }
  const od = p.odT > 0;

  // fire
  p.fireCd -= dt;
  if (fire && p.dashT <= 0) {
    let shots = 0;
    const interval = 1 / (st.rate * (od ? CFG.overdrive.rateMul : 1));
    while (p.fireCd <= 0 && shots < 3) {
      p.fireCd += interval;
      shots++;
      const n = st.projectiles;
      const dmg = st.dmg * (od ? CFG.overdrive.dmgMul : 1);
      const gx = p.x + Math.cos(p.aim) * 26;
      const gy = p.y + Math.sin(p.aim) * 26;
      for (let i = 0; i < n; i++) {
        const off = (i - (n - 1) / 2) * 0.11;
        fireBullet(S, gx, gy, p.aim + off + (S.rng() - 0.5) * 2 * CFG.gun.spread, dmg, od);
      }
      for (let i = 0; i < st.rear; i++) {
        const off = st.rear === 1 ? 0 : i === 0 ? -0.16 : 0.16;
        fireBullet(S, p.x - Math.cos(p.aim) * 18, p.y - Math.sin(p.aim) * 18, p.aim + Math.PI + off, dmg * 0.8, od);
      }
      p.muzzle = 0.05;
      S.fx("shot", gx, gy, p.aim, od);
    }
    if (p.fireCd < -0.2) p.fireCd = 0;
  } else if (p.fireCd < 0) {
    p.fireCd = 0;
  }

  // passive systems
  if (st.regen > 0 && p.hp < st.maxHp) {
    p.regenAcc += st.regen * dt;
    if (p.regenAcc >= 1) {
      p.regenAcc -= 1;
      p.hp = Math.min(st.maxHp, p.hp + 1);
    }
  }
  if (st.aegis > 0 && p.shield <= 0) {
    p.shieldCd -= dt;
    if (p.shieldCd <= 0) {
      p.shield = 1;
      S.fx("shieldUp", p.x, p.y);
    }
  }

  // drones
  for (let i = 0; i < S.drones.length; i++) {
    const d = S.drones[i];
    const a = S.time * 1.6 + (i / S.drones.length) * TAU;
    const tx = p.x + Math.cos(a) * 58;
    const ty = p.y + Math.sin(a) * 58;
    d.x += (tx - d.x) * Math.min(1, 12 * dt);
    d.y += (ty - d.y) * Math.min(1, 12 * dt);
    d.cd -= dt;
    if (d.cd <= 0) {
      const t = nearestEnemy(S, d.x, d.y, 520, null);
      if (t) {
        d.ang = Math.atan2(t.y - d.y, t.x - d.x);
        fireBullet(S, d.x, d.y, d.ang, st.dmg * 0.55, false);
        S.fx("droneShot", d.x, d.y, d.ang);
        d.cd = 1 / Math.min(6, st.rate * 0.45);
      } else {
        d.cd = 0.15;
      }
    }
  }
}

// ── enemies ────────────────────────────────────────────────────────────────

function updateEnemies(S, dt) {
  const p = S.player;
  const strag = S.phase === "wave" && !S.queue.length && S.enemies.length <= 4 && S.idleT > 9 ? 1.7 : 1;
  for (let i = 0; i < S.enemies.length; i++) {
    const e = S.enemies[i];
    if (e.dead) continue;
    e.flash = Math.max(0, e.flash - dt);
    if (e.slowT > 0) e.slowT -= dt;
    if (e.burnT > 0) {
      e.burnT -= dt;
      e.burnTick -= dt;
      if (e.burnTick <= 0) {
        e.burnTick = 0.25;
        damageEnemy(S, e, e.burnDps * 0.25, false, null, true);
        S.fx("burn", e.x, e.y);
        if (e.dead) continue;
      }
      if (e.burnT <= 0) e.burnDps = 0;
    }
    if (e.spawnT > 0) {
      e.spawnT -= dt;
      if (!e.boss) continue;
    }
    if (e.boss) updateBoss(S, e, dt, p);
    else updateMinion(S, e, dt, p, strag);

    // integrate + knockback + walls
    e.x += (e.vx + e.kx) * dt;
    e.y += (e.vy + e.ky) * dt;
    const kd = Math.max(0, 1 - 7 * dt);
    e.kx *= kd;
    e.ky *= kd;
    if (e.x < e.r || e.x > W - e.r || e.y < e.r || e.y > H - e.r) {
      e.x = clamp(e.x, e.r, W - e.r);
      e.y = clamp(e.y, e.r, H - e.r);
      if (e.st === "charge" && !e.boss) {
        e.stT = 0;
        S.fx("slam", e.x, e.y);
      }
    }

    // contact
    if (!e.ghost && e.spawnT <= 0) {
      const rr = e.r + p.r;
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      if (dx * dx + dy * dy < rr * rr) {
        if (e.type === "bomber" && e.st !== "boom") {
          e.st = "boom";
          e.hp = 0;
          killEnemy(S, e, null);
          continue;
        }
        if (hurtPlayer(S, e.dmg * (e.st === "charge" ? 1.4 : 1))) {
          const d = Math.hypot(dx, dy) || 1;
          p.vx += (dx / d) * 380;
          p.vy += (dy / d) * 380;
        }
      }
    }
  }

  // soft separation so a swarm reads as a swarm rather than one stacked blob
  const used = S.used;
  for (let c = 0; c < used.length; c++) {
    const cell = used[c];
    for (let i = 0; i < cell.length; i++) {
      const a = cell[i];
      if (a.dead) continue;
      for (let j = i + 1; j < cell.length; j++) {
        const b = cell[j];
        if (b.dead) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const rr = a.r + b.r;
        const d2 = dx * dx + dy * dy;
        if (d2 < rr * rr && d2 > 0.01) {
          const d = Math.sqrt(d2);
          const push = ((rr - d) / d) * 0.5;
          const wa = b.r / rr;
          const wb = a.r / rr;
          a.x -= dx * push * wa;
          a.y -= dy * push * wa;
          b.x += dx * push * wb;
          b.y += dy * push * wb;
        }
      }
    }
  }
}

function steer(e, tx, ty, dt, accel) {
  const k = Math.min(1, accel * dt);
  e.vx += (tx - e.vx) * k;
  e.vy += (ty - e.vy) * k;
}

function updateMinion(S, e, dt, p, strag) {
  const dx = p.x - e.x;
  const dy = p.y - e.y;
  const d = Math.hypot(dx, dy) || 1;
  const nx = dx / d;
  const ny = dy / d;
  const sp = e.speed * (e.slowT > 0 ? 0.6 : 1) * strag;
  let face = Math.atan2(dy, dx);
  e.cd -= dt;

  switch (e.type) {
    case "runner": {
      const w = Math.sin(S.time * 5 + e.seed) * 0.65;
      steer(e, (nx - ny * w) * sp, (ny + nx * w) * sp, dt, 6);
      face = Math.atan2(e.vy, e.vx);
      break;
    }
    case "gunner": {
      if (e.st === "aim") {
        steer(e, 0, 0, dt, 8);
        e.stT -= dt;
        if (e.stT <= 0) {
          const n = S.wave >= 12 ? 3 : 1;
          fan(S, e.x + nx * e.r, e.y + ny * e.r, face, n, 0.36, 275, 8, e.dmg);
          S.fx("eshot", e.x, e.y);
          e.st = "chase";
          e.cd = Math.max(1.4, 2.5 - S.wave * 0.04) + S.rng() * 0.6;
        }
      } else {
        const want = d > 430 ? 1 : d < 290 ? -0.9 : 0;
        steer(e, (nx * want - ny * e.side * 0.55) * sp, (ny * want + nx * e.side * 0.55) * sp, dt, 4);
        if (e.cd <= 0 && d < 720) {
          e.st = "aim";
          e.stT = 0.45;
        }
      }
      break;
    }
    case "bomber": {
      steer(e, nx * sp, ny * sp, dt, 5);
      if (d < 98 && e.st !== "fuse") {
        e.st = "fuse";
        e.stT = 0.6;
        S.fx("fuse", e.x, e.y);
      }
      if (e.st === "fuse") {
        steer(e, 0, 0, dt, 10);
        e.stT -= dt;
        if (e.stT <= 0) {
          e.st = "boom";
          killEnemy(S, e, null);
        }
      }
      break;
    }
    case "brute": {
      if (e.st === "wind") {
        steer(e, 0, 0, dt, 10);
        e.stT -= dt;
        if (e.stT > 0.25) {
          e.cx = nx;
          e.cy = ny;
        }
        face = Math.atan2(e.cy, e.cx);
        if (e.stT <= 0) {
          e.st = "charge";
          e.stT = 0.75;
          S.fx("charge", e.x, e.y);
        }
      } else if (e.st === "charge") {
        e.vx = e.cx * 650;
        e.vy = e.cy * 650;
        face = Math.atan2(e.cy, e.cx);
        e.stT -= dt;
        if (e.stT <= 0) {
          e.st = "rest";
          e.stT = 0.9;
          e.cd = 3.4;
        }
      } else if (e.st === "rest") {
        steer(e, 0, 0, dt, 6);
        face = e.ang;
        e.stT -= dt;
        if (e.stT <= 0) e.st = "chase";
      } else {
        steer(e, nx * sp, ny * sp, dt, 4);
        if (e.cd <= 0 && d < 440) {
          e.st = "wind";
          e.stT = 0.78;
          e.cx = nx;
          e.cy = ny;
        }
      }
      break;
    }
    case "sniper": {
      if (e.st === "aim") {
        steer(e, 0, 0, dt, 8);
        e.stT -= dt;
        face = e.cx;
        if (e.stT <= 0) e.st = "chase";
      } else {
        const want = d > 620 ? 1 : d < 470 ? -1 : 0;
        steer(e, (nx * want - ny * e.side * 0.4) * sp, (ny * want + nx * e.side * 0.4) * sp, dt, 4);
        if (e.cd <= 0 && d < 900) {
          e.st = "aim";
          e.stT = 1.35;
          e.cx = face;
          e.cd = 4.2 + S.rng();
          S.beams.push({ owner: e, x: e.x, y: e.y, ang: face, len: 1500, w: 16, t: 0, warm: 1.15, dur: 0.14, dmg: e.dmg, rot: 0, track: true, fired: false });
        }
      }
      break;
    }
    case "elite": {
      if (e.st === "out") {
        steer(e, 0, 0, dt, 10);
        e.stT -= dt;
        e.ghost = true;
        if (e.stT <= 0) {
          const a = S.rng() * TAU;
          const dist = 170 + S.rng() * 70;
          e.x = clamp(p.x + Math.cos(a) * dist, 80, W - 80);
          e.y = clamp(p.y + Math.sin(a) * dist, 80, H - 80);
          e.st = "in";
          e.stT = 0.5;
          S.fx("blink", e.x, e.y);
        }
      } else if (e.st === "in") {
        e.stT -= dt;
        if (e.stT <= 0) {
          e.ghost = false;
          e.st = "chase";
          e.cd = 4.2 + S.rng();
          ring(S, e.x, e.y, 10, 235, face, 8, e.dmg * 0.6);
          S.fx("eshot", e.x, e.y);
        }
      } else {
        steer(e, nx * sp, ny * sp, dt, 5);
        if (e.cd <= 0 && d > 150) {
          e.st = "out";
          e.stT = 0.35;
          S.fx("blink", e.x, e.y);
        }
      }
      break;
    }
    default:
      steer(e, nx * sp, ny * sp, dt, 5);
  }
  // ease facing
  let diff = face - e.ang;
  while (diff > Math.PI) diff -= TAU;
  while (diff < -Math.PI) diff += TAU;
  e.ang += diff * Math.min(1, 9 * dt);
}

// ── bosses ─────────────────────────────────────────────────────────────────

function bossNext(S, e, patterns) {
  e.pat = (e.pat + 1) % patterns.length;
  e.st = patterns[e.pat];
  e.stT = 0;
  e.next = 0;
  e.n = 0;
}

function updateBoss(S, e, dt, p) {
  const dx = p.x - e.x;
  const dy = p.y - e.y;
  const d = Math.hypot(dx, dy) || 1;
  const nx = dx / d;
  const ny = dy / d;
  const toP = Math.atan2(dy, dx);
  const hpf = e.hp / e.maxHp;
  const phase = e.type === "titan" ? (hpf < 0.33 ? 3 : hpf < 0.66 ? 2 : 1) : hpf < 0.5 ? 2 : 1;
  if (phase !== e.phase) {
    e.phase = phase;
    S.fx("bossPhase", e);
    ring(S, e.x, e.y, 20, 190, toP, 9, e.dmg * 0.6);
  }
  let face = toP;
  if (e.spawnT > 0) {
    e.vx = 0;
    e.vy = 0;
    return;
  }
  e.stT += dt;
  const B = e.dmg * 0.6;

  if (e.st === "idle") {
    steer(e, nx * e.speed, ny * e.speed, dt, 3);
    if (e.stT >= e.cd) {
      const pats = e.type === "warden" ? ["burst", "ring", "charge"] : e.type === "hive" ? ["brood", "spiral", "pools"] : ["beams", "rings", "summon", "stream"];
      bossNext(S, e, pats);
    }
  } else if (e.type === "warden") {
    if (e.st === "burst") {
      steer(e, nx * e.speed * 0.6, ny * e.speed * 0.6, dt, 3);
      const gap = phase === 2 ? 0.38 : 0.5;
      if (e.stT >= e.next) {
        e.next += gap;
        fan(S, e.x + nx * 50, e.y + ny * 50, toP, phase === 2 ? 7 : 5, phase === 2 ? 0.95 : 0.7, 310, 9, B);
        S.fx("eshot", e.x, e.y);
      }
      if (e.stT > 3) bossIdle(e, 0.8);
    } else if (e.st === "ring") {
      steer(e, 0, 0, dt, 4);
      if (e.stT >= 0.4 + e.n * 0.7 && e.n < 3) {
        ring(S, e.x, e.y, phase === 2 ? 24 : 18, 215, e.n * 0.17 + toP, 9, B);
        e.n++;
        S.fx("eshot", e.x, e.y);
      }
      if (e.stT > 2.6) bossIdle(e, 0.7);
    } else if (e.st === "charge") {
      const wind = 0.8;
      const run = 0.72;
      const t = e.stT - e.n * (wind + run + 0.25);
      if (t < wind) {
        steer(e, 0, 0, dt, 8);
        if (t < wind - 0.25) {
          e.cx = nx;
          e.cy = ny;
        }
        e.tele = true;
      } else if (t < wind + run) {
        if (e.tele) {
          e.tele = false;
          S.fx("charge", e.x, e.y);
        }
        e.vx = e.cx * 720;
        e.vy = e.cy * 720;
        e.st = "charge";
      } else if (t < wind + run + 0.25) {
        if (!e.slammed) {
          e.slammed = true;
          ring(S, e.x, e.y, 14, 230, 0, 9, B);
          S.fx("slam", e.x, e.y);
        }
        steer(e, 0, 0, dt, 10);
      } else {
        e.slammed = false;
        e.n++;
        if (e.n >= (phase === 2 ? 3 : 2)) bossIdle(e, 0.9);
      }
      face = Math.atan2(e.cy, e.cx);
    }
  } else if (e.type === "hive") {
    const cxp = W / 2 - e.x;
    const cyp = H / 2 - e.y;
    const cd = Math.hypot(cxp, cyp) || 1;
    steer(e, (cxp / cd) * e.speed * Math.min(1, cd / 200), (cyp / cd) * e.speed * Math.min(1, cd / 200), dt, 2);
    if (e.st === "brood") {
      if (e.stT >= 0.3 + e.n * 0.6 && e.n < 3) {
        e.n++;
        if (S.enemies.length < 30) {
          const cnt = phase === 2 ? 5 : 3;
          for (let i = 0; i < cnt; i++) {
            const a = S.rng() * TAU;
            const m = spawnEnemy(S, i < 3 ? "runner" : "mite", e.x + Math.cos(a) * 70, e.y + Math.sin(a) * 70);
            m.kx = Math.cos(a) * 260;
            m.ky = Math.sin(a) * 260;
          }
          S.fx("brood", e.x, e.y);
        }
      }
      if (e.stT > 2.4) bossIdle(e, 1);
    } else if (e.st === "spiral") {
      if (e.stT >= e.next) {
        e.next += 0.095;
        const arms = phase === 2 ? 3 : 2;
        const base = e.stT * 1.7 * (e.pat % 2 ? -1 : 1);
        for (let i = 0; i < arms; i++) enemyShot(S, e.x, e.y, base + (i / arms) * TAU, 205, 8, B);
        if (e.n++ % 4 === 0) S.fx("eshot", e.x, e.y);
      }
      if (e.stT > 4) bossIdle(e, 1.1);
    } else if (e.st === "pools") {
      const total = phase === 2 ? 9 : 6;
      if (e.stT >= e.n * 0.24 && e.n < total) {
        e.n++;
        const a = S.rng() * TAU;
        const r = e.n === 1 ? 0 : S.rng() * 190;
        S.zones.push({ x: clamp(p.x + p.vx * 0.5 + Math.cos(a) * r, 60, W - 60), y: clamp(p.y + p.vy * 0.5 + Math.sin(a) * r, 60, H - 60), r: 86, t: 0, delay: 1.05, dmg: e.dmg, edmg: 0, kind: "pool" });
      }
      if (e.stT > total * 0.24 + 1.4) bossIdle(e, 0.9);
    }
  } else {
    // titan
    const cxp = W / 2 - e.x;
    const cyp = H / 2 - e.y;
    const cd = Math.hypot(cxp, cyp) || 1;
    if (e.st === "beams") {
      steer(e, (cxp / cd) * e.speed * Math.min(1, cd / 150), (cyp / cd) * e.speed * Math.min(1, cd / 150), dt, 2);
      if (e.n === 0) {
        e.n = 1;
        const count = phase === 3 ? 5 : 4;
        const rot = (phase === 1 ? 0.42 : 0.56) * (S.rng() < 0.5 ? -1 : 1);
        const off = S.rng() * TAU;
        for (let i = 0; i < count; i++) {
          S.beams.push({ owner: e, x: e.x, y: e.y, ang: off + (i / count) * TAU, len: 1700, w: 26, t: 0, warm: 1.3, dur: 4.6, dmg: e.dmg * 0.8, rot, track: false, fired: false });
        }
      }
      if (e.stT > 1.6 && e.stT >= e.next) {
        e.next = e.stT + 1.5;
        ring(S, e.x, e.y, 10, 170, e.stT, 9, B);
      }
      if (e.stT > 6.2) bossIdle(e, 0.9);
      face = e.ang + dt * 0.6;
    } else if (e.st === "rings") {
      steer(e, nx * e.speed, ny * e.speed, dt, 2);
      const count = phase === 1 ? 4 : 6;
      if (e.stT >= 0.3 + e.n * 0.62 && e.n < count) {
        const total = 28;
        ring(S, e.x, e.y, total, 195 + phase * 12, e.n * 0.11, 9, B, (S.rng() * total) | 0, 5);
        e.n++;
        S.fx("eshot", e.x, e.y);
      }
      if (e.stT > 0.3 + count * 0.62 + 0.8) bossIdle(e, 0.8);
    } else if (e.st === "summon") {
      steer(e, 0, 0, dt, 4);
      if (e.n === 0 && e.stT > 0.4) {
        e.n = 1;
        if (S.enemies.length < 26) {
          const spots = phase === 1 ? 2 : 3;
          for (let i = 0; i < spots; i++) {
            const s = portalSpot(S, 320, 600);
            addPortal(S, i === 0 ? "elite" : "bomber", i === 0 ? (phase === 3 ? 2 : 1) : 3, s.x, s.y, 0.9);
          }
        }
      }
      if (e.stT > 1.6) bossIdle(e, 0.6);
    } else if (e.st === "stream") {
      steer(e, nx * e.speed * 0.5, ny * e.speed * 0.5, dt, 2);
      if (e.stT >= e.next) {
        e.next += phase === 3 ? 0.06 : 0.075;
        const wob = Math.sin(e.stT * 5) * 0.34;
        enemyShot(S, e.x + nx * 60, e.y + ny * 60, toP + wob, 345, 8, B);
        if (phase >= 2) enemyShot(S, e.x + nx * 60, e.y + ny * 60, toP - wob, 345, 8, B);
        if (e.n++ % 5 === 0) S.fx("eshot", e.x, e.y);
      }
      if (e.stT > 3.2) bossIdle(e, 0.9);
    }
  }

  let diff = face - e.ang;
  while (diff > Math.PI) diff -= TAU;
  while (diff < -Math.PI) diff += TAU;
  e.ang += diff * Math.min(1, 4 * dt);
}

function bossIdle(e, cd) {
  e.st = "idle";
  e.stT = 0;
  e.cd = cd * (e.phase >= 2 ? 0.7 : 1);
  e.tele = false;
  e.slammed = false;
}

// ── hazards, portals, pickups ──────────────────────────────────────────────

function updateZones(S, dt) {
  const p = S.player;
  for (let i = S.zones.length - 1; i >= 0; i--) {
    const z = S.zones[i];
    z.t += dt;
    if (z.t < z.delay) continue;
    if (z.dmg > 0) {
      const rr = z.r + p.r * 0.4;
      if ((p.x - z.x) * (p.x - z.x) + (p.y - z.y) * (p.y - z.y) < rr * rr) hurtPlayer(S, z.dmg);
    }
    if (z.edmg > 0) {
      for (let k = S.enemies.length - 1; k >= 0; k--) {
        const e = S.enemies[k];
        if (e.dead || e.ghost) continue;
        const rr = z.r + e.r;
        if ((e.x - z.x) * (e.x - z.x) + (e.y - z.y) * (e.y - z.y) < rr * rr) {
          damageEnemy(S, e, z.edmg, false, Math.atan2(e.y - z.y, e.x - z.x), true);
        }
      }
    }
    S.fx("explode", z.x, z.y, z.r, z.kind);
    S.zones[i] = S.zones[S.zones.length - 1];
    S.zones.pop();
  }
}

function updateBeams(S, dt) {
  const p = S.player;
  for (let i = S.beams.length - 1; i >= 0; i--) {
    const b = S.beams[i];
    const o = b.owner;
    if (!o || o.dead) {
      S.beams.splice(i, 1);
      continue;
    }
    b.t += dt;
    b.x = o.x;
    b.y = o.y;
    if (b.track && b.t < b.warm - 0.38) {
      const want = Math.atan2(p.y - o.y, p.x - o.x);
      let diff = want - b.ang;
      while (diff > Math.PI) diff -= TAU;
      while (diff < -Math.PI) diff += TAU;
      b.ang += diff * Math.min(1, 7 * dt);
      o.cx = b.ang;
    }
    if (b.t >= b.warm) {
      if (!b.fired) {
        b.fired = true;
        S.fx("beam", b.x, b.y, b.ang, b.len, b.w);
      }
      b.ang += b.rot * dt;
      // distance from the player to the beam segment
      const cx = Math.cos(b.ang);
      const cy = Math.sin(b.ang);
      const px = p.x - b.x;
      const py = p.y - b.y;
      const along = px * cx + py * cy;
      if (along > 0 && along < b.len) {
        const perp = Math.abs(px * cy - py * cx);
        if (perp < b.w / 2 + p.r * 0.7) hurtPlayer(S, b.dmg);
      }
    }
    if (b.t >= b.warm + b.dur) S.beams.splice(i, 1);
  }
}

function updatePortals(S, dt) {
  for (let i = S.portals.length - 1; i >= 0; i--) {
    const po = S.portals[i];
    po.t += dt;
    if (po.t >= po.delay) {
      const due = Math.min(po.count, 1 + Math.floor((po.t - po.delay) / 0.11));
      while (po.emitted < due) {
        po.emitted++;
        const a = S.rng() * TAU;
        const r = po.big ? 0 : 10 + S.rng() * 26;
        const e = spawnEnemy(S, po.type, po.x + Math.cos(a) * r, po.y + Math.sin(a) * r);
        if (!po.big) {
          e.kx = Math.cos(a) * 160;
          e.ky = Math.sin(a) * 160;
        }
        S.fx("spawn", e.x, e.y, po.big);
      }
      if (po.emitted >= po.count && po.t > po.delay + po.count * 0.11 + 0.3) {
        S.portals.splice(i, 1);
      }
    }
  }
}

function gainXp(S, v) {
  const p = S.player;
  p.xp += v;
  while (p.xp >= p.xpNeed) {
    p.xp -= p.xpNeed;
    p.level += 1;
    p.xpNeed = xpNeed(p.level);
    S.pendingLevels += 1;
    S.fx("levelUp", p.x, p.y);
  }
}

function updatePickups(S, dt) {
  const p = S.player;
  const mag = S.stats.magnet;
  const list = S.pickups;
  for (let i = list.length - 1; i >= 0; i--) {
    const pk = list[i];
    pk.t += dt;
    const dx = p.x - pk.x;
    const dy = p.y - pk.y;
    const d = Math.hypot(dx, dy) || 1;
    if (pk.t > 0.25 && (pk.vac || d < mag)) {
      const pull = pk.vac ? 1500 : 1100;
      pk.vx += (dx / d) * pull * dt;
      pk.vy += (dy / d) * pull * dt;
      const sp = Math.hypot(pk.vx, pk.vy);
      const max = pk.vac ? 1100 : 620;
      // steer rather than orbit: blend velocity toward the player
      pk.vx = pk.vx * 0.86 + (dx / d) * sp * 0.14;
      pk.vy = pk.vy * 0.86 + (dy / d) * sp * 0.14;
      if (sp > max) {
        pk.vx *= max / sp;
        pk.vy *= max / sp;
      }
    } else {
      const f = Math.max(0, 1 - 4 * dt);
      pk.vx *= f;
      pk.vy *= f;
    }
    pk.x = clamp(pk.x + pk.vx * dt, 8, W - 8);
    pk.y = clamp(pk.y + pk.vy * dt, 8, H - 8);
    if (d < p.r + 16) {
      if (pk.kind === "xp") {
        gainXp(S, pk.v);
        S.fx("xp", pk.x, pk.y, pk.v);
      } else {
        p.hp = Math.min(S.stats.maxHp, p.hp + pk.v);
        S.fx("heal", pk.x, pk.y, pk.v);
      }
      S.pool.pk.push(pk);
      list[i] = list[list.length - 1];
      list.pop();
    }
  }
}

// ── the step ───────────────────────────────────────────────────────────────

export function step(S, inp, dt) {
  if (S.status !== "play") return;
  if (S.hitstop > 0) {
    S.hitstop -= dt;
    return;
  }
  S.time += dt;
  if (S.comboT > 0) {
    S.comboT -= dt;
    if (S.comboT <= 0) S.combo = 0;
  }
  updatePhase(S, dt);
  gridBuild(S);
  updatePlayer(S, inp, dt);
  updateBullets(S, dt);
  updateEnemies(S, dt);
  updateEnemyBullets(S, dt);
  updateZones(S, dt);
  updateBeams(S, dt);
  updatePortals(S, dt);
  updatePickups(S, dt);

  // compact the dead
  const list = S.enemies;
  let w = 0;
  for (let i = 0; i < list.length; i++) {
    if (!list[i].dead) list[w++] = list[i];
  }
  list.length = w;
}

/** Resume after the wave-15 choice: keep fighting into the endless Overburn. */
export function continueEndless(S) {
  S.victoryShown = true;
  S.status = "play";
}

export function comboMult(S) {
  return 1 + Math.min(S.combo, CFG.combo.cap) * CFG.combo.step;
}

export function summary(S) {
  return {
    score: Math.floor(S.score),
    wave: Math.max(1, S.wave),
    kills: S.kills,
    bosses: S.bosses,
    time: Math.max(5, Math.floor(S.time)),
    extract: S.extract,
    level: S.player.level,
    combo: S.bestCombo,
  };
}
