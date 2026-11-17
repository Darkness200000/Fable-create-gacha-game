/**
 * Sound. The soundtrack is one looping track run through a low-pass that opens
 * up in combat and closes in menus; every effect is synthesised on the fly, so
 * a weapon that fires ten times a second never sounds like a sample on repeat.
 * A limiter on the master bus keeps the whole mix from ever clipping.
 */

export function createAudio(settings) {
  let ctx = null;
  let master = null;
  let sfx = null;
  let music = null;
  let filter = null;
  let noiseBuf = null;
  let musicData = null;
  let musicBuf = null;
  let musicSrc = null;
  let mode = "menu";
  const last = {};
  let xpStep = 0;
  let xpAt = 0;

  const A = { ready: false };

  function ensure() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.knee.value = 8;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.2;
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(limiter);
    limiter.connect(ctx.destination);
    sfx = ctx.createGain();
    sfx.connect(master);
    music = ctx.createGain();
    filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 700;
    filter.Q.value = 0.6;
    filter.connect(music);
    music.connect(master);
    const len = ctx.sampleRate;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    A.apply();
    A.ready = true;
    return true;
  }

  A.apply = function apply() {
    if (!ctx) return;
    sfx.gain.value = settings.sfx;
    A.setMode(mode, true);
  };

  /** Call from a user gesture: browsers keep audio locked until then. */
  A.unlock = function unlock() {
    if (!ensure()) return;
    if (ctx.state === "suspended") ctx.resume();
    if (musicData && !musicBuf) decode();
    else if (musicBuf && !musicSrc) startMusic();
  };

  A.suspend = function suspend(on) {
    if (!ctx) return;
    if (on) ctx.suspend();
    else ctx.resume();
  };

  A.loadMusic = async function loadMusic(url) {
    try {
      const res = await fetch(url);
      if (!res.ok) return;
      musicData = await res.arrayBuffer();
      if (ctx) decode();
    } catch {
      /* no soundtrack is not fatal — effects still play */
    }
  };

  function decode() {
    const data = musicData;
    musicData = null;
    ctx.decodeAudioData(
      data,
      (buf) => {
        musicBuf = buf;
        startMusic();
      },
      () => {},
    );
  }

  function startMusic() {
    if (!musicBuf || musicSrc) return;
    musicSrc = ctx.createBufferSource();
    musicSrc.buffer = musicBuf;
    musicSrc.loop = true;
    // trim the encoder's lead-in/out so the loop point doesn't hiccup
    musicSrc.loopStart = 0.03;
    musicSrc.loopEnd = Math.max(1, musicBuf.duration - 0.06);
    musicSrc.connect(filter);
    musicSrc.start();
  }

  const MODES = {
    menu: [900, 0.5],
    combat: [18000, 0.62],
    boss: [18000, 0.75],
    draft: [520, 0.42],
    paused: [380, 0.3],
    over: [300, 0.34],
  };
  A.setMode = function setMode(next, force) {
    if (next === mode && !force) return;
    mode = next;
    if (!ctx) return;
    const [freq, gain] = MODES[mode] || MODES.menu;
    const t = ctx.currentTime;
    filter.frequency.cancelScheduledValues(t);
    filter.frequency.setTargetAtTime(freq, t, 0.18);
    music.gain.cancelScheduledValues(t);
    music.gain.setTargetAtTime(gain * settings.music, t, 0.2);
  };

  // ── synth primitives ─────────────────────────────────────────────────────
  function tone(type, f0, f1, dur, vol, delay = 0) {
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(sfx);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  function noise(ftype, f0, f1, dur, vol, delay = 0, q = 0.8) {
    const t = ctx.currentTime + delay;
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = ftype;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f);
    f.connect(g);
    g.connect(sfx);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.02);
  }
  /** True when `key` may sound again (keeps rapid events from stacking up). */
  function gate(key, gap) {
    const now = ctx.currentTime;
    if (last[key] && now - last[key] < gap) return false;
    last[key] = now;
    return true;
  }
  const rnd = (a, b) => a + Math.random() * (b - a);

  A.ui = function ui(kind) {
    if (!ctx || ctx.state !== "running") return;
    if (kind === "pick") {
      tone("triangle", 660, 990, 0.09, 0.16);
      tone("triangle", 990, 1320, 0.12, 0.12, 0.07);
    } else if (kind === "deny") {
      tone("square", 180, 120, 0.12, 0.1);
    } else {
      tone("triangle", 720, 720, 0.035, 0.1);
    }
  };

  A.fx = function fx(type, a, b, c, d, e, f) {
    if (!ctx || ctx.state !== "running") return;
    switch (type) {
      case "shot":
        if (!gate("shot", 0.045)) return;
        if (d) {
          tone("sawtooth", rnd(520, 580), 130, 0.09, 0.085);
          noise("highpass", 2500, 900, 0.05, 0.07);
        } else {
          tone("square", rnd(840, 920), 210, 0.07, 0.055);
          noise("highpass", 3200, 1500, 0.035, 0.05);
        }
        break;
      case "droneShot":
        if (gate("drone", 0.07)) tone("square", rnd(1300, 1400), 500, 0.05, 0.025);
        break;
      case "hit":
        if (!gate("hit", 0.04)) return;
        noise("bandpass", rnd(2200, 2800), 1200, 0.035, 0.05, 0, 2);
        if (d && gate("crit", 0.07)) tone("triangle", 1500, 880, 0.07, 0.07);
        break;
      case "kill": {
        if (!gate("kill", 0.035)) return;
        const big = a.r > 30;
        noise("lowpass", big ? 1400 : 1000, 160, big ? 0.3 : 0.14, big ? 0.3 : 0.15);
        tone("sine", big ? 150 : 190, 50, big ? 0.28 : 0.12, big ? 0.3 : 0.16);
        break;
      }
      case "explode":
        if (!gate("explode", 0.06)) return;
        noise("lowpass", 1500, 70, 0.5, d === "shock" ? 0.26 : 0.4);
        tone("sine", 115, 34, 0.42, 0.42);
        break;
      case "blast":
        if (gate("blast", 0.08)) noise("lowpass", 900, 200, 0.12, 0.09);
        break;
      case "nova":
        noise("lowpass", 300, 5000, 0.12, 0.3);
        noise("lowpass", 5000, 90, 0.7, 0.42, 0.1);
        tone("sine", 90, 30, 0.7, 0.5, 0.08);
        break;
      case "overdrive":
        tone("sawtooth", 220, 1760, 0.3, 0.14);
        tone("triangle", 440, 440, 0.5, 0.12, 0.28);
        tone("triangle", 554, 554, 0.5, 0.1, 0.28);
        tone("triangle", 659, 659, 0.6, 0.1, 0.28);
        break;
      case "odEnd":
        tone("sawtooth", 880, 180, 0.35, 0.08);
        break;
      case "odReady":
        tone("triangle", 880, 880, 0.09, 0.14);
        tone("triangle", 1320, 1320, 0.16, 0.14, 0.09);
        break;
      case "hurt":
        tone("sawtooth", 230, 70, 0.26, 0.3);
        noise("lowpass", 2400, 300, 0.2, 0.3);
        break;
      case "death":
        tone("sawtooth", 420, 40, 1.1, 0.3);
        noise("lowpass", 3000, 60, 1.2, 0.45);
        tone("sine", 100, 28, 1.0, 0.5, 0.05);
        break;
      case "revive":
        [523, 659, 784, 1047].forEach((fq, i) => tone("triangle", fq, fq, 0.22, 0.16, i * 0.07));
        noise("lowpass", 4000, 100, 0.6, 0.3);
        break;
      case "dash":
        noise("bandpass", 500, 3400, 0.16, 0.2, 0, 1.4);
        break;
      case "xp": {
        if (!gate("xp", 0.03)) return;
        const now = ctx.currentTime;
        xpStep = now - xpAt < 0.5 ? Math.min(xpStep + 1, 14) : 0;
        xpAt = now;
        const fq = 620 * Math.pow(2, xpStep / 12);
        tone("sine", fq, fq * 1.02, 0.07, 0.07);
        break;
      }
      case "heal":
        tone("sine", 520, 520, 0.1, 0.14);
        tone("sine", 780, 780, 0.16, 0.14, 0.09);
        break;
      case "levelUp":
        [523, 659, 784, 1047, 1319].forEach((fq, i) => tone("triangle", fq, fq, 0.2, 0.15, i * 0.06));
        break;
      case "portal":
        if (c) {
          tone("sawtooth", 50, 110, 1.6, 0.26);
          noise("lowpass", 200, 1800, 1.6, 0.16);
        } else if (gate("portal", 0.12)) {
          tone("sine", 110, 190, 0.5, 0.08);
        }
        break;
      case "spawn":
        if (c) {
          noise("lowpass", 2500, 60, 0.9, 0.5);
          tone("sine", 80, 30, 0.9, 0.5);
        }
        break;
      case "bossIntro":
        for (let i = 0; i < 3; i++) {
          tone("sawtooth", 466, 466, 0.22, 0.12, i * 0.5);
          tone("sawtooth", 349, 349, 0.22, 0.12, i * 0.5 + 0.25);
        }
        break;
      case "bossPhase":
        noise("lowpass", 3000, 100, 0.6, 0.4);
        tone("sawtooth", 160, 60, 0.6, 0.3);
        break;
      case "bossDie":
        for (let i = 0; i < 5; i++) {
          noise("lowpass", 2600, 60, 0.7, 0.42, i * 0.22);
          tone("sine", 130 - i * 12, 30, 0.6, 0.45, i * 0.22);
        }
        [392, 523, 659, 784, 1047].forEach((fq, i) => tone("triangle", fq, fq, 0.5, 0.14, 1.1 + i * 0.09));
        break;
      case "eshot":
        if (gate("eshot", 0.07)) tone("square", rnd(300, 340), 150, 0.09, 0.05);
        break;
      case "beam":
        if (!gate("beam", 0.1)) return;
        tone("sawtooth", 1400, 180, 0.28, 0.14);
        noise("highpass", 1800, 600, 0.22, 0.14);
        break;
      case "fuse":
        if (!gate("fuse", 0.1)) return;
        for (let i = 0; i < 4; i++) tone("square", 900 + i * 180, 900 + i * 180, 0.05, 0.07, i * 0.14);
        break;
      case "slam":
        noise("lowpass", 700, 60, 0.3, 0.36);
        tone("sine", 95, 36, 0.3, 0.4);
        break;
      case "charge":
        noise("bandpass", 300, 1400, 0.3, 0.18);
        break;
      case "blink":
        if (gate("blink", 0.08)) tone("sine", 1800, 300, 0.16, 0.09);
        break;
      case "brood":
        noise("bandpass", 400, 900, 0.3, 0.2, 0, 3);
        break;
      case "shield":
        tone("sine", 1800, 1200, 0.3, 0.16);
        tone("sine", 2400, 1700, 0.3, 0.1);
        break;
      case "shieldUp":
        tone("sine", 1200, 1800, 0.18, 0.08);
        break;
      case "wave":
        tone("triangle", 330, 660, 0.25, 0.1);
        break;
      case "waveClear":
        [659, 784, 988].forEach((fq, i) => tone("triangle", fq, fq, 0.2, 0.11, i * 0.08));
        break;
      default:
        break;
    }
  };

  return A;
}
