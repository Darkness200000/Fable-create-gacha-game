/**
 * RIFTBURN's room, exercised through real WebSockets in workerd.
 *
 * Two layers are covered: the wire protocol every game on the template shares
 * (join / action / error frames, untrusted input), and this game's own rules —
 * the salvage economy, the armory, and the squad board. Everything is driven
 * through the PUBLIC surface: connect, send frames, read frames.
 */

import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

/** Open a socket to a room and collect frames as they arrive. */
async function open(room = "main") {
  const res = await SELF.fetch(`https://game.test/ws/${room}`, {
    headers: { Upgrade: "websocket" },
  });
  expect(res.status).toBe(101);
  const ws = res.webSocket;
  if (!ws) throw new Error("no webSocket on the upgrade response");
  ws.accept();

  const frames: unknown[] = [];
  ws.addEventListener("message", (event: MessageEvent) => {
    const data = typeof event.data === "string" ? event.data : "";
    if (data === "__pong") return;
    try {
      frames.push(JSON.parse(data));
    } catch {
      frames.push(data);
    }
  });

  /** Wait for a frame matching `pred` (frames can arrive out of step). */
  const next = async (pred: (f: any) => boolean, label: string) => {
    for (let i = 0; i < 100; i++) {
      const hit = frames.find(pred);
      if (hit) return hit as any;
      await scheduler.wait(10);
    }
    throw new Error(`timed out waiting for ${label}; got ${JSON.stringify(frames)}`);
  };

  return {
    ws,
    frames,
    next,
    send: (msg: unknown) => ws.send(JSON.stringify(msg)),
    act: (action: unknown) => ws.send(JSON.stringify({ type: "action", action })),
    state: () => next((f) => f?.type === "state", "a state frame"),
    error: (text?: string) =>
      next((f) => f?.type === "error" && (text === undefined || f.error === text), `error ${text ?? ""}`),
  };
}

/** A fresh room name per call — Durable Object state persists across tests. */
let seq = 0;
function uniq(label: string): string {
  seq += 1;
  return `${label}-${seq}-${crypto.randomUUID().slice(0, 6)}`;
}

/** Join a room as `id` and wait until the room has dealt us a view. */
async function pilot(room: string, id: string) {
  const p = await open(room);
  p.send({ type: "join", playerId: id });
  await p.next((f) => f?.type === "state" && f.view?.you, "a first view");
  return p;
}

/** A run a real player could plausibly have had. */
const RUN = { t: "run", id: 7, score: 12000, wave: 6, kills: 200, bosses: 1, time: 240 };
/** floor(12000 / 120) + 6 * 6 + 1 * 60 */
const RUN_SALVAGE = 196;

describe("routing", () => {
  it("rejects a non-upgrade request to /ws instead of waking a room", async () => {
    const res = await SELF.fetch("https://game.test/ws");
    expect(res.status).toBe(426);
  });

  it("rejects a room name that isn't a short safe label", async () => {
    const res = await SELF.fetch(`https://game.test/ws/${"x".repeat(80)}`, {
      headers: { Upgrade: "websocket" },
    });
    expect(res.status).toBe(400);
  });
});

describe("joining", () => {
  it("starts the room for a single pilot with a fresh profile", async () => {
    const a = await open(uniq("solo"));
    a.send({ type: "join", playerId: "alice" });
    const s = await a.state();
    expect(s.status).toBe("playing");
    expect(s.meta.game).toBe("RIFTBURN");
    expect(s.view.you.salvage).toBe(0);
    expect(s.view.you.best.score).toBe(0);
    expect(s.view.catalog).toHaveLength(10);
    // The pilot is on their own board before logging a single run.
    expect(s.view.board).toEqual([expect.objectContaining({ me: true, score: 0 })]);
  });

  it("refuses to act before joining", async () => {
    const a = await open(uniq("nojoin"));
    a.act(RUN);
    expect((await a.error()).error).toBe("join first");
  });
});

