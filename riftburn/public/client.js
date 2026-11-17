/**
 * RIFTBURN client: menus, HUD, the frame loop, and the glue between the
 * simulation (game/game.js), the renderer, the mixer, input and the room.
 */

import { CFG, STR, UPGRADES, RARITY } from "./game/data.js";
import { createRun, step, applyUpgrade, rollOffers, continueEndless, comboMult, summary } from "./game/game.js";
import { createRenderer } from "./game/render.js";
import { createAudio } from "./game/audio.js";
import { createInput } from "./game/input.js";
import { createNet } from "./game/net.js";

const $ = (sel) => document.querySelector(sel);
const fmt = (n) => Math.floor(n).toLocaleString("en-US");
const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** Tiny DOM builder. Text always goes in as text nodes, never as markup. */
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const key of Object.keys(attrs)) {
      const v = attrs[key];
      if (v === undefined || v === null || v === false) continue;
      if (key === "class") el.className = v;
      else if (key === "on") for (const ev of Object.keys(v)) el.addEventListener(ev, v[ev]);
      else if (key === "style") el.setAttribute("style", v);
      else if (key in el && key !== "list") el[key] = v;
      else el.setAttribute(key, v);
    }
  }
  for (const kid of kids.flat()) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

// ── settings ───────────────────────────────────────────────────────────────
const coarse = matchMedia("(pointer: coarse)").matches;
const settings = { music: 0.7, sfx: 0.8, shake: true, flash: true, numbers: true, autoFire: false, autoAim: coarse, big: false };
try {
  Object.assign(settings, JSON.parse(localStorage.getItem("riftburn:settings")) || {});
} catch {
  /* defaults */
}
function saveSettings() {
  try {
    localStorage.setItem("riftburn:settings", JSON.stringify(settings));
  } catch {
    /* ignore */
  }
  document.body.classList.toggle("big", settings.big);
  audio.apply();
}

// ── modules ────────────────────────────────────────────────────────────────
const canvas = $("#c");
const R = createRenderer(canvas, settings);
const audio = createAudio(settings);
const net = createNet(onNet);
const input = createInput(canvas, settings, {
  gesture: () => audio.unlock(),
  blur: () => {
    if (mode === "run" && !paused && !drafting && S && S.status === "play") pause();
  },
  sticks: drawSticks,
});
document.body.classList.toggle("big", settings.big);

let mode = "menu";
let S = null;
let paused = false;
let drafting = false;
let offers = null;
let draftAt = 0;
let acc = 0;
let deathT = 0;
let overShown = false;
let runId = 0;
let lastSummary = null;
let screen = null;
let screenName = "";
let lastT = performance.now() / 1000;
const dev = new URLSearchParams(location.search).has("dev");
const fpsBuf = [];

// ── fx fan-out: one event from the sim, three listeners ────────────────────
function fx(type, a, b, c, d, e, f) {
  R.fx(type, a, b, c, d, e, f);
  audio.fx(type, a, b, c, d, e, f);
  switch (type) {
    case "wave": {
      const sector = Math.min(3, Math.floor((a - 1) / 5));
      banner(`${STR.wave} ${a}`, (a - 1) % 5 === 0 ? STR.sectorNames[sector] : "");
      audio.setMode("combat");
      live();
      break;
    }
    case "bossIntro":
      banner(STR.bossWarning, STR.bossNames[a], "warn");
      audio.setMode("boss");
      live();
      break;
    case "bossDie":
      audio.setMode("combat");
      break;
    case "intro":
      if (STR.enemyIntro[a]) toast(STR.enemyIntro[a], 3.4);
      break;
    case "waveClear":
      toast(`${STR.waveClear}  +${fmt(a * 100)}`, 1.8);
      break;
    case "odReady":
      toast(STR.overdriveReady, 1.6);
      break;
    case "revive":
      banner(STR.secondWind, "", "gold");
      break;
    default:
      break;
  }
}

