/**
 * RIFTBURN — the rules the room enforces.
 *
 * The shooting itself is real-time and runs in the browser (a 60 Hz twin-stick
 * arena can't round-trip a socket per bullet). What lives HERE is everything that
 * must be trusted and must persist:
 *
 *   * each pilot's profile: callsign, salvage (the meta currency), armory levels,
 *     personal best;
 *   * the room's squad board — share `?room=<name>` and up to 8 pilots compete on
 *     one leaderboard, with a live "currently on wave N" status;
 *   * the economy: salvage is AWARDED here from a finished run (never trusted
 *     from the client) and SPENT here on permanent armory upgrades.
 *
 * Pure and deterministic: no imports, no clock, no randomness.
 */

export const meta = {
  game: "RIFTBURN",
  minPlayers: 1,
  maxPlayers: 8,
};

/** Permanent upgrades. cost(level) = round5(base * growth^level). */
const ARMORY = [
  { id: "hull", max: 10, base: 60, growth: 1.42 },
  { id: "dmg", max: 10, base: 80, growth: 1.45 },
  { id: "rate", max: 10, base: 80, growth: 1.45 },
  { id: "speed", max: 5, base: 70, growth: 1.6 },
  { id: "magnet", max: 5, base: 50, growth: 1.55 },
  { id: "dash", max: 5, base: 90, growth: 1.6 },
  { id: "scav", max: 10, base: 100, growth: 1.4 },
  { id: "reroll", max: 3, base: 250, growth: 2.2 },
  { id: "head", max: 2, base: 600, growth: 2.5 },
  { id: "revive", max: 1, base: 1500, growth: 1 },
];

const NAME_RE = /^[A-Za-z0-9 _-]{1,14}$/;
const MAX_SALVAGE_PER_RUN = 6000;
const MAX_BANK = 9999999;

function costOf(item, level) {
  return Math.round((item.base * Math.pow(item.growth, level)) / 5) * 5;
}

function findItem(id) {
  for (let i = 0; i < ARMORY.length; i++) if (ARMORY[i].id === id) return ARMORY[i];
  return null;
}

function freshProfile() {
  return {
    name: "",
    salvage: 0,
    earned: 0,
    runs: 0,
    kills: 0,
    best: { score: 0, wave: 0, time: 0 },
    up: {},
    last: null,
    live: null,
  };
}

function profileOf(state, playerId) {
  const p = state.players && state.players[playerId];
  return p || freshProfile();
}

function isInt(v, lo, hi) {
  return Number.isInteger(v) && v >= lo && v <= hi;
}

function bad(error) {
  return { ok: false, error };
}

/** Salvage a finished run is worth. The single source of truth for the payout. */
function salvageFor(profile, run) {
  const scav = (profile.up && profile.up.scav) || 0;
  const base = Math.floor(run.score / 120) + run.wave * 6 + run.bosses * 60;
  const mult = (1 + 0.1 * scav) * (run.extract ? 1.25 : 1);
  return Math.min(MAX_SALVAGE_PER_RUN, Math.floor(base * mult));
}

/**
 * Seats join one at a time and `setup` only runs for the first, so profiles are
 * created lazily (see profileOf) rather than here.
 */
export function setup(players) {
  const state = { v: 1, players: {} };
  for (let i = 0; i < players.length; i++) state.players[players[i]] = freshProfile();
  return state;
}

/**
 * The gatekeeper. The client is untrusted: every number of a submitted run is
 * bounds-checked AND cross-checked against the others, so a forged "score:
 * 999999999" cannot mint salvage or top the board.
 */
