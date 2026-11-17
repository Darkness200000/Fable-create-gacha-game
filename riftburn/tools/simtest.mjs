/**
 * Headless balance + stability check: a simple bot plays whole runs at full
 * speed with no renderer. Fails loudly on any exception or NaN, and prints how
 * far each run got so difficulty changes can be compared number to number.
 *
 *   node tools/simtest.mjs [runs] [skill 0..1]
 */
import { createRun, step, applyUpgrade, rollOffers, continueEndless, summary } from "../public/game/game.js";
import { CFG } from "../public/game/data.js";

const runs = Number(process.argv[2] || 6);
const skill = Number(process.argv[3] || 0.7);
const dt = CFG.step;

function bot(S, t) {
  // Look-ahead dodger: try 16 headings (+ standing still), roll the world
  // forward ~0.6 s for each, and take the least dangerous one.
  const p = S.player;
  const speed = S.stats.speed;
  let bestDir = -1;
  let bestCost = Infinity;
  let stayCost = 0;
  const pk = S.pickups.length ? S.pickups.reduce((m, q) => (Math.hypot(q.x - p.x, q.y - p.y) < Math.hypot(m.x - p.x, m.y - p.y) ? q : m)) : null;
  for (let k = -1; k < 16; k++) {
    const ang = (k / 16) * Math.PI * 2;
    const vx = k < 0 ? 0 : Math.cos(ang) * speed;
    const vy = k < 0 ? 0 : Math.sin(ang) * speed;
    let cost = 0;
    for (let s = 1; s <= 6; s++) {
      const tt = s * 0.1;
      const x = p.x + vx * tt;
      const y = p.y + vy * tt;
      if (x < 40 || x > CFG.world.w - 40 || y < 40 || y > CFG.world.h - 40) cost += 40;
      for (const b of S.ebullets) {
        const d = Math.hypot(b.x + b.vx * tt - x, b.y + b.vy * tt - y);
        if (d < 34) cost += 120 / s;
        else if (d < 70) cost += 6 / s;
      }
      for (const e of S.enemies) {
        if (e.ghost) continue;
        const ex = e.x + e.vx * tt;
        const ey = e.y + e.vy * tt;
        const d = Math.hypot(ex - x, ey - y) - e.r;
        const safe = e.boss ? 260 : e.type === "bomber" ? 150 : 110;
        if (d < 26) cost += 150 / s;
        else if (d < safe) cost += ((safe - d) / safe) * 8;
        if ((e.st === "wind" || (e.st === "charge" && (e.tele || e.type === "brute" || e.boss))) && (e.cx || e.cy)) {
          const px = x - e.x;
          const py = y - e.y;
          const along = px * e.cx + py * e.cy;
          const perp = Math.abs(px * e.cy - py * e.cx);
          if (along > -20 && along < 620 && perp < e.r + 40) cost += 60;
        }
      }
      for (const z of S.zones) {
        if (z.dmg > 0 && Math.hypot(z.x - x, z.y - y) < z.r + 24 && z.delay - z.t < tt + 0.5) cost += 90;
      }
      for (const b of S.beams) {
        const a2 = b.ang + (b.t >= b.warm ? b.rot * tt : 0);
        const px = x - b.x;
        const py = y - b.y;
        const along = px * Math.cos(a2) + py * Math.sin(a2);
        const perp = Math.abs(px * Math.sin(a2) - py * Math.cos(a2));
        if (along > 0 && along < b.len && perp < b.w / 2 + 34 && b.t + tt > b.warm - 0.3) cost += 110;
      }
    }
    const ex = p.x + vx * 0.6;
    const ey = p.y + vy * 0.6;
    cost += (Math.hypot(ex - CFG.world.w / 2, ey - CFG.world.h / 2) / 1000) * 3;
    if (pk) cost += Math.min(6, Math.hypot(pk.x - ex, pk.y - ey) / 90);
    cost += (1 - skill) * S.rng() * 60; // sloppier players misjudge
    if (k < 0) stayCost = cost;
    if (cost < bestCost) {
      bestCost = cost;
      bestDir = k;
    }
  }
  const ang = (bestDir / 16) * Math.PI * 2;
  return {
    mx: bestDir < 0 ? 0 : Math.cos(ang),
    my: bestDir < 0 ? 0 : Math.sin(ang),
    autoAim: true,
    fire: true,
    dash: bestCost > 100 && stayCost > 100 && S.rng() < skill,
    od: p.od >= CFG.overdrive.need && (S.enemies.length > 8 || S.boss || S.ebullets.length > 25),
  };
}

function check(S) {
  const p = S.player;
  for (const v of [p.x, p.y, p.hp, S.score, p.xp]) {
    if (!Number.isFinite(v)) throw new Error("non-finite state: " + JSON.stringify({ x: p.x, y: p.y, hp: p.hp, score: S.score }));
  }
  for (const e of S.enemies) if (!Number.isFinite(e.x + e.y + e.hp)) throw new Error("non-finite enemy " + e.type);
}

let totalWave = 0;
const t0 = Date.now();
for (let r = 0; r < runs; r++) {
  const counts = {};
  const S = createRun({ seed: 1000 + r * 7919, armory: {}, fx: (type) => (counts[type] = (counts[type] || 0) + 1) });
  let steps = 0;
  let peak = 0;
  const marks = [];
  let lastWave = 0;
  while (S.status !== "dead" && steps < 60 * 60 * 22) {
    if (S.status === "victory") continueEndless(S);
    while (S.pendingLevels > 0) {
      const offers = rollOffers(S);
      if (!offers.length) {
        S.pendingLevels = 0;
        break;
      }
      applyUpgrade(S, offers[Math.floor(S.rng() * offers.length)]);
      S.pendingLevels--;
    }
    step(S, bot(S, steps * dt), dt);
    steps++;
    if (S.enemies.length > peak) peak = S.enemies.length;
    if (S.wave !== lastWave) {
      lastWave = S.wave;
      marks.push(`${S.wave}@${Math.round(S.time)}s L${S.player.level}`);
    }
    if (steps % 30 === 0) check(S);
  }
  const s = summary(S);
  totalWave += s.wave;
  console.log(`run ${r}: wave ${s.wave} score ${s.score} kills ${s.kills} bosses ${s.bosses} time ${s.time}s lvl ${s.level} peakEnemies ${peak} combo ${s.combo}`);
  console.log("   " + marks.join("  "));
  console.log("   ups " + JSON.stringify(S.ups));
}
console.log(`avg wave ${(totalWave / runs).toFixed(1)} · ${Date.now() - t0} ms`);