function live() {
  if (net.shared && S) net.act({ t: "live", wave: Math.max(1, S.wave), score: Math.floor(S.score) });
}

// ── banners / toasts ───────────────────────────────────────────────────────
const bannerEl = $("#banner");
function banner(title, sub, kind) {
  bannerEl.querySelector("h2").textContent = title;
  bannerEl.querySelector("p").textContent = sub || "";
  bannerEl.className = "";
  void bannerEl.offsetWidth; // restart the animation
  bannerEl.className = "show" + (kind ? " " + kind : "");
}
const toastEl = $("#toast");
let toastTimer = 0;
function toast(text, secs = 2.2) {
  toastEl.textContent = text;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), secs * 1000);
}

// ── screens ────────────────────────────────────────────────────────────────
const screensEl = $("#screens");
let backAction = null;

function show(name, node, onBack) {
  screensEl.textContent = "";
  screen = node;
  screenName = name;
  backAction = onBack || null;
  if (node) {
    node.id = "s-" + name;
    node.classList.add("screen");
    screensEl.append(node);
    const first = node.querySelector("[data-first]") || node.querySelector("button:not(:disabled)");
    if (first && input.device !== "touch") first.focus({ preventScroll: true });
  }
  document.body.classList.toggle("menu", Boolean(node));
}

function btn(label, onClick, cls, extra) {
  return h(
    "button",
    {
      class: "btn" + (cls ? " " + cls : ""),
      type: "button",
      ...extra,
      on: {
        click: () => {
          audio.unlock();
          audio.ui();
          onClick();
        },
      },
    },
    label,
  );
}

function profile() {
  return (net.view && net.view.you) || { name: "", salvage: 0, best: { score: 0, wave: 0, time: 0 }, up: {}, runs: 0, last: null };
}

function connLabel() {
  if (net.online && net.spectator) return STR.spectator;
  return net.online ? STR.online : STR.offline;
}

function titleScreen() {
  mode = "menu";
  S = null;
  $("#hud").hidden = true;
  $("#touch").hidden = true;
  audio.setMode("menu");
  const p = profile();
  const nameInput = h("input", {
    type: "text",
    maxLength: 14,
    value: p.name || "",
    placeholder: "Pilot",
    autocomplete: "off",
    spellcheck: false,
    "aria-label": STR.callsign,
    on: {
      change: (ev) => {
        const v = ev.target.value.replace(/[^A-Za-z0-9 _-]/g, "").trim();
        ev.target.value = v;
        if (v) net.act({ t: "name", name: v });
      },
      keydown: (ev) => {
        if (ev.key === "Enter") ev.target.blur();
        ev.stopPropagation();
      },
    },
  });
  const node = h(
    "section",
    null,
    h(
      "div",
      { class: "title" },
      h("h1", { class: "logo" }, STR.title),
      h("p", { class: "tag" }, STR.tagline),
      h(
        "div",
        { class: "menu" },
        btn(STR.play, startRun, "primary", { "data-first": "1" }),
        btn(STR.armory, armoryScreen),
        btn(STR.squad, squadScreen),
        btn(STR.howto, howtoScreen),
        btn(STR.settings, () => settingsScreen(titleScreen)),
      ),
      h(
        "div",
        { class: "pilot" },
        h("label", null, STR.callsign, nameInput),
        h(
          "div",
          { class: "stats" },
          h("span", null, STR.salvage + " ", h("b", { id: "t-salvage" }, fmt(p.salvage))),
          h("span", null, STR.best + " ", h("b", { id: "t-best" }, p.best.score ? `${fmt(p.best.score)} · ${STR.wave} ${p.best.wave}` : "—")),
        ),
        h("div", { class: "conn" + (net.online && !net.spectator ? " on" : ""), id: "t-conn" }, connLabel()),
      ),
    ),
  );
  node.style.setProperty("--art", "url(/assets/keyart.jpg)");
  show("title", node, null);
}

