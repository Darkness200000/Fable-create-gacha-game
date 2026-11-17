/**
 * Everything you see. Reads the simulation state and draws it; owns the purely
 * visual state (particles, rings, floating numbers, decals, camera shake) that
 * gameplay must never depend on — which is why this file may use Math.random
 * and game.js may not.
 */

import { CFG, SECTORS } from "./data.js";

const TAU = Math.PI * 2;
const W = CFG.world.w;
const H = CFG.world.h;
const HALF_PI = Math.PI / 2;

const SPRITES = ["hero", "crawler", "runner", "gunner", "bomber", "splitter", "brute", "sniper", "elite", "warden", "hive", "titan", "drone"];
const FLOORS = ["floor1", "floor2", "floor3"];
const GLOWS = {
  cyan: [90, 225, 255],
  white: [255, 255, 255],
  orange: [255, 150, 50],
  red: [255, 70, 60],
  gold: [255, 210, 90],
  violet: [180, 110, 255],
  green: [110, 255, 170],
  blue: [120, 170, 255],
};
const GLOW_KEYS = Object.keys(GLOWS);
const MAX_P = 1500;

function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function makeGlow([r, g, b]) {
  const c = makeCanvas(64, 64);
  const x = c.getContext("2d");
  const grad = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, `rgba(255,255,255,1)`);
  grad.addColorStop(0.18, `rgba(${r},${g},${b},0.9)`);
  grad.addColorStop(0.5, `rgba(${r},${g},${b},0.28)`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  x.fillStyle = grad;
  x.fillRect(0, 0, 64, 64);
  return c;
}

function whiteCopy(img) {
  const c = makeCanvas(img.width, img.height);
  const x = c.getContext("2d");
  x.drawImage(img, 0, 0);
  x.globalCompositeOperation = "source-atop";
  x.fillStyle = "#fff";
  x.fillRect(0, 0, c.width, c.height);
  return c;
}

/** Stand-in art, drawn in code, for any sprite file that fails to load. */
function procSprite(name) {
  const c = makeCanvas(256, 256);
  const x = c.getContext("2d");
  x.translate(128, 128);
  x.lineJoin = "round";
  const hero = name === "hero" || name === "drone";
  const body = hero ? "#e9f3ff" : "#b32535";
  const dark = hero ? "#7d93b8" : "#5c0f1c";
  const glow = hero ? "#5fe6ff" : "#ffa23e";
  const shapes = {
    hero: { w: 62, h: 70, legs: 0, gun: 2 },
    drone: { w: 74, h: 74, legs: 0, ring: true },
    crawler: { w: 62, h: 78, legs: 4 },
    runner: { w: 40, h: 96, legs: 2, blades: true },
    gunner: { w: 78, h: 84, legs: 4, gun: 1 },
    bomber: { w: 92, h: 92, legs: 4, core: true },
    splitter: { w: 86, h: 100, legs: 6, core: true },
    brute: { w: 100, h: 104, legs: 6, horns: true },
    sniper: { w: 44, h: 104, legs: 4, gun: 1 },
    elite: { w: 80, h: 92, legs: 4, horns: true, blades: true },
    warden: { w: 104, h: 100, legs: 6, gun: 2, horns: true },
    hive: { w: 108, h: 112, legs: 8, core: true },
    titan: { w: 108, h: 108, legs: 0, horns: true, core: true, ring: true },
  };
  const s = shapes[name] || shapes.crawler;
  x.strokeStyle = "#0c1230";
  x.lineWidth = 9;
  for (let i = 0; i < s.legs; i++) {
    const side = i % 2 ? 1 : -1;
    const row = Math.floor(i / 2) - (s.legs / 2 - 1) / 2;
    x.beginPath();
    x.moveTo(side * s.w * 0.3, row * 26);
    x.lineTo(side * (s.w * 0.5 + 26), row * 34 - 10);
    x.stroke();
  }
  if (s.ring) {
    x.strokeStyle = glow;
    x.lineWidth = 8;
    x.beginPath();
    x.arc(0, 0, s.w * 0.6 + 14, 0, TAU);
    x.stroke();
  }
  if (s.blades) {
    x.fillStyle = "#ffd7c2";
    for (const side of [-1, 1]) {
      x.beginPath();
      x.moveTo(side * s.w * 0.35, -s.h * 0.1);
      x.lineTo(side * (s.w * 0.5 + 34), -s.h * 0.5 - 12);
      x.lineTo(side * s.w * 0.5, s.h * 0.1);
      x.closePath();
      x.fill();
    }
  }
  const grad = x.createLinearGradient(0, -s.h / 2, 0, s.h / 2);
  grad.addColorStop(0, body);
  grad.addColorStop(1, dark);
  x.fillStyle = grad;
  x.strokeStyle = "#0c1230";
  x.lineWidth = 8;
  x.beginPath();
  x.ellipse(0, 0, s.w / 2, s.h / 2, 0, 0, TAU);
  x.fill();
  x.stroke();
  if (s.horns) {
    x.fillStyle = "#ffe2cf";
    for (const side of [-1, 1]) {
      x.beginPath();
      x.moveTo(side * s.w * 0.2, -s.h * 0.4);
      x.lineTo(side * s.w * 0.42, -s.h * 0.5 - 30);
      x.lineTo(side * s.w * 0.42, -s.h * 0.3);
      x.closePath();
      x.fill();
      x.stroke();
    }
  }
  x.fillStyle = "#0c1230";
  for (let g = 0; g < (s.gun || 0); g++) {
    const gx = s.gun === 1 ? 0 : g ? 20 : -20;
    x.fillRect(gx - 6, -s.h / 2 - 34, 12, 46);
  }
  x.fillStyle = glow;
  x.shadowColor = glow;
  x.shadowBlur = 18;
  if (s.core) {
    x.beginPath();
    x.arc(0, 6, s.w * 0.2, 0, TAU);
    x.fill();
  }
  x.beginPath();
  x.arc(-s.w * 0.16, -s.h * 0.26, 7, 0, TAU);
  x.arc(s.w * 0.16, -s.h * 0.26, 7, 0, TAU);
  x.fill();
  return c;
}

