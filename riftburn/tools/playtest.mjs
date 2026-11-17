/**
 * Browser smoke test: boots the real page, starts a run, feeds it input for a
 * while and fails on any console error or page crash. Screenshots land in the
 * directory given as argv[3].
 *
 *   node tools/dev-server.mjs 8787 &   then   node tools/playtest.mjs http://localhost:8787 <outdir>
 */
import { createRequire } from "node:module";

const { chromium } = createRequire(import.meta.url)("playwright");

const url = process.argv[2] || "http://localhost:8787";
const out = process.argv[3] || ".";
const mobile = process.argv[4] === "mobile";
const errors = [];

const browser = await chromium.launch();
const ctx = await browser.newContext(
  mobile ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true } : { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 },
);
const page = await ctx.newPage();
page.on("console", (m) => {
  if (m.type() === "error" && !/Failed to load resource|WebSocket|ERR_/.test(m.text())) errors.push(m.text());
});
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

await page.goto(url + "/?dev=1");
await page.waitForSelector("#s-title", { timeout: 15000 });
await page.screenshot({ path: `${out}/01-title.png` });

await page.click("#s-title .btn.primary");
await page.waitForFunction(() => window.__rb.S && window.__rb.S.wave >= 1, null, { timeout: 10000 });

// drive the run with a simple scripted pilot through the real input layer
await page.evaluate(() => {
  const rb = window.__rb;
  rb.settings.autoAim = true;
  window.__bot = setInterval(() => {
    const S = rb.S;
    if (!S) return;
    const st = rb.state();
    if (st.drafting) rb.pick(Math.floor(Math.random() * 3));
    const t = performance.now() / 1000;
    const k = (code, down) => dispatchEvent(new KeyboardEvent(down ? "keydown" : "keyup", { code }));
    k("KeyW", Math.sin(t * 0.9) > 0.3);
    k("KeyS", Math.sin(t * 0.9) < -0.3);
    k("KeyD", Math.cos(t * 0.7) > 0.3);
    k("KeyA", Math.cos(t * 0.7) < -0.3);
    if (Math.random() < 0.02) k("Space", true), k("Space", false);
    if (S.player.od >= 100) k("KeyQ", true), k("KeyQ", false);
  }, 50);
});

const shots = [6, 14, 26, 40];
let prev = 0;
for (const [i, at] of shots.entries()) {
  await page.waitForTimeout((at - prev) * 1000);
  prev = at;
  const info = await page.evaluate(() => {
    const S = window.__rb.S;
    return S ? { wave: S.wave, hp: Math.round(S.player.hp), lvl: S.player.level, enemies: S.enemies.length, score: S.score, status: S.status, dev: document.querySelector("#dev").textContent.split("\n")[0] } : null;
  });
  console.log(`t=${at}s`, JSON.stringify(info), JSON.stringify(await page.evaluate(() => window.__rb.state())));
  await page.screenshot({ path: `${out}/0${i + 2}-play.png` });
}

await page.evaluate(() => clearInterval(window.__bot));
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/06-pause.png` });

await browser.close();
if (errors.length) {
  console.error("ERRORS:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("ok — no console errors");