function armoryScreen() {
  const p = profile();
  const catalog = (net.view && net.view.catalog) || [];
  const node = h(
    "section",
    null,
    h(
      "div",
      { class: "panel" },
      h("div", { class: "row", style: "justify-content:space-between" }, h("h2", null, STR.armory), h("span", { class: "bank" }, "◆ " + fmt(p.salvage))),
      h("p", { class: "sub" }, STR.howtoTips[4]),
      h(
        "div",
        { class: "list" },
        catalog.map((item) => {
          const level = p.up[item.id] || 0;
          const maxed = level >= item.max;
          const cost = maxed ? 0 : item.costs[level];
          const [name, desc] = STR.arm[item.id] || [item.id, ""];
          const pips = [];
          for (let i = 0; i < item.max; i++) pips.push(h("i", { class: i < level ? "on" : "" }));
          return h(
            "div",
            { class: "item" },
            h("div", null, h("h3", null, name), h("p", null, desc), h("div", { class: "pips" }, pips)),
            btn(
              maxed ? STR.max : `◆ ${fmt(cost)}`,
              () => {
                if (net.act({ t: "buy", id: item.id })) audio.ui("pick");
                else audio.ui("deny");
              },
              "",
              { disabled: maxed || p.salvage < cost },
            ),
          );
        }),
      ),
      h("div", { class: "row end" }, btn(STR.back, titleScreen)),
    ),
  );
  show("armory", node, titleScreen);
}

function squadScreen() {
  const board = (net.view && net.view.board) || [];
  const link = net.squadLink();
  const copy = btn(STR.copyLink, async () => {
    try {
      await navigator.clipboard.writeText(link);
      copy.textContent = STR.copied;
    } catch {
      /* the link is selectable right there as a fallback */
    }
  });
  const rows = board.map((row, i) =>
    h(
      "tr",
      { class: row.me ? "me" : "" },
      h("td", null, String(i + 1)),
      h("td", null, row.name, row.live ? h("div", { class: "live" }, `${STR.live} ${row.live.wave}`) : null),
      h("td", { class: "n" }, row.score ? fmt(row.score) : "—"),
      h("td", { class: "n" }, row.wave || "—"),
      h("td", { class: "n" }, row.time ? clock(row.time) : "—"),
    ),
  );
  const node = h(
    "section",
    null,
    h(
      "div",
      { class: "panel" },
      h("h2", null, STR.squad),
      h("p", { class: "sub" }, STR.squadHelp),
      h("div", { class: "link" }, h("code", null, link), copy),
      h("div", { class: "conn" + (net.online && !net.spectator ? " on" : "") }, connLabel()),
      h(
        "table",
        { style: "margin-top:12px" },
        h("thead", null, h("tr", null, h("th", null, "#"), h("th", null, STR.callsign), h("th", { class: "n" }, STR.best), h("th", { class: "n" }, STR.wave), h("th", { class: "n" }, "Time"))),
        h("tbody", null, rows.length ? rows : h("tr", null, h("td", { colSpan: 5 }, STR.noRuns))),
      ),
      h("div", { class: "row end" }, btn(STR.back, titleScreen)),
    ),
  );
  show("squad", node, titleScreen);
}

function howtoScreen() {
  const node = h(
    "section",
    null,
    h(
      "div",
      { class: "panel wide" },
      h("h2", null, STR.howto),
      h(
        "table",
        { style: "margin-top:10px" },
        h("thead", null, h("tr", null, STR.howtoCols.map((c) => h("th", null, c)))),
        h("tbody", null, STR.howtoRows.map((row) => h("tr", null, row.map((c) => h("td", null, c))))),
      ),
      h("ul", { class: "tips" }, STR.howtoTips.map((t) => h("li", null, t))),
      h("div", { class: "row end" }, btn(STR.back, titleScreen)),
    ),
  );
  show("howto", node, titleScreen);
}