function procFloor(i) {
  const c = makeCanvas(512, 512);
  const x = c.getContext("2d");
  const base = ["#111a36", "#17132f", "#1a0f26"][i];
  const line = ["#1c2a55", "#27204d", "#3a1a48"][i];
  x.fillStyle = base;
  x.fillRect(0, 0, 512, 512);
  x.strokeStyle = line;
  x.lineWidth = 3;
  for (let k = 0; k <= 512; k += 128) {
    x.beginPath();
    x.moveTo(k, 0);
    x.lineTo(k, 512);
    x.moveTo(0, k);
    x.lineTo(512, k);
    x.stroke();
  }
  x.fillStyle = line;
  for (let gx = 0; gx < 4; gx++) for (let gy = 0; gy < 4; gy++) x.fillRect(gx * 128 + 10, gy * 128 + 10, 5, 5);
  return c;
}

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export function createRenderer(canvas, settings) {
  const ctx = canvas.getContext("2d", { alpha: false });
  const R = {
    cam: { x: W / 2, y: H / 2, trauma: 0, sx: 0, sy: 0, kick: 0 },
    k: 1,
    vw: 1280,
    vh: 720,
    dpr: 1,
    sprites: {},
    floors: [],
    glow: {},
    flash: 0,
    flashColor: "255,255,255",
    hurt: 0,
    stats: { particles: 0, draws: 0 },
    mouse: null,
    quality: 1,
  };
  for (const key of GLOW_KEYS) R.glow[key] = makeGlow(GLOWS[key]);

  // visual-only pools
  const P = {
    x: new Float32Array(MAX_P),
    y: new Float32Array(MAX_P),
    vx: new Float32Array(MAX_P),
    vy: new Float32Array(MAX_P),
    life: new Float32Array(MAX_P),
    max: new Float32Array(MAX_P),
    size: new Float32Array(MAX_P),
    drag: new Float32Array(MAX_P),
    col: new Uint8Array(MAX_P),
    n: 0,
  };
  const rings = [];
  const texts = [];
  const arcs = [];
  const ghosts = [];
  const decal = makeCanvas(W / 2, H / 2);
  const dctx = decal.getContext("2d");
  let vignette = null;

  function part(x, y, vx, vy, life, size, col, drag) {
    if (P.n >= MAX_P * R.quality) return;
    const i = P.n++;
    P.x[i] = x;
    P.y[i] = y;
    P.vx[i] = vx;
    P.vy[i] = vy;
    P.life[i] = life;
    P.max[i] = life;
    P.size[i] = size;
    P.col[i] = col;
    P.drag[i] = drag;
  }
  const C = {};
  GLOW_KEYS.forEach((key, i) => (C[key] = i));

  function burst(x, y, n, speed, life, size, col, dir, spread) {
    n = Math.ceil(n * R.quality);
    for (let i = 0; i < n; i++) {
      const a = dir === undefined ? Math.random() * TAU : dir + (Math.random() - 0.5) * spread;
      const s = speed * (0.25 + Math.random() * 0.75);
      part(x, y, Math.cos(a) * s, Math.sin(a) * s, life * (0.5 + Math.random() * 0.5), size * (0.6 + Math.random() * 0.7), col, 3.2);
    }
  }
  function ring(x, y, r0, r1, life, color, width) {
    if (rings.length < 60) rings.push({ x, y, r0, r1, t: 0, life, color, width });
  }
  function text(x, y, str, color, size) {
    if (texts.length >= 70) texts.shift();
    texts.push({ x: x + (Math.random() - 0.5) * 16, y, t: 0, str, color, size });
  }
  function shake(amount) {
    if (settings.shake) R.cam.trauma = Math.min(1, R.cam.trauma + amount);
  }
  function flash(amount, color) {
    if (!settings.flash) amount *= 0.25;
    if (amount > R.flash) {
      R.flash = amount;
      R.flashColor = color || "255,255,255";
    }
  }
  function splat(x, y, r, color, alpha) {
    dctx.globalAlpha = alpha;
    dctx.fillStyle = color;
    for (let i = 0; i < 5; i++) {
      const a = Math.random() * TAU;
      const d = Math.random() * r * 0.7;
      dctx.beginPath();
      dctx.arc((x + Math.cos(a) * d) / 2, (y + Math.sin(a) * d) / 2, (r * (0.25 + Math.random() * 0.45)) / 2, 0, TAU);
      dctx.fill();
    }
    dctx.globalAlpha = 1;
  }

  R.reset = function reset() {
    P.n = 0;
    rings.length = 0;
    texts.length = 0;
    arcs.length = 0;
    ghosts.length = 0;
    dctx.clearRect(0, 0, decal.width, decal.height);
    R.cam.x = W / 2;
    R.cam.y = H / 2;
    R.cam.trauma = 0;
    R.flash = 0;
    R.hurt = 0;
  };

  R.load = async function load(onProgress) {
    const total = SPRITES.length + FLOORS.length;
    let done = 0;
    const tick = () => onProgress && onProgress(++done / total);
    await Promise.all([
      ...SPRITES.map(async (name) => {
        const img = (await loadImage(`/assets/${name}.png`)) || procSprite(name);
        R.sprites[name] = { img, white: whiteCopy(img) };
        tick();
      }),
      ...FLOORS.map(async (name, i) => {
        R.floors[i] = (await loadImage(`/assets/${name}.jpg`)) || procFloor(i);
        tick();
      }),
    ]);
    R.patterns = R.floors.map((img) => ctx.createPattern(img, "repeat"));
  };

  R.resize = function resize() {
    const cw = window.innerWidth;
    const ch = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, cw * ch > 1600 * 900 ? 1.25 : 2);
    R.dpr = dpr;
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    const scale = Math.sqrt((cw * ch) / CFG.viewArea);
    R.k = scale * dpr;
    R.vw = cw / scale;
    R.vh = ch / scale;
    vignette = makeCanvas(256, 256);
    const v = vignette.getContext("2d");
    const g = v.createRadialGradient(128, 128, 60, 128, 128, 182);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,8,0.62)");
    v.fillStyle = g;
    v.fillRect(0, 0, 256, 256);
  };

  /** Screen (CSS px) → world, for mouse aiming. */
  R.toWorld = function toWorld(sx, sy) {
    const scale = R.k / R.dpr;
    return { x: R.cam.x - R.vw / 2 + sx / scale, y: R.cam.y - R.vh / 2 + sy / scale };
  };

  // ── fx events from the simulation ────────────────────────────────────────
  R.fx = function fx(type, a, b, c, d, e, f) {
    switch (type) {
      case "shot":
        burst(a, b, 2, 260, 0.12, 9, d ? C.gold : C.cyan, c, 0.5);
        R.cam.kick = Math.min(1, R.cam.kick + 0.12);
        break;
      case "droneShot":
        burst(a, b, 1, 200, 0.1, 7, C.cyan, c, 0.4);
        break;
      case "hit":
        burst(a, b, d ? 6 : 3, 240, 0.22, d ? 11 : 8, d ? C.gold : C.orange, c === null ? undefined : c + Math.PI, 1.3);
        if (settings.numbers && e >= 1) text(a, b - 14, String(Math.round(e)), d ? "#ffd45e" : "#ffffff", d ? 22 : 15);
        if (f) shake(0.015);
        break;
      case "kill": {
        const en = a;
        const big = en.r > 30;
        burst(en.x, en.y, big ? 26 : 11, big ? 420 : 300, big ? 0.6 : 0.4, big ? 16 : 11, C.orange);
        burst(en.x, en.y, big ? 10 : 4, 200, 0.5, 9, C.red);
        ring(en.x, en.y, en.r * 0.5, en.r * (big ? 3.2 : 2.4), 0.28, "255,170,90", big ? 5 : 3);
        splat(en.x, en.y, en.r * 1.6, "#3a0612", 0.5);
        shake(big ? 0.3 : 0.05);
        break;
      }
      case "explode": {
        const col = d === "shock" ? C.cyan : d === "pool" ? C.violet : C.orange;
        const rgb = d === "shock" ? "110,230,255" : d === "pool" ? "200,120,255" : "255,170,80";
        burst(a, b, 26, c * 3.4, 0.5, 18, col);
        burst(a, b, 8, c * 1.5, 0.7, 26, C.white);
        ring(a, b, c * 0.3, c * 1.15, 0.32, rgb, 7);
        splat(a, b, c * 0.9, "#05050c", 0.55);
        shake(d === "shock" ? 0.22 : 0.38);
        if (d !== "shock") flash(0.12, "255,200,150");
        break;
      }
      case "blast":
        ring(a, b, 6, c, 0.18, "255,190,110", 3);
        burst(a, b, 4, 160, 0.25, 12, C.orange);
        break;
      case "nova":
        ring(a, b, 30, c * 1.3, 0.45, "120,235,255", 12);
        ring(a, b, 10, c * 0.9, 0.3, "255,255,255", 6);
        burst(a, b, 60, 900, 0.6, 16, C.cyan);
        shake(0.7);
        flash(0.35, "170,240,255");
        break;
      case "hurt":
        burst(a, b, 18, 380, 0.45, 12, C.red);
        shake(0.5);
        R.hurt = 1;
        break;
      case "death":
        burst(a, b, 90, 700, 1.1, 18, C.cyan);
        burst(a, b, 50, 420, 1.2, 22, C.white);
        ring(a, b, 20, 420, 0.7, "150,235,255", 10);
        shake(1);
        flash(0.55);
        break;
      case "revive":
        ring(a, b, 20, 520, 0.6, "255,225,120", 12);
        burst(a, b, 60, 600, 0.8, 16, C.gold);
        flash(0.4, "255,235,170");
        break;
      case "dash":
        burst(a, b, 12, 300, 0.3, 12, C.cyan, c + Math.PI, 1);
        ghosts.push({ t: 0.26 });
        break;
      case "xp":
        part(a, b, 0, -40, 0.25, 14, C.gold, 2);
        break;
      case "heal":
        burst(a, b, 10, 160, 0.5, 11, C.green);
        text(a, b - 20, "+" + Math.round(c), "#7dffb5", 18);
        break;
      case "levelUp":
        ring(a, b, 20, 260, 0.5, "255,220,110", 8);
        burst(a, b, 36, 420, 0.7, 13, C.gold);
        flash(0.18, "255,230,150");
        break;
      case "portal":
        ring(a, b, c ? 260 : 90, 10, c ? 1.7 : 0.8, "190,120,255", c ? 8 : 4);
        break;
      case "spawn":
        burst(a, b, c ? 60 : 6, c ? 520 : 200, c ? 0.9 : 0.35, c ? 20 : 11, C.violet);
        if (c) {
          shake(0.8);
          flash(0.3, "210,150,255");
          ring(a, b, 30, 520, 0.7, "200,130,255", 12);
        }
        break;
      case "blink":
        burst(a, b, 16, 260, 0.35, 12, C.violet);
        ring(a, b, 60, 8, 0.3, "200,130,255", 4);
        break;
      case "arc":
        if (arcs.length < 40) arcs.push({ x1: a, y1: b, x2: c, y2: d, t: 0.12, seed: Math.random() * 99 });
        break;
      case "burn":
        part(a + (Math.random() - 0.5) * 16, b + (Math.random() - 0.5) * 16, 0, -70, 0.35, 12, C.orange, 1);
        break;
      case "spark":
        burst(a, b, 3, 160, 0.18, 7, C.cyan);
        break;
      case "eshot":
        burst(a, b, 5, 130, 0.25, 12, C.orange);
        break;
      case "beam":
        shake(0.2);
        break;
      case "slam":
        ring(a, b, 20, 170, 0.3, "255,200,150", 6);
        burst(a, b, 18, 360, 0.4, 13, C.orange);
        shake(0.45);
        break;
      case "charge":
        burst(a, b, 10, 200, 0.4, 14, C.white);
        break;
      case "brood":
        burst(a, b, 24, 360, 0.5, 13, C.violet);
        break;
      case "bossPhase":
        ring(a.x, a.y, 40, 620, 0.6, "255,120,90", 12);
        burst(a.x, a.y, 50, 640, 0.7, 16, C.red);
        shake(0.7);
        flash(0.25, "255,150,120");
        break;
      case "bossDie": {
        const en = a;
        for (let i = 0; i < 5; i++) ring(en.x, en.y, 30, 300 + i * 190, 0.5 + i * 0.22, i % 2 ? "255,255,255" : "255,170,80", 14 - i * 2);
        burst(en.x, en.y, 140, 900, 1.3, 22, C.orange);
        burst(en.x, en.y, 70, 500, 1.5, 28, C.white);
        burst(en.x, en.y, 60, 700, 1.2, 16, C.gold);
        splat(en.x, en.y, en.r * 3, "#05050c", 0.7);
        shake(1);
        flash(0.7);
        break;
      }
      case "shield":
        ring(a, b, 26, 110, 0.3, "130,200,255", 6);
        burst(a, b, 22, 340, 0.4, 11, C.blue);
        shake(0.25);
        break;
      case "shieldUp":
        ring(a, b, 70, 26, 0.3, "130,200,255", 3);
        break;
      case "overdrive":
        flash(0.3, "255,220,140");
        break;
      case "waveClear":
        break;
      default:
        break;
    }
  };

  // ── frame ────────────────────────────────────────────────────────────────
  let ox = 0;
  let oy = 0;
  let k = 1;

  function sprite(img, x, y, ang, size) {
    const c = Math.cos(ang) * k;
    const s = Math.sin(ang) * k;
    ctx.setTransform(c, s, -s, c, x * k + ox, y * k + oy);
    ctx.drawImage(img, -size / 2, -size / 2, size, size);
  }
  function base() {
    ctx.setTransform(k, 0, 0, k, ox, oy);
  }

  R.draw = function draw(S, dt, now) {
    const cam = R.cam;
    const p = S.player;
    k = R.k;
    const vw = R.vw;
    const vh = R.vh;

    // camera: follow the player, lean toward where they aim
    const lead = 70;
    const tx = p.x + Math.cos(p.aim) * lead;
    const ty = p.y + Math.sin(p.aim) * lead;
    const f = Math.min(1, 6 * dt);
    cam.x += (tx - cam.x) * f;
    cam.y += (ty - cam.y) * f;
    const pad = 110;
    cam.x = vw >= W + pad * 2 ? W / 2 : Math.max(vw / 2 - pad, Math.min(W - vw / 2 + pad, cam.x));
    cam.y = vh >= H + pad * 2 ? H / 2 : Math.max(vh / 2 - pad, Math.min(H - vh / 2 + pad, cam.y));
    cam.trauma = Math.max(0, cam.trauma - dt * 1.6);
    cam.kick = Math.max(0, cam.kick - dt * 9);
    const tr = cam.trauma * cam.trauma;
    const sx = (Math.random() * 2 - 1) * 22 * tr - Math.cos(p.aim) * cam.kick * 3;
    const sy = (Math.random() * 2 - 1) * 22 * tr - Math.sin(p.aim) * cam.kick * 3;
    const left = cam.x - vw / 2 + sx;
    const top = cam.y - vh / 2 + sy;
    ox = -left * k;
    oy = -top * k;
    const right = left + vw;
    const bottom = top + vh;
    const vis = (x, y, r) => x + r > left && x - r < right && y + r > top && y - r < bottom;

    const sector = SECTORS[Math.min(2, Math.floor(Math.max(0, S.wave - 1) / 5))];
    const sectorIdx = SECTORS.indexOf(sector);

    // void + floor
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#04050b";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    base();
    ctx.fillStyle = R.patterns[sectorIdx];
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(decal, 0, 0, W, H);

    // arena wall
    ctx.lineWidth = 10;
    ctx.strokeStyle = sector.glow;
    ctx.globalAlpha = 0.18;
    ctx.strokeRect(-12, -12, W + 24, H + 24);
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = 4;
    ctx.strokeRect(-2, -2, W + 4, H + 4);
    ctx.globalAlpha = 1;

    // telegraphs under everything
    for (let i = 0; i < S.zones.length; i++) {
      const z = S.zones[i];
      if (z.delay <= 0 || !vis(z.x, z.y, z.r)) continue;
      const t = Math.min(1, z.t / z.delay);
      const rgb = z.kind === "pool" ? "200,110,255" : "255,90,60";
      ctx.fillStyle = `rgba(${rgb},0.14)`;
      ctx.beginPath();
      ctx.arc(z.x, z.y, z.r, 0, TAU);
      ctx.fill();
      ctx.fillStyle = `rgba(${rgb},${0.2 + 0.25 * t})`;
      ctx.beginPath();
      ctx.arc(z.x, z.y, z.r * t, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = `rgba(${rgb},0.95)`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(z.x, z.y, z.r, 0, TAU);
      ctx.stroke();
    }
    for (let i = 0; i < S.enemies.length; i++) {
      const e = S.enemies[i];
      const tele = (e.type === "brute" && e.st === "wind") || (e.boss && e.st === "charge" && e.tele);
      if (tele) {
        const len = e.boss ? 600 : 500;
        const a = Math.atan2(e.cy, e.cx);
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.rotate(a);
        ctx.fillStyle = `rgba(255,70,50,${0.16 + 0.12 * Math.sin(now * 30)})`;
        ctx.fillRect(0, -e.r, len, e.r * 2);
        ctx.strokeStyle = "rgba(255,110,80,0.9)";
        ctx.lineWidth = 2.5;
        ctx.strokeRect(0, -e.r, len, e.r * 2);
        ctx.restore();
      } else if (e.type === "bomber" && e.st === "fuse") {
        ctx.fillStyle = "rgba(255,90,60,0.2)";
        ctx.strokeStyle = "rgba(255,120,80,0.95)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(e.x, e.y, 108, 0, TAU);
        ctx.fill();
        ctx.stroke();
      }
    }

    // portals
    for (let i = 0; i < S.portals.length; i++) {
      const po = S.portals[i];
      const R0 = po.big ? 150 : 44;
      if (!vis(po.x, po.y, R0 + 20)) continue;
      const t = Math.min(1, po.t / po.delay);
      ctx.strokeStyle = `rgba(200,130,255,${0.5 + 0.5 * t})`;
      ctx.lineWidth = po.big ? 7 : 4;
      for (let j = 0; j < 3; j++) {
        const a0 = now * (3 + j) + j * 2;
        ctx.beginPath();
        ctx.arc(po.x, po.y, R0 * (0.45 + 0.55 * t) * (1 - j * 0.22), a0, a0 + 3.6);
        ctx.stroke();
      }
      ctx.fillStyle = `rgba(120,50,200,${0.25 * t})`;
      ctx.beginPath();
      ctx.arc(po.x, po.y, R0 * t * 0.8, 0, TAU);
      ctx.fill();
    }

    // shadows
    ctx.fillStyle = "rgba(0,0,6,0.36)";
    ctx.beginPath();
    for (let i = 0; i < S.enemies.length; i++) {
      const e = S.enemies[i];
      if (e.ghost || !vis(e.x, e.y, e.r * 2)) continue;
      ctx.moveTo(e.x + e.r * 1.25 + 6, e.y + 8);
      ctx.ellipse(e.x + 6, e.y + 8, e.r * 1.25, e.r * 1.05, 0, 0, TAU);
    }
    ctx.moveTo(p.x + 24, p.y + 8);
    ctx.ellipse(p.x + 5, p.y + 8, 19, 16, 0, 0, TAU);
    ctx.fill();

    // pickups (under actors)
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < S.pickups.length; i++) {
      const pk = S.pickups[i];
      if (!vis(pk.x, pk.y, 20)) continue;
      const pulse = 1 + 0.18 * Math.sin(now * 7 + i);
      if (pk.kind === "xp") {
        const s = (pk.v >= 5 ? 30 : 20) * pulse;
        ctx.drawImage(R.glow.gold, pk.x - s / 2, pk.y - s / 2, s, s);
      } else {
        const s = 44 * pulse;
        ctx.drawImage(R.glow.green, pk.x - s / 2, pk.y - s / 2, s, s);
      }
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#eafff2";
    for (let i = 0; i < S.pickups.length; i++) {
      const pk = S.pickups[i];
      if (pk.kind !== "hp" || !vis(pk.x, pk.y, 20)) continue;
      ctx.fillRect(pk.x - 2.5, pk.y - 8, 5, 16);
      ctx.fillRect(pk.x - 8, pk.y - 2.5, 16, 5);
    }

    // enemies
    let drawn = 0;
    for (let i = 0; i < S.enemies.length; i++) {
      const e = S.enemies[i];
      const size = e.def.size;
      if (!vis(e.x, e.y, size)) continue;
      const sp = R.sprites[e.sprite] || R.sprites.crawler;
      let scale = 1 + 0.045 * Math.sin(now * 9 + e.seed);
      if (e.spawnT > 0) scale *= Math.max(0.15, 1 - e.spawnT / (e.boss ? 1.6 : 0.35));
      let alpha = 1;
      if (e.type === "elite" && (e.st === "out" || e.st === "in")) {
        alpha = 0.35;
        scale *= e.st === "out" ? Math.max(0.2, e.stT / 0.35) : 1 - (e.stT / 0.5) * 0.5;
      }
      if (e.type === "bomber" && e.st === "fuse") scale *= 1 + 0.25 * (1 - e.stT / 0.6);
      ctx.globalAlpha = alpha;
      const fl = e.flash > 0 || (e.type === "bomber" && e.st === "fuse" && Math.sin(now * 40) > 0);
      sprite(fl ? sp.white : sp.img, e.x, e.y, e.ang + HALF_PI, size * scale);
      drawn++;
    }
    ctx.globalAlpha = 1;
    base();

    // enemy status: chill ring, gunner charge, tough-enemy health pips
    for (let i = 0; i < S.enemies.length; i++) {
      const e = S.enemies[i];
      if (!vis(e.x, e.y, e.r * 2)) continue;
      if (e.slowT > 0) {
        ctx.strokeStyle = "rgba(150,210,255,0.8)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r + 4, 0, TAU);
        ctx.stroke();
      }
      if (!e.boss && e.maxHp >= 200 && e.hp < e.maxHp) {
        const w = e.r * 2;
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.fillRect(e.x - w / 2, e.y - e.r - 16, w, 5);
        ctx.fillStyle = "#ff5a4a";
        ctx.fillRect(e.x - w / 2, e.y - e.r - 16, w * Math.max(0, e.hp / e.maxHp), 5);
      }
    }

    // player
    const hero = R.sprites.hero;
    if (S.status !== "dead") {
      for (let i = ghosts.length - 1; i >= 0; i--) {
        const g = ghosts[i];
        if (g.x === undefined) {
          g.x = p.x;
          g.y = p.y;
          g.a = p.aim;
        }
        g.t -= dt;
        if (g.t <= 0) {
          ghosts.splice(i, 1);
          continue;
        }
        ctx.globalAlpha = g.t * 2;
        sprite(hero.white, g.x, g.y, g.a + HALF_PI, CFG.player.size);
      }
      if (p.dashT > 0 && ghosts.length < 6 && Math.random() < 0.7) ghosts.push({ t: 0.2, x: p.x, y: p.y, a: p.aim });
      ctx.globalAlpha = p.inv > 0 && p.hurtT <= 0 && p.dashT <= 0 && Math.sin(now * 40) > 0 ? 0.45 : 1;
      sprite(p.hurtT > 0.22 ? hero.white : hero.img, p.x, p.y, p.aim + HALF_PI, CFG.player.size);
      ctx.globalAlpha = 1;
      const dr = R.sprites.drone;
      for (let i = 0; i < S.drones.length; i++) {
        const d = S.drones[i];
        sprite(dr.img, d.x, d.y, now * 2 + i, 30);
      }
      base();
      if (p.shield > 0) {
        ctx.strokeStyle = `rgba(140,205,255,${0.55 + 0.25 * Math.sin(now * 5)})`;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 30, 0, TAU);
        ctx.stroke();
      }
    }
    base();

    // ── additive layer ──
    ctx.globalCompositeOperation = "lighter";
    if (S.status !== "dead") {
      if (p.odT > 0) {
        const s = 150 + 20 * Math.sin(now * 14);
        ctx.globalAlpha = 0.55;
        ctx.drawImage(R.glow.gold, p.x - s / 2, p.y - s / 2, s, s);
        ctx.globalAlpha = 1;
      }
      if (p.muzzle > 0) {
        const mx = p.x + Math.cos(p.aim) * 34;
        const my = p.y + Math.sin(p.aim) * 34;
        const g = p.odT > 0 ? R.glow.gold : R.glow.cyan;
        ctx.drawImage(g, mx - 30, my - 30, 60, 60);
      }
      // soft light the hero carries, so they always read against the floor
      ctx.globalAlpha = 0.16;
      ctx.drawImage(R.glow.cyan, p.x - 130, p.y - 130, 260, 260);
      ctx.globalAlpha = 1;
    }

    // player bullets: one stroked path for the streaks, glow sprites on top
    const bl = S.bullets;
    ctx.lineCap = "round";
    for (let pass = 0; pass < 2; pass++) {
      ctx.strokeStyle = pass ? "#ffe9a8" : "#c9f6ff";
      ctx.lineWidth = pass ? 4.5 : 3.5;
      ctx.beginPath();
      for (let i = 0; i < bl.length; i++) {
        const b = bl[i];
        if ((b.crit || b.od ? 1 : 0) !== pass) continue;
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(b.x - b.vx * 0.028, b.y - b.vy * 0.028);
      }
      ctx.stroke();
    }
    for (let i = 0; i < bl.length; i++) {
      const b = bl[i];
      const g = b.crit || b.od ? R.glow.gold : R.glow.cyan;
      const s = b.crit ? 34 : 26;
      ctx.drawImage(g, b.x - s / 2, b.y - s / 2, s, s);
    }

    // enemy bullets: big, hot, unmissable
    const eb = S.ebullets;
    for (let i = 0; i < eb.length; i++) {
      const b = eb[i];
      if (!vis(b.x, b.y, 30)) continue;
      const s = b.r * 5.2;
      ctx.drawImage(R.glow.red, b.x - s / 2, b.y - s / 2, s, s);
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#fff1d6";
    ctx.beginPath();
    for (let i = 0; i < eb.length; i++) {
      const b = eb[i];
      if (!vis(b.x, b.y, 30)) continue;
      ctx.moveTo(b.x + b.r * 0.62, b.y);
      ctx.arc(b.x, b.y, b.r * 0.62, 0, TAU);
    }
    ctx.fill();
    ctx.strokeStyle = "#ff4a3c";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < eb.length; i++) {
      const b = eb[i];
      if (!vis(b.x, b.y, 30)) continue;
      ctx.moveTo(b.x + b.r, b.y);
      ctx.arc(b.x, b.y, b.r, 0, TAU);
    }
    ctx.stroke();
    ctx.globalCompositeOperation = "lighter";

    // beams
    for (let i = 0; i < S.beams.length; i++) {
      const b = S.beams[i];
      const ex = b.x + Math.cos(b.ang) * b.len;
      const ey = b.y + Math.sin(b.ang) * b.len;
      if (b.t < b.warm) {
        const t = b.t / b.warm;
        ctx.strokeStyle = `rgba(255,80,60,${0.25 + 0.6 * t * (0.6 + 0.4 * Math.sin(now * 40))})`;
        ctx.lineWidth = 1.5 + t * 3;
      } else {
        ctx.strokeStyle = "rgba(255,90,60,0.9)";
        ctx.lineWidth = b.w * (1 + 0.15 * Math.sin(now * 50));
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        ctx.strokeStyle = "rgba(255,245,225,1)";
        ctx.lineWidth = b.w * 0.36;
      }
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(ex, ey);
      ctx.stroke();
    }

    // gunner charge-up glow
    for (let i = 0; i < S.enemies.length; i++) {
      const e = S.enemies[i];
      if (e.type === "gunner" && e.st === "aim") {
        const s = 70 * (1 - e.stT / 0.45) + 20;
        ctx.drawImage(R.glow.orange, e.x - s / 2, e.y - s / 2, s, s);
      } else if (e.boss && e.spawnT <= 0) {
        const s = e.def.size * (1.5 + 0.1 * Math.sin(now * 4));
        ctx.globalAlpha = 0.22;
        ctx.drawImage(R.glow.red, e.x - s / 2, e.y - s / 2, s, s);
        ctx.globalAlpha = 1;
      }
    }

    // arcs
    ctx.strokeStyle = "#bfeaff";
    ctx.lineWidth = 3;
    for (let i = arcs.length - 1; i >= 0; i--) {
      const a = arcs[i];
      a.t -= dt;
      if (a.t <= 0) {
        arcs.splice(i, 1);
        continue;
      }
      ctx.globalAlpha = Math.min(1, a.t * 12);
      ctx.beginPath();
      ctx.moveTo(a.x1, a.y1);
      const nx = -(a.y2 - a.y1);
      const ny = a.x2 - a.x1;
      const nl = Math.hypot(nx, ny) || 1;
      for (let s = 1; s < 5; s++) {
        const t = s / 5;
        const j = (Math.sin(a.seed + s * 12.9 + now * 60) * 14) / nl;
        ctx.lineTo(a.x1 + (a.x2 - a.x1) * t + nx * j, a.y1 + (a.y2 - a.y1) * t + ny * j);
      }
      ctx.lineTo(a.x2, a.y2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // particles
    let n = P.n;
    for (let i = 0; i < n; i++) {
      P.life[i] -= dt;
      if (P.life[i] <= 0) {
        n--;
        P.x[i] = P.x[n];
        P.y[i] = P.y[n];
        P.vx[i] = P.vx[n];
        P.vy[i] = P.vy[n];
        P.life[i] = P.life[n];
        P.max[i] = P.max[n];
        P.size[i] = P.size[n];
        P.drag[i] = P.drag[n];
        P.col[i] = P.col[n];
        i--;
        continue;
      }
      const d = Math.max(0, 1 - P.drag[i] * dt);
      P.vx[i] *= d;
      P.vy[i] *= d;
      P.x[i] += P.vx[i] * dt;
      P.y[i] += P.vy[i] * dt;
      const x = P.x[i];
      const y = P.y[i];
      if (x < left - 20 || x > right + 20 || y < top - 20 || y > bottom + 20) continue;
      const t = P.life[i] / P.max[i];
      const s = P.size[i] * (0.5 + t * 0.9);
      ctx.globalAlpha = t;
      ctx.drawImage(R.glow[GLOW_KEYS[P.col[i]]], x - s / 2, y - s / 2, s, s);
    }
    P.n = n;
    ctx.globalAlpha = 1;

    // rings
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      r.t += dt;
      if (r.t >= r.life) {
        rings.splice(i, 1);
        continue;
      }
      const t = r.t / r.life;
      const e = 1 - (1 - t) * (1 - t);
      ctx.strokeStyle = `rgba(${r.color},${1 - t})`;
      ctx.lineWidth = r.width * (1 - t * 0.6);
      ctx.beginPath();
      ctx.arc(r.x, r.y, Math.max(1, r.r0 + (r.r1 - r.r0) * e), 0, TAU);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = "source-over";

    // floating numbers
    ctx.textAlign = "center";
    ctx.lineJoin = "round";
    for (let i = texts.length - 1; i >= 0; i--) {
      const t = texts[i];
      t.t += dt;
      if (t.t > 0.7) {
        texts.splice(i, 1);
        continue;
      }
      const a = t.t < 0.5 ? 1 : 1 - (t.t - 0.5) / 0.2;
      const pop = t.t < 0.08 ? 1 + (0.08 - t.t) * 6 : 1;
      ctx.globalAlpha = a;
      ctx.font = `800 ${t.size * pop}px "Rajdhani", "Segoe UI", system-ui, sans-serif`;
      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(5,8,20,0.85)";
      const y = t.y - t.t * 46;
      ctx.strokeText(t.str, t.x, y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, t.x, y);
    }
    ctx.globalAlpha = 1;

    // ── screen space ──
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(vignette, 0, 0, canvas.width, canvas.height);

    // edge arrows toward the boss and the last few stragglers
    if (S.enemies.length && (S.enemies.length <= 6 || S.boss)) {
      const cxs = canvas.width / 2;
      const cys = canvas.height / 2;
      for (let i = 0; i < S.enemies.length; i++) {
        const e = S.enemies[i];
        if (S.enemies.length > 6 && !e.boss) continue;
        if (vis(e.x, e.y, -20)) continue;
        const a = Math.atan2(e.y - (top + vh / 2), e.x - (left + vw / 2));
        const m = 34 * R.dpr;
        const rx = cxs - m;
        const ry = cys - m;
        const tt = Math.min(rx / Math.abs(Math.cos(a) || 1e-6), ry / Math.abs(Math.sin(a) || 1e-6));
        ctx.save();
        ctx.translate(cxs + Math.cos(a) * tt, cys + Math.sin(a) * tt);
        ctx.rotate(a);
        ctx.scale(R.dpr, R.dpr);
        ctx.fillStyle = e.boss ? "#ffb347" : "#ff5a4a";
        ctx.beginPath();
        ctx.moveTo(14, 0);
        ctx.lineTo(-8, -10);
        ctx.lineTo(-3, 0);
        ctx.lineTo(-8, 10);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }

    // damage / low-hull / overdrive tints
    R.hurt = Math.max(0, R.hurt - dt * 2.4);
    const low = S.status === "play" && p.hp / S.stats.maxHp < 0.3 ? 0.22 + 0.12 * Math.sin(now * 6) : 0;
    const red = Math.max(R.hurt * 0.45, low);
    if (red > 0.01) {
      const g = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, canvas.height * 0.25, canvas.width / 2, canvas.height / 2, canvas.height * 0.85);
      g.addColorStop(0, "rgba(255,30,30,0)");
      g.addColorStop(1, `rgba(255,30,30,${red})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    if (p.odT > 0) {
      ctx.fillStyle = `rgba(255,190,80,${0.05 + 0.02 * Math.sin(now * 12)})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    if (R.flash > 0.01) {
      ctx.fillStyle = `rgba(${R.flashColor},${R.flash})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      R.flash = Math.max(0, R.flash - dt * 2.6);
    }

    // crosshair
    if (R.mouse && S.status === "play") {
      const mx = R.mouse.x * R.dpr;
      const my = R.mouse.y * R.dpr;
      const s = R.dpr;
      ctx.strokeStyle = p.odT > 0 ? "#ffd45e" : "#8ff0ff";
      ctx.lineWidth = 2 * s;
      ctx.beginPath();
      ctx.arc(mx, my, 11 * s, 0, TAU);
      ctx.moveTo(mx - 18 * s, my);
      ctx.lineTo(mx - 6 * s, my);
      ctx.moveTo(mx + 6 * s, my);
      ctx.lineTo(mx + 18 * s, my);
      ctx.moveTo(mx, my - 18 * s);
      ctx.lineTo(mx, my - 6 * s);
      ctx.moveTo(mx, my + 6 * s);
      ctx.lineTo(mx, my + 18 * s);
      ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.fillRect(mx - s, my - s, 2 * s, 2 * s);
    }

    R.stats.particles = P.n;
    R.stats.draws = drawn;
  };

  /** Idle backdrop for menus: the floor drifting by, nothing else. */
  R.drawIdle = function drawIdle(now) {
    k = R.k;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#04050b";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (!R.patterns) return;
    ox = -((now * 22) % 512) * k;
    oy = -((now * 9) % 512) * k;
    base();
    ctx.fillStyle = R.patterns[0];
    ctx.fillRect(0, 0, R.vw + 1024, R.vh + 1024);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (vignette) ctx.drawImage(vignette, 0, 0, canvas.width, canvas.height);
  };

  return R;
}