describe("economy", () => {
  it("pays salvage for a plausible run and records the personal best", async () => {
    const a = await pilot(uniq("run"), "alice");
    a.act(RUN);
    const s = await a.next((f) => f?.type === "state" && f.view?.you?.runs === 1, "the run to land");
    expect(s.view.you.salvage).toBe(RUN_SALVAGE);
    expect(s.view.you.last).toMatchObject({ id: 7, salvage: RUN_SALVAGE, best: true });
    expect(s.view.you.best).toEqual({ score: 12000, wave: 6, time: 240 });
    // The room never ends — a run finishing is not "game over".
    expect(s.status).toBe("playing");
  });

  it("refuses forged runs (the payout is never taken on trust)", async () => {
    const a = await pilot(uniq("forged"), "alice");
    a.act({ ...RUN, id: 1, score: 999999999 });
    await a.error("score not reachable with those kills");
    a.act({ ...RUN, id: 2, wave: 400 });
    await a.error("wave not reachable in that time");
    a.act({ ...RUN, id: 3, kills: 500000 });
    await a.error("kill count not reachable in that time");
    a.act({ ...RUN, id: 4, bosses: 9 });
    await a.error("boss count not reachable at that wave");
    a.act({ ...RUN, id: 5, extract: true });
    await a.error("extraction needs the rift sealed");
    a.act({ ...RUN, id: 6, score: -5 });
    await a.error("bad score");
    a.act({ ...RUN, id: 8, time: 1.5 });
    await a.error("bad run time");
    // Nothing above reached the bank.
    a.act({ t: "live", wave: 1, score: 0 });
    const s = await a.next((f) => f?.type === "state" && f.view?.you?.live, "a live ping");
    expect(s.view.you.salvage).toBe(0);
    expect(s.view.you.runs).toBe(0);
  });

  it("does not pay the same run twice", async () => {
    const a = await pilot(uniq("twice"), "alice");
    a.act(RUN);
    await a.next((f) => f?.type === "state" && f.view?.you?.runs === 1, "the run to land");
    a.act(RUN);
    await a.error("run already recorded");
    a.act({ t: "name", name: "Ace" });
    const s = await a.next((f) => f?.type === "state" && f.view?.you?.name === "Ace", "the rename");
    expect(s.view.you.salvage).toBe(RUN_SALVAGE);
    expect(s.view.you.runs).toBe(1);
  });

  it("sells armory upgrades only when they are affordable", async () => {
    const a = await pilot(uniq("armory"), "alice");
    a.act({ t: "buy", id: "hull" });
    await a.error("not enough salvage");
    a.act({ t: "buy", id: "orbital-laser" });
    await a.error("unknown armory item");

    a.act(RUN);
    await a.next((f) => f?.type === "state" && f.view?.you?.runs === 1, "the run to land");
    a.act({ t: "buy", id: "hull" });
    const s = await a.next((f) => f?.type === "state" && f.view?.you?.up?.hull === 1, "the purchase");
    const price = s.view.catalog.find((c: any) => c.id === "hull").costs[0];
    expect(price).toBe(60);
    expect(s.view.you.salvage).toBe(RUN_SALVAGE - price);
  });

  it("scales the payout with the Scavenger Rig the server has on file", async () => {
    const a = await pilot(uniq("scav"), "alice");
    a.act(RUN);
    await a.next((f) => f?.type === "state" && f.view?.you?.runs === 1, "run one");
    a.act({ t: "buy", id: "scav" });
    await a.next((f) => f?.type === "state" && f.view?.you?.up?.scav === 1, "the rig");
    a.act({ ...RUN, id: 8 });
    const s = await a.next((f) => f?.type === "state" && f.view?.you?.runs === 2, "run two");
    expect(s.view.you.last.salvage).toBe(Math.floor(RUN_SALVAGE * 1.1));
    // Same score is not a new best.
    expect(s.view.you.last.best).toBe(false);
  });

  it("rejects malformed actions and callsigns", async () => {
    const a = await pilot(uniq("junk"), "alice");
    a.act({ t: "teleport" });
    await a.error("unknown action");
    a.act(["run"]);
    await a.error("bad action");
    a.act({ t: "name", name: "<script>alert(1)</script>" });
    await a.error("callsign must be 1-14 letters, digits, spaces, - or _");
    a.act({ t: "name", name: "   " });
    await a.error("callsign must be 1-14 letters, digits, spaces, - or _");
  });
});