function settingsScreen(back) {
  const slider = (key) =>
    h("input", {
      type: "range",
      min: 0,
      max: 1,
      step: 0.05,
      value: settings[key],
      "aria-label": key,
      on: {
        input: (ev) => {
          settings[key] = Number(ev.target.value);
          saveSettings();
          if (key === "sfx") audio.ui();
        },
      },
    });
  const toggle = (key) => {
    const b = btn(settings[key] ? "ON" : "OFF", () => {
      settings[key] = !settings[key];
      b.textContent = settings[key] ? "ON" : "OFF";
      b.classList.toggle("on", settings[key]);
      saveSettings();
    }, "tog" + (settings[key] ? " on" : ""));
    return b;
  };
  const node = h(
    "section",
    null,
    h(
      "div",
      { class: "panel" },
      h("h2", null, STR.settings),
      h(
        "div",
        { class: "set", style: "margin-top:14px" },
        h("span", null, STR.setMusic), slider("music"),
        h("span", null, STR.setSfx), slider("sfx"),
        h("span", null, STR.setAutoAim), toggle("autoAim"),
        h("span", null, STR.setAutoFire), toggle("autoFire"),
        h("span", null, STR.setShake), toggle("shake"),
        h("span", null, STR.setFlash), toggle("flash"),
        h("span", null, STR.setNumbers), toggle("numbers"),
        h("span", null, STR.setBig), toggle("big"),
      ),
      h("div", { class: "row end" }, btn(STR.back, back)),
    ),
  );
  show("settings", node, back);
}

// ── run flow ───────────────────────────────────────────────────────────────
function startRun() {
  audio.unlock();
  const p = profile();
  R.reset();
  S = createRun({ seed: (Math.random() * 4294967296) >>> 0, armory: { ...p.up }, fx });
  mode = "run";
  paused = false;
  drafting = false;
  overShown = false;
  acc = 0;
  hud.reset();
  show("", null);
  $("#hud").hidden = false;
  $("#touch").hidden = input.device !== "touch";
  audio.setMode("combat");
  if (S.pendingLevels > 0) openDraft();
}

function pause() {
  if (mode !== "run" || !S || S.status !== "play" || drafting || paused) return;
  paused = true;
  audio.setMode("paused");
  pauseScreen();
}
function pauseScreen() {
  const owned = Object.keys(S.ups);
  const node = h(
    "section",
    null,
    h(
      "div",
      { class: "panel center" },
      h("h2", null, STR.paused),
      h("p", { class: "sub" }, `${STR.wave} ${Math.max(1, S.wave)} · ${STR.score} ${fmt(S.score)} · ${clock(S.time)}`),
      owned.length ? h("div", { class: "mut" }, owned.map((id) => h("span", null, `${STR.up[id][0]} ×${S.ups[id]}`))) : null,
      h(
        "div",
        { class: "row center", style: "margin-top:18px" },
        btn(STR.resume, resume, "primary", { "data-first": "1" }),
        btn(STR.settings, () => settingsScreen(pauseScreen)),
        btn(STR.abandon, endRun),
      ),
    ),
  );
  show("pause", node, resume);
}
function resume() {
  paused = false;
  show("", null);
  audio.setMode(S.boss ? "boss" : "combat");
  lastT = performance.now() / 1000;
}

