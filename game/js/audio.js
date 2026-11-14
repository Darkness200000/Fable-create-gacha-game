/* Veilfall — synthesised sound: every effect and the ambient score are generated with WebAudio */
(function () {
  const S = G.Sfx = {}; let ac, master, musicOn = false, timer;
  function ctx() {
    if (!ac) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null;
      ac = new C(); master = ac.createGain(); master.gain.value = G.S && G.S.mute ? 0 : 0.5; master.connect(ac.destination); }
    if (ac.state === 'suspended') ac.resume(); return ac;
  }
  function tone(f, d, type, vol, slide, when) {
    const a = ctx(); if (!a) return; const t = a.currentTime + (when || 0), o = a.createOscillator(), g = a.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + d);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.2, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + d + 0.05);
  }
  function noise(d, vol, freq) {
    const a = ctx(); if (!a) return; const n = a.sampleRate * d | 0, b = a.createBuffer(1, n, a.sampleRate), ch = b.getChannelData(0);
    for (let i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2);
    const s = a.createBufferSource(), g = a.createGain(), f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq || 2000;
    s.buffer = b; g.gain.value = vol || 0.2; s.connect(f); f.connect(g); g.connect(master); s.start();
  }
  const FX = {
    click: () => tone(880, .07, 'triangle', .12, 1320),
    hit: () => { noise(.09, .22, 1800); tone(180, .08, 'square', .06, 80); },
    crit: () => { noise(.14, .3, 3200); tone(520, .16, 'sawtooth', .07, 110); },
    heal: () => [523, 659, 784].forEach((f, i) => tone(f, .3, 'sine', .1, 0, i * .07)),
    ult: () => { tone(110, .7, 'sawtooth', .12, 880); noise(.5, .18, 900); },
    boom: () => { noise(.5, .4, 700); tone(90, .5, 'sine', .3, 30); },
    star: () => { tone(1400, 1.1, 'sine', .1, 220); },
    reveal: () => [659, 880, 1175].forEach((f, i) => tone(f, .35, 'triangle', .1, 0, i * .06)),
    gold: () => [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, .7, 'triangle', .11, 0, i * .09)),
    win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, .5, 'triangle', .13, 0, i * .13)),
    lose: () => [392, 330, 262].forEach((f, i) => tone(f, .6, 'sine', .13, 0, i * .2)),
    text: () => tone(600 + Math.random() * 200, .03, 'sine', .03)
  };
  S.play = n => { try { FX[n] && FX[n](); } catch (e) {} };
  /* slow generative arpeggio over a drone */
  const SCALE = [220, 261.6, 293.7, 329.6, 392, 440, 523.3, 587.3, 659.3];
  S.music = () => {
    if (musicOn || !ctx()) return; musicOn = true; let i = 0;
    timer = setInterval(() => {
      if (!ac || ac.state !== 'running') return;
      if (i % 8 === 0) { tone(110, 5, 'sine', .07); tone(i % 16 ? 164.8 : 146.8, 5, 'sine', .05); }
      if (Math.random() < .7) tone(SCALE[(Math.random() * SCALE.length) | 0], 1.8, 'sine', .035);
      i++;
    }, 620);
  };
  S.mute = m => { if (master) master.gain.value = m ? 0 : 0.5; };
  S.pause = p => { if (ac) p ? ac.suspend() : ac.resume(); };
})();
