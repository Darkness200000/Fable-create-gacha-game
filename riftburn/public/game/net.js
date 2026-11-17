/**
 * The room connection. The server holds each pilot's profile, the armory
 * economy and the squad board (see src/logic.js); this file sends intents and
 * mirrors whatever view comes back.
 *
 * If the socket can't be reached — or the squad room is full and we are only a
 * spectator — the very same rules module runs locally against localStorage, so
 * the game is fully playable offline with identical prices and payouts.
 */

const PING = "__ping";
const PONG = "__pong";
const LS = {
  id: "hf:game:playerId",
  local: "riftburn:local",
  pending: "riftburn:pendingRun",
};

function store(key, value) {
  try {
    if (value === undefined) return JSON.parse(localStorage.getItem(key));
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode / quota: progress just won't persist */
  }
  return null;
}

function randomId(n) {
  const abc = "abcdefghijkmnpqrstuvwxyz23456789";
  const buf = new Uint8Array(n);
  crypto.getRandomValues(buf);
  let s = "";
  for (let i = 0; i < n; i++) s += abc[buf[i] % abc.length];
  return s;
}

export function createNet(onChange) {
  let playerId = null;
  try {
    playerId = localStorage.getItem(LS.id);
    if (!playerId) {
      playerId = randomId(16);
      localStorage.setItem(LS.id, playerId);
    }
  } catch {
    playerId = randomId(16);
  }

  const param = new URLSearchParams(location.search).get("room");
  const shared = Boolean(param && /^[A-Za-z0-9_-]{1,64}$/.test(param));
  const room = shared ? param : "p-" + playerId;

  const N = {
    playerId,
    room,
    shared,
    online: false,
    spectator: false,
    view: null,
    connected: 0,
    error: null,
  };

  let socket = null;
  let retry = 0;
  let logic = null;
  let serverView = null;

  // local rules — the offline twin of the room
  import("/logic.js")
    .then((mod) => {
      logic = mod;
      refresh();
    })
    .catch(() => {});

  function localState() {
    return store(LS.local) || (logic ? logic.setup([playerId]) : null);
  }

  function usingServer() {
    return N.online && !N.spectator && serverView;
  }

  function refresh() {
    if (usingServer()) N.view = serverView;
    else if (logic) N.view = logic.viewFor(localState(), playerId);
    onChange(N);
  }

  function send(msg) {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(msg));
      return true;
    }
    return false;
  }

  /** Send one intent. Returns false (with N.error set) if the rules refuse it. */
  N.act = function act(action) {
    N.error = null;
    if (usingServer()) return send({ type: "action", action });
    if (!logic) return false;
    const state = localState();
    const verdict = logic.validateAction(state, playerId, action);
    if (!verdict.ok) {
      N.error = verdict.error;
      onChange(N);
      return false;
    }
    store(LS.local, logic.applyAction(state, playerId, action));
    refresh();
    return true;
  };

  /**
   * Record a finished run. It is parked in localStorage until the profile shows
   * it as recorded, so a dropped socket at the worst moment can't eat a payout —
   * and the run id makes the retry safe against double-paying.
   */
  N.submitRun = function submitRun(run) {
    const id = 1 + Math.floor(Math.random() * 1999999998);
    const action = { t: "run", id, score: run.score, wave: run.wave, kills: run.kills, bosses: run.bosses, time: run.time };
    if (run.extract) action.extract = true;
    if (usingServer()) store(LS.pending, action);
    N.act(action);
    return id;
  };

  function flushPending() {
    const pending = store(LS.pending);
    if (!pending) return;
    const last = serverView && serverView.you && serverView.you.last;
    if (last && last.id === pending.id) store(LS.pending, null);
    else send({ type: "action", action: pending });
  }

  function connect() {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    try {
      socket = new WebSocket(`${proto}//${location.host}/ws/${encodeURIComponent(room)}`);
    } catch {
      return;
    }
    socket.addEventListener("open", () => {
      retry = 0;
      send({ type: "join", playerId });
    });
    socket.addEventListener("message", (event) => {
      if (event.data === PONG) return;
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      if (msg.type === "state") {
        const first = !N.online;
        N.online = true;
        N.connected = msg.connected || 0;
        N.spectator = Array.isArray(msg.seats) && !msg.seats.includes(playerId);
        serverView = msg.view || null;
        const pending = store(LS.pending);
        if (pending && serverView && serverView.you.last && serverView.you.last.id === pending.id) store(LS.pending, null);
        if (first && !N.spectator) flushPending();
        refresh();
      } else if (msg.type === "error") {
        // "run already recorded" is the retry path succeeding, not a failure
        if (/already recorded/.test(msg.error || "")) store(LS.pending, null);
        else N.error = msg.error;
        onChange(N);
      }
    });
    socket.addEventListener("close", () => {
      N.online = false;
      refresh();
      retry = Math.min(retry + 1, 6);
      setTimeout(connect, 500 * 2 ** (retry - 1));
    });
    socket.addEventListener("error", () => {});
  }

  setInterval(() => {
    if (socket && socket.readyState === WebSocket.OPEN) socket.send(PING);
  }, 30000);

  N.squadLink = function squadLink() {
    return `${location.origin}/?room=${encodeURIComponent(room)}`;
  };

  connect();
  return N;
}