function openDraft() {
  offers = rollOffers(S);
  if (!offers.length) {
    S.pendingLevels = 0;
    return;
  }
  drafting = true;
  draftAt = performance.now();
  audio.setMode("draft");
  const cards = offers.map((id, i) => {
    const def = UPGRADES.find((u) => u.id === id);
    const have = S.ups[id] || 0;
    const [name, desc] = STR.up[id];
    const pips = [];
    for (let k = 0; k < def.max; k++) pips.push(h("i", { class: k < have ? "on" : k === have ? "next" : "" }));
    return h(
      "button",
      { class: "card", type: "button", style: `--rc:${RARITY[def.rarity].color}`, "data-first": i === 0 ? "1" : undefined, on: { click: () => pick(i) } },
      h("span", { class: "key" }, String(i + 1)),
      have === 0 ? h("span", { class: "new" }, STR.newTag) : null,
      h("div", { class: "ico" }, def.icon),
      h("div", { class: "body" }, h("div", { class: "rar" }, STR.rarity[def.rarity]), h("h3", null, name), h("p", null, desc)),
      h("div", { class: "pips" }, pips),
    );
  });
  const node = h(
    "section",
    null,
    h(
      "div",
      { class: "panel wide center" },
      h("h2", { style: "color:var(--gold)" }, STR.levelUp),
      h("p", { class: "sub" }, `${STR.level} ${S.player.level} · ${STR.pickOne}`),
      h("div", { class: "cards" }, cards),
      h(
        "div",
        { class: "row center", style: "margin-top:16px" },
        btn(`${STR.reroll} (${S.rerolls} ${STR.rerollsLeft})`, reroll, "", { disabled: S.rerolls <= 0 }),
      ),
    ),
  );
  show("draft", node, null);
}
function pick(i) {
  // a short lock so a mashed fire button can't choose for the player
  if (!drafting || performance.now() - draftAt < 320) return;
  applyUpgrade(S, offers[i]);
  S.pendingLevels -= 1;
  audio.ui("pick");
  if (S.pendingLevels > 0) {
    openDraft();
    return;
  }
  drafting = false;
  show("", null);
  S.player.inv = Math.max(S.player.inv, 0.6);
  audio.setMode(S.boss ? "boss" : "combat");
  lastT = performance.now() / 1000;
}
function reroll() {
  if (S.rerolls <= 0) return;
  S.rerolls -= 1;
  openDraft();
  draftAt = 0;
}

function victoryScreen() {
  audio.setMode("draft");
  banner(STR.victory, "", "gold");
  const node = h(
    "section",
    null,
    h(
      "div",
      { class: "panel center" },
      h("h2", { style: "color:var(--gold)" }, STR.victory),
      h("p", { class: "sub", style: "margin:10px auto 0;max-width:520px" }, STR.victoryBody),
      h(
        "div",
        { class: "row center", style: "margin-top:20px" },
        btn(STR.extract, () => {
          S.extract = true;
          endRun();
        }, "primary", { "data-first": "1" }),
        btn(STR.stay, () => {
          continueEndless(S);
          show("", null);
          audio.setMode("combat");
          lastT = performance.now() / 1000;
        }),
      ),
    ),
  );
  show("victory", node, null);
}

function endRun() {
  if (overShown) return;
  overShown = true;
  paused = false;
  drafting = false;
  lastSummary = summary(S);
  const s = lastSummary;
  runId = S.time >= 5 ? net.submitRun(s) : 0;
  audio.setMode("over");
  overScreen();
}

function overScreen() {
  const s = lastSummary;
  const p = profile();
  const rec = p.last && p.last.id === runId ? p.last : null;
  const title = s.extract ? STR.extracted : STR.gameOver;
  const owned = S ? Object.keys(S.ups) : [];
  const node = h(
    "section",
    null,
    h(
      "div",
      { class: "panel center" },
      rec && rec.best ? h("div", { class: "badge" }, STR.newBest) : null,
      h("h2", { style: s.extract ? "color:var(--gold)" : "color:var(--red)" }, title),
      h(
        "div",
        { class: "results" },
        h("div", null, h("b", null, fmt(s.score)), h("span", null, STR.score)),
        h("div", null, h("b", null, String(s.wave)), h("span", null, STR.wave)),
        h("div", null, h("b", null, fmt(s.kills)), h("span", null, "Kills")),
        h("div", null, h("b", null, clock(s.time)), h("span", null, "Time")),
        h("div", null, h("b", null, "×" + s.combo), h("span", null, "Best chain")),
      ),
      h("div", { class: "payout" }, h("span", null, STR.salvageEarned), h("b", null, rec ? "◆ " + fmt(rec.salvage) : runId ? STR.salvagePending : "—")),
      owned.length ? h("div", { class: "mut" }, owned.map((id) => h("span", null, `${STR.up[id][0]} ×${S.ups[id]}`))) : null,
      h(
        "div",
        { class: "row center", style: "margin-top:20px" },
        btn(STR.retry, startRun, "primary", { "data-first": "1" }),
        btn(STR.armory, armoryScreen),
        btn(STR.menu, titleScreen),
      ),
    ),
  );
  show("over", node, titleScreen);
}