describe("squad board", () => {
  it("ranks every pilot in the room and never leaks a playerId", async () => {
    const room = uniq("squad");
    const a = await pilot(room, "alice-secret-id");
    const b = await pilot(room, "bob-secret-id");
    a.act({ t: "name", name: "Alice" });
    b.act({ t: "name", name: "Bob" });
    a.act(RUN);
    b.act({ ...RUN, id: 9, score: 20000 });

    const full = (f: any) =>
      f?.type === "state" && f.view?.board?.length === 2 && f.view.board.every((r: any) => r.score > 0 && r.name !== "Pilot");
    const seenByA = await a.next(full, "both runs on alice's board");
    const seenByB = await b.next(full, "both runs on bob's board");

    expect(seenByA.view.board.map((r: any) => r.name)).toEqual(["Bob", "Alice"]);
    expect(seenByA.view.board.map((r: any) => r.me)).toEqual([false, true]);
    expect(seenByB.view.board.map((r: any) => r.me)).toEqual([true, false]);
    // Each pilot gets their own wallet, and nobody else's.
    expect(seenByA.view.you.name).toBe("Alice");
    expect(seenByB.view.you.name).toBe("Bob");
    expect(JSON.stringify(seenByA.view)).not.toContain("bob-secret-id");
    expect(JSON.stringify(seenByB.view)).not.toContain("alice-secret-id");
  });

  it("shows who is in the field right now", async () => {
    const room = uniq("live");
    const a = await pilot(room, "alice");
    const b = await pilot(room, "bob");
    a.act({ t: "live", wave: 4, score: 3100 });
    const s = await b.next(
      (f) => f?.type === "state" && f.view?.board?.some((r: any) => r.live?.wave === 4),
      "alice's live status on bob's board",
    );
    expect(s.view.board.find((r: any) => !r.me).live).toEqual({ wave: 4, score: 3100 });
  });
});

describe("isolation and persistence", () => {
  it("keeps two rooms completely separate", async () => {
    const a = await pilot(uniq("iso-a"), "alice");
    const b = await pilot(uniq("iso-b"), "alice");
    a.act(RUN);
    await a.next((f) => f?.type === "state" && f.view?.you?.runs === 1, "the run to land");
    b.act({ t: "name", name: "Elsewhere" });
    const s = await b.next((f) => f?.type === "state" && f.view?.you?.name === "Elsewhere", "the rename");
    expect(s.view.you.salvage).toBe(0);
    expect(s.view.you.runs).toBe(0);
  });

  it("survives a reconnect: the profile lives in storage and the seat is reclaimed", async () => {
    const room = uniq("reconnect");
    const first = await pilot(room, "alice");
    first.act(RUN);
    await first.next((f) => f?.type === "state" && f.view?.you?.runs === 1, "the run to land");
    first.ws.close();

    const again = await open(room);
    again.send({ type: "join", playerId: "alice" });
    const restored = await again.next((f) => f?.type === "state" && f.view?.you, "the restored view");
    expect(restored.view.you.salvage).toBe(RUN_SALVAGE);
    expect(restored.view.you.best.score).toBe(12000);
    expect(restored.seats).toEqual(["alice"]);
  });
});

describe("untrusted input", () => {
  it("rejects a non-JSON frame", async () => {
    const a = await open(uniq("garbage"));
    a.ws.send("not json at all");
    expect((await a.error()).error).toBe("invalid json");
  });

  it("rejects a JSON array (not an object)", async () => {
    const a = await open(uniq("array"));
    a.ws.send("[1,2,3]");
    expect((await a.error()).error).toBe("expected a json object");
  });

  it("rejects an unknown message type", async () => {
    const a = await open(uniq("unknown"));
    a.send({ type: "teleport" });
    expect((await a.error()).error).toBe("unknown message type: teleport");
  });

  it("requires a playerId on join", async () => {
    const a = await open(uniq("noid"));
    a.send({ type: "join" });
    expect((await a.error()).error).toBe("playerId required");
  });

  it("refuses an oversized frame instead of persisting it", async () => {
    const a = await open(uniq("big-frame"));
    a.ws.send(JSON.stringify({ type: "join", playerId: "x".repeat(20000) }));
    expect((await a.error()).error).toBe("message too large");
  });

  it("refuses an oversized action payload", async () => {
    const a = await pilot(uniq("big-action"), "alice");
    a.act({ t: "name", name: "y".repeat(6000) });
    expect((await a.error()).error).toBe("action too large");
  });

  it("does not seat a ninth pilot, and refuses their actions", async () => {
    const room = uniq("full");
    for (let i = 0; i < 8; i++) await pilot(room, `pilot-${i}`);
    const late = await open(room);
    late.send({ type: "join", playerId: "latecomer" });
    const s = await late.next((f) => f?.type === "state", "the spectator's state");
    expect(s.seats).toHaveLength(8);
    expect(s.seats).not.toContain("latecomer");
    late.act(RUN);
    expect((await late.error()).error).toBe("spectators cannot act");
  });
});