export function validateAction(state, playerId, action) {
  if (!action || typeof action !== "object" || Array.isArray(action)) return bad("bad action");
  const me = profileOf(state, playerId);

  switch (action.t) {
    case "name": {
      if (typeof action.name !== "string" || !NAME_RE.test(action.name) || !action.name.trim()) {
        return bad("callsign must be 1-14 letters, digits, spaces, - or _");
      }
      return { ok: true };
    }
    case "buy": {
      const item = findItem(action.id);
      if (!item) return bad("unknown armory item");
      const level = (me.up && me.up[item.id]) || 0;
      if (level >= item.max) return bad("already at max level");
      if (me.salvage < costOf(item, level)) return bad("not enough salvage");
      return { ok: true };
    }
    case "live": {
      if (!isInt(action.wave, 0, 9999)) return bad("bad wave");
      if (!isInt(action.score, 0, 2000000000)) return bad("bad score");
      return { ok: true };
    }
    case "run": {
      if (!isInt(action.id, 1, 2000000000)) return bad("bad run id");
      if (me.last && me.last.id === action.id) return bad("run already recorded");
      if (!isInt(action.time, 5, 14400)) return bad("bad run time");
      if (!isInt(action.wave, 1, 500)) return bad("bad wave");
      if (!isInt(action.kills, 0, 1000000)) return bad("bad kills");
      if (!isInt(action.bosses, 0, 100)) return bad("bad boss count");
      if (!isInt(action.score, 0, 2000000000)) return bad("bad score");
      if (action.extract !== undefined && typeof action.extract !== "boolean") return bad("bad extract flag");
      // Cross-checks: each figure must be reachable given the others.
      if (action.wave > 1 + Math.floor(action.time / 6)) return bad("wave not reachable in that time");
      if (action.kills > action.time * 40 + 60) return bad("kill count not reachable in that time");
      if (action.bosses > Math.floor(action.wave / 5)) return bad("boss count not reachable at that wave");
      if (action.extract && action.bosses < 3) return bad("extraction needs the rift sealed");
      const cap = action.kills * 1500 + action.bosses * 30000 + action.wave * 3000;
      if (action.score > cap) return bad("score not reachable with those kills");
      return { ok: true };
    }
    default:
      return bad("unknown action");
  }
}

/** Returns a NEW state; the old one is never mutated. */
export function applyAction(state, playerId, action) {
  const prev = profileOf(state, playerId);
  const me = {
    ...prev,
    best: { ...prev.best },
    up: { ...prev.up },
  };

  if (action.t === "name") {
    me.name = action.name.trim().replace(/\s+/g, " ");
  } else if (action.t === "buy") {
    const item = findItem(action.id);
    const level = me.up[item.id] || 0;
    me.salvage -= costOf(item, level);
    me.up[item.id] = level + 1;
  } else if (action.t === "live") {
    me.live = action.wave > 0 ? { wave: action.wave, score: action.score } : null;
  } else if (action.t === "run") {
    const gained = salvageFor(me, action);
    const isBest = action.score > me.best.score;
    if (isBest) me.best = { score: action.score, wave: action.wave, time: action.time };
    me.salvage = Math.min(MAX_BANK, me.salvage + gained);
    me.earned = Math.min(MAX_BANK, me.earned + gained);
    me.runs += 1;
    me.kills = Math.min(2000000000, me.kills + action.kills);
    me.live = null;
    me.last = {
      id: action.id,
      score: action.score,
      wave: action.wave,
      time: action.time,
      kills: action.kills,
      bosses: action.bosses,
      extract: Boolean(action.extract),
      salvage: gained,
      best: isBest,
    };
  }

  return { ...state, players: { ...(state.players || {}), [playerId]: me } };
}

/** A run ends in the browser; the room itself never ends. */
export function isGameOver() {
  return { over: false };
}

/**
 * What one pilot receives: their own full profile, the armory price list, and
 * the squad board. Other pilots appear by callsign and results only — never by
 * playerId, which doubles as their seat claim.
 */
export function viewFor(state, playerId) {
  const players = (state && state.players) || {};
  const you = profileOf(state || {}, playerId);

  const board = [];
  for (const id of Object.keys(players)) {
    const p = players[id];
    if (id !== playerId && !p.runs && !p.live) continue;
    board.push({
      name: p.name || "Pilot",
      score: p.best.score,
      wave: p.best.wave,
      time: p.best.time,
      runs: p.runs,
      live: p.live,
      me: id === playerId,
    });
  }
  if (!players[playerId]) {
    board.push({ name: "Pilot", score: 0, wave: 0, time: 0, runs: 0, live: null, me: true });
  }
  board.sort((a, b) => b.score - a.score || b.wave - a.wave);

  const catalog = ARMORY.map((item) => {
    const costs = [];
    for (let level = 0; level < item.max; level++) costs.push(costOf(item, level));
    return { id: item.id, max: item.max, costs };
  });

  return { you, board, catalog };
}