/** The room (or the local rules) changed something: redraw whatever shows it. */
function onNet() {
  if (!screenName) return;
  if (screenName === "armory") armoryScreen();
  else if (screenName === "squad") squadScreen();
  else if (screenName === "over") overScreen();
  else if (screenName === "title") {
    const p = profile();
    const sal = $("#t-salvage");
    if (sal) sal.textContent = fmt(p.salvage);
    const best = $("#t-best");
    if (best) best.textContent = p.best.score ? `${fmt(p.best.score)} · ${STR.wave} ${p.best.wave}` : "—";
    const conn = $("#t-conn");
    if (conn) {
      conn.textContent = connLabel();
      conn.classList.toggle("on", net.online && !net.spectator);
    }
    const inp = screen && screen.querySelector(".pilot input");
    if (inp && document.activeElement !== inp && !inp.value && p.name) inp.value = p.name;
  }
}

// ── HUD ────────────────────────────────────────────────────────────────────
const hud = (() => {
  const el = {
    hp: $("#hp"),
    hpFill: $("#hp .fill"),
    hpGhost: $("#hp .ghost"),
    hpText: $("#hp b"),
    xp: $("#xp i"),
    lv: $("#lv"),
    wave: $("#wave"),
    left: $("#left"),
    boss: $("#boss"),
    bossName: $("#boss .name"),
    bossFill: $("#boss .bar i"),
    score: $("#score"),
    combo: $("#combo"),
    comboX: $("#combo .x"),
    comboN: $("#combo small"),
    comboT: $("#combo .t"),
    dash: $("#c-dash"),
    dashFill: $("#c-dash i"),
    dashKey: $("#c-dash kbd"),
    od: $("#c-od"),
    odFill: $("#c-od i"),
    odKey: $("#c-od kbd"),
    tDash: $("#t-dash i"),
    tOd: $("#t-od"),
    tOdFill: $("#t-od i"),
  };
  const last = {};
  const set = (key, value, apply) => {
    if (last[key] !== value) {
      last[key] = value;
      apply(value);
    }
  };
  return {
    reset() {
      for (const key of Object.keys(last)) delete last[key];
    },
    update() {
      const p = S.player;
      const st = S.stats;
      const hpf = Math.max(0, p.hp / st.maxHp);
      set("hp", Math.round(hpf * 500), () => {
        el.hpFill.style.transform = `scaleX(${hpf})`;
        el.hpGhost.style.transform = `scaleX(${hpf})`;
      });
      set("hpt", `${Math.ceil(p.hp)} / ${st.maxHp}`, (v) => (el.hpText.textContent = v));
      set("low", hpf < 0.3, (v) => el.hp.classList.toggle("low", v));
      set("xp", Math.round((p.xp / p.xpNeed) * 300), (v) => (el.xp.style.transform = `scaleX(${v / 300})`));
      set("lv", `${p.level}|${p.shield}|${S.revives}`, () => {
        el.lv.textContent = `${STR.level} ${p.level}` + (st.aegis ? (p.shield ? "  ⛨" : "  ⛨…") : "") + (S.revives ? "  ♥+" : "");
      });
      set("wave", S.wave, (v) => (el.wave.textContent = `${STR.wave} ${Math.max(1, v)}`));
      const remaining = S.enemies.length + S.queue.reduce((n, g) => n + g.count, 0) + S.portals.reduce((n, g) => n + (g.count - g.emitted), 0);
      set("left", S.phase === "break" ? -1 : remaining, (v) => (el.left.textContent = v < 0 ? "" : `${v} ${STR.hostiles}`));
      const boss = S.boss;
      set("boss", boss ? boss.type : "", (v) => {
        el.boss.hidden = !v;
        if (v) el.bossName.textContent = STR.bossNames[v];
      });
      if (boss) set("bossHp", Math.round((boss.hp / boss.maxHp) * 500), (v) => (el.bossFill.style.transform = `scaleX(${Math.max(0, v / 500)})`));
      set("score", Math.floor(S.score), (v) => (el.score.textContent = fmt(v)));
      set("combo", S.combo >= 5 ? S.combo : 0, (v) => {
        el.combo.classList.toggle("on", v > 0);
        if (v) {
          el.comboX.textContent = "×" + comboMult(S).toFixed(2);
          el.comboN.textContent = `${v} CHAIN`;
        }
      });
      if (S.combo >= 5) el.comboT.style.transform = `scaleX(${Math.max(0, S.comboT / CFG.combo.window)})`;
      const dashF = 1 - Math.min(1, p.dashCd / st.dashCd);
      set("dash", Math.round(dashF * 60), () => {
        el.dashFill.style.transform = `scaleX(${dashF})`;
        el.tDash.style.transform = `scaleY(${dashF})`;
        el.dash.classList.toggle("ready", dashF >= 1);
      });
      const odF = p.odT > 0 ? p.odT / CFG.overdrive.time : p.od / CFG.overdrive.need;
      set("od", Math.round(odF * 100) + (p.odT > 0 ? 1000 : 0), () => {
        el.odFill.style.transform = `scaleX(${odF})`;
        el.tOdFill.style.transform = `scaleY(${odF})`;
        const ready = p.odT <= 0 && odF >= 1;
        el.od.classList.toggle("ready", ready);
        el.tOd.classList.toggle("ready", ready);
      });
      set("dev", input.device, (v) => {
        el.dashKey.textContent = v === "pad" ? "A / LB" : "SPACE";
        el.odKey.textContent = v === "pad" ? "Y / RB" : "Q / RMB";
        $("#touch").hidden = v !== "touch";
        R.mouse = null;
      });
    },
  };
})();

