# RIFTBURN

A twin-stick arena roguelite for the browser — desktop, gamepad and touch.
**Play it:** https://riftburn.higgsfield.app

You are the last marine on a station with a hole torn in it. Hold the arena,
collect embers from what you kill, and mutate your rifle into something
unreasonable before the next wave arrives.

- **15-wave campaign across three sectors**, a boss guarding every fifth wave
  (the Warden, the Hive Mother, the Rift Titan) — then extract with a salvage
  bonus or stay for the endless Overburn.
- **9 hostile types**, each introduced one at a time and each answered by a
  different verb: outrun the runners, sidestep the gunners, bait the bombers,
  dash the brute's charge line, step off the sniper's beam.
- **23 stackable mutations** in three rarities — split barrels, ricochets, arc
  chains, seeker rounds, gun drones, thermite, an Aegis shield…
- **Dash** with invulnerability frames and a chargeable **Overdrive** that
  erases every bullet near you and then doubles your firepower.
- **Armory**: salvage from every run buys permanent upgrades.
- **Squad board**: share your room link and up to 8 pilots compete on one live
  leaderboard.

## How it is built

The game runs on Higgsfield's game template: one Cloudflare Worker with a
Durable Object per room.

| Path | What |
| --- | --- |
| `public/game/game.js` | The simulation — fixed 60 Hz step, seeded RNG, no DOM. Same inputs, same run. |
| `public/game/render.js` | Canvas renderer, particles, decals, camera shake. |
| `public/game/audio.js` | Looping soundtrack through a filter + every effect synthesised with WebAudio. |
| `public/game/input.js` | Keyboard (physical key codes) + mouse, gamepad, floating touch sticks. |
| `public/game/data.js` | All balance numbers and every player-visible string. |
| `public/game/net.js` | Room connection, with the same rules running locally as an offline fallback. |
| `public/client.js` | Menus, HUD, frame loop. |
| `src/logic.js` | **The server rules**: profiles, salvage payouts, armory, squad board. |
| `tests/room.test.ts` | Room + rules tests, run through real WebSockets in the Workers runtime. |
| `tools/` | Headless bot balance test, browser play-test, local preview server, asset pipeline. |

The shooting is real-time in the browser; what the server owns is everything
that has to be trusted. A finished run is **bounds-checked and cross-checked**
(`validateAction` in `src/logic.js`) before it pays out a single point of
salvage, so a forged score can't top the board or buy upgrades.

## Art and music

Sprites, floors, key art and the soundtrack were generated with Higgsfield;
`design/assets.csv` lists every asset and `design/assets.json` records the
source generations. `tools/build_assets.py` chroma-keys the sprites off their
green backdrop and makes the floor tiles seamless. The processed files live in
the Higgsfield project (they are not checked into this repository — without
them the game falls back to simple code-drawn stand-ins, so it still runs).

## Run it locally

```bash
node tools/dev-server.mjs 8787      # http://localhost:8787  (offline profile, no server)
node tools/simtest.mjs 4 0.5        # headless bot runs: stability + pacing numbers
node tools/playtest.mjs http://localhost:8787 ./shots   # browser smoke test + screenshots
```

## Controls

| | Keyboard + mouse | Gamepad | Touch |
| --- | --- | --- | --- |
| Move | WASD / arrows | Left stick | Left thumb |
| Aim + fire | Mouse, hold click | Right stick | Right thumb (or auto-aim) |
| Dash | Space / Shift | A / LB / LT | DASH |
| Overdrive | Q / E / right-click | Y / RB | OVERDRIVE |
| Pause | Esc / P | Start | II |
