# VEILFALL — Echoes of the Last Star

An original story-driven gacha RPG for Android. The stars were taken from the sky; you are the Caller, the last one
who can summon the **Echoes** — fallen heroes held in starlight — and find out who cast the Veil. (Spoiler: the answer is uncomfortable.)

## What's in the game

- **Story that unfolds as you play** — a prologue and 5 chapters (25 stages, 5 bosses) told through visual-novel scenes, with allies who join you along the way and a twist per chapter.
- **Gacha summoning** — 15 Echoes across 3★/4★/5★ and six elements, with a full summon animation, a 50-call pity guarantee and a guaranteed 4★+ on every ten-call. Stardust is earned only by playing: there are no purchases.
- **Real-time squad battles** — team of four, auto-attacks, tap-to-cast ultimates with cut-ins, elemental advantages, stuns, shields, heals, ×1/×2/×3 speed and auto mode.
- **Progression** — level up with gold, ascend with duplicate shards, build your team (first slot fights in front).
- **Graphics made entirely in code** — a GLSL nebula/starfield sky that re-colours per chapter, procedurally painted characters and monsters, additive particles, mirror floor, screen shake. No image or audio files at all: sound effects and the ambient score are synthesised with WebAudio.

## Get the APK

Every push builds the app with GitHub Actions: open the **Actions** tab → latest *Build Android APK* run → download the
**Veilfall-apk** artifact → unzip → install `Veilfall.apk` on your phone (allow "install unknown apps"). Requires Android 8.0+.

Build it yourself (Android SDK + JDK 17):

```bash
cd android && ./gradlew assembleDebug   # → app/build/outputs/apk/debug/app-debug.apk
```

## Project layout

| Path | What |
| --- | --- |
| `game/` | The whole game (HTML5 canvas + WebGL, plain JavaScript, no dependencies). Open `game/index.html` in a browser to play on desktop. |
| `game/js/data.js` | Echoes, enemies, chapters and every line of story — the easiest place to add content. |
| `game/js/art.js`, `bg.js` | Procedural character painter and the shader sky. |
| `game/js/battle.js`, `main.js`, `audio.js` | Battle engine, screens/save/summoning, synthesised audio. |
| `android/` | Thin full-screen WebView shell that bundles `game/` as APK assets. |
| `tools/bundle.js` | `node tools/bundle.js` → single-file `dist/veilfall.html`. |