// ── touch controls ─────────────────────────────────────────────────────────
const stickL = $("#stickL");
const stickR = $("#stickR");
function drawSticks(I) {
  for (const [el, s] of [[stickL, I.left], [stickR, I.right]]) {
    el.hidden = s.id === null;
    if (s.id !== null) {
      el.style.left = s.ox + "px";
      el.style.top = s.oy + "px";
      el.firstElementChild.style.transform = `translate(${s.x * 40}px, ${s.y * 40}px)`;
    }
  }
}
for (const [id, name] of [["#t-dash", "dash"], ["#t-od", "od"], ["#t-pause", "pause"]]) {
  $(id).addEventListener(
    "touchstart",
    (ev) => {
      ev.preventDefault();
      audio.unlock();
      input.press(name);
    },
    { passive: false },
  );
  $(id).addEventListener("click", () => input.press(name));
}

// draft hotkeys
addEventListener("keydown", (ev) => {
  if (!drafting || ev.repeat) return;
  if (ev.code === "Digit1" || ev.code === "Numpad1") pick(0);
  else if (ev.code === "Digit2" || ev.code === "Numpad2") pick(1);
  else if (ev.code === "Digit3" || ev.code === "Numpad3") pick(2);
  else if (ev.code === "KeyR") reroll();
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    if (mode === "run" && S && S.status === "play" && !drafting) pause();
    audio.suspend(true);
  } else {
    audio.suspend(false);
    lastT = performance.now() / 1000;
  }
});
addEventListener("resize", () => R.resize());

/** Gamepad focus navigation for whichever screen is up. */
function padMenus(pad) {
  if (!pad || !screen) return;
  const items = [...screen.querySelectorAll("button:not(:disabled), input")];
  if (!items.length) return;
  const at = items.indexOf(document.activeElement);
  const move = pad.navX || pad.navY;
  if (move) {
    const next = at < 0 ? 0 : (at + (move > 0 ? 1 : -1) + items.length) % items.length;
    items[next].focus();
    audio.ui();
  }
  if (pad.confirm && at >= 0 && items[at].tagName === "BUTTON") items[at].click();
  if (pad.back && backAction) backAction();
}

// ── frame loop ─────────────────────────────────────────────────────────────
function aimFrom(mx, my) {
  const w = R.toWorld(mx, my);
  return Math.atan2(w.y - S.player.y, w.x - S.player.x);
}

function frame(ts) {
  requestAnimationFrame(frame);
  const now = ts / 1000;
  const dt = Math.min(0.1, Math.max(0, now - lastT));
  lastT = now;

  if (mode !== "run" || !S) {
    const inp = input.frame(() => null);
    padMenus(inp.pad);
    R.drawIdle(now);
    return;
  }

  const inp = input.frame(aimFrom);
  if (screen) {
    padMenus(inp.pad);
    if (inp.pause && paused && screenName === "pause") resume();
  } else if (inp.pause) {
    pause();
  }

  const running = !paused && !drafting && S.status === "play";
  if (running) {
    if (S.slowmo > 0) S.slowmo -= dt;
    acc += dt * (S.slowmo > 0 ? 0.3 : 1);
    let steps = 0;
    while (acc >= CFG.step && steps < 5) {
      step(S, inp, CFG.step);
      inp.dash = false;
      inp.od = false;
      acc -= CFG.step;
      steps++;
      if (S.status !== "play" || S.pendingLevels > 0) break;
    }
    if (steps === 5) acc = 0;
    if (S.status === "dead") deathT = 1.5;
    else if (S.status === "victory") victoryScreen();
    else if (S.pendingLevels > 0) openDraft();
  } else if (S.status === "dead" && !overShown) {
    deathT -= dt;
    if (deathT <= 0) endRun();
  }

  R.mouse = input.device === "kbm" && input.mouse.seen && !screen ? input.mouse : null;
  R.draw(S, paused || drafting ? 0 : dt, now);
  hud.update();

  if (dev) {
    fpsBuf.push(dt);
    if (fpsBuf.length > 60) fpsBuf.shift();
    const avg = fpsBuf.reduce((a, b) => a + b, 0) / fpsBuf.length;
    const el = $("#dev");
    el.hidden = false;
    el.textContent = `${(1 / avg).toFixed(0)} fps  ${(avg * 1000).toFixed(1)} ms\nenemies ${S.enemies.length}  bullets ${S.bullets.length}/${S.ebullets.length}\npickups ${S.pickups.length}  particles ${R.stats.particles}  sprites ${R.stats.draws}`;
  }
}

// ── boot ───────────────────────────────────────────────────────────────────
async function boot() {
  R.resize();
  const bar = $("#loading .bar i");
  audio.loadMusic("/assets/music.m4a");
  await R.load((f) => (bar.style.transform = `scaleX(${f})`));
  $("#loading").remove();
  titleScreen();
  requestAnimationFrame(frame);
}
boot();

// Android shell: the hardware back button asks the game first (1 = handled).
window.__rbBack = () => {
  if (mode === "run" && !screen && S && S.status === "play") {
    pause();
    return 1;
  }
  if (backAction) {
    backAction();
    return 1;
  }
  return 0;
};

// hooks for automated play-tests (tools/playtest.mjs)
window.__rb = {
  get S() {
    return S;
  },
  get net() {
    return net;
  },
  start: startRun,
  input,
  settings,
  pick,
  state: () => ({ mode, paused, drafting, screen: screenName }),
};
