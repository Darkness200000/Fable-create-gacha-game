/* Veilfall — live 3D characters: rigged VRM avatars rendered with three.js.
   Cinematic three-point lighting, anime rim glow, per-character poses, expressions, eye contact and hair in the wind. */
(function () {
  const C = G.C3 = { ok: !!(window.THREE && window.V3) }; if (!C.ok) return;
  const T = THREE, cache = {}, loader = new V3.GLTFLoader();
  loader.register(p => new V3.VRMLoaderPlugin(p));
  let renderer, scene, camera, cv, key, rim, rim2, fill, ring, cur = null, curPose = 'idle', host = null, time = 0, token = 0, opts = {};

  /* bone overrides on top of the base stance, [x, y, z] radians. Character faces +Z; their left is +X.
     upperArm z lowers the arm, y swings it back(+L/-R), lowerArm y bends the elbow. */
  const POSES = {
    idle: { mood: { relaxed: 0.3 } },
    hero: { // weight on one leg, left hand on hip, chin up
      hips: [0, 0.18, 0.05], spine: [0.02, -0.08, -0.04], chest: [-0.03, -0.06, -0.03], neck: [-0.04, -0.06, 0.02], head: [-0.05, -0.08, 0.06],
      leftUpperArm: 'HIP', rightUpperArm: [0.1, -0.1, -1.28], rightLowerArm: [0, 0.35, 0], rightHand: [0, 0, -0.25],
      leftUpperLeg: [0, 0, 0.06], rightUpperLeg: [-0.12, 0, -0.06], rightLowerLeg: [0.18, 0, 0], mood: { relaxed: 0.55 } },
    cool: {
      hips: [0, -0.15, -0.04], spine: [0, 0.05, 0.03], head: [-0.02, 0.12, -0.04],
      leftUpperArm: [0.05, 0.25, 1.35], leftLowerArm: [0, -0.5, 0], rightUpperArm: [0.05, -0.25, -1.35], rightLowerArm: [0, 0.5, 0],
      leftUpperLeg: [-0.1, 0, 0.03], leftLowerLeg: [0.15, 0, 0], mood: { relaxed: 0.45 } },
    hip: { // contrapposto, hand on hip, head tilted
      hips: [0, -0.2, -0.07], spine: [0, 0.08, 0.06], chest: [0, 0.06, 0.04], neck: [0, 0.06, -0.04], head: [-0.04, 0.1, -0.12],
      rightUpperArm: 'HIP', leftUpperArm: [0.1, 0.05, 1.22], leftLowerArm: [0, -0.4, 0], leftHand: [0, 0, 0.25],
      rightUpperLeg: [0, 0, -0.06], leftUpperLeg: [-0.14, 0.05, 0.08], leftLowerLeg: [0.24, 0, 0], mood: { happy: 0.45 } },
    grace: { // elegant: hands loosely together in front, head tilt
      hips: [0, 0.12, 0.04], spine: [0.02, -0.04, -0.03], head: [-0.03, -0.1, 0.1],
      leftUpperArm: [0.1, -0.45, 1.25], leftLowerArm: [0, -1.05, 0], leftHand: [0, 0, 0.2],
      rightUpperArm: [0.1, 0.45, -1.25], rightLowerArm: [0, 1.05, 0], rightHand: [0, 0, -0.2],
      rightUpperLeg: [-0.1, 0, -0.04], rightLowerLeg: [0.18, 0, 0], mood: { relaxed: 0.5 } },
    shy: {
      head: [0.04, 0.08, -0.1], spine: [0.04, 0, 0],
      leftUpperArm: [0.1, -0.4, 1.28], leftLowerArm: [0, -1.25, 0], rightUpperArm: [0.1, 0.4, -1.28], rightLowerArm: [0, 1.25, 0],
      leftUpperLeg: [0, 0, -0.04], rightUpperLeg: [0, 0, 0.04], mood: { happy: 0.6 } },
    cute: { // peace-sign-ish raised hand
      hips: [0, 0.1, 0.04], head: [-0.02, -0.06, 0.16],
      leftUpperArm: [0.1, 0, 1.3], leftLowerArm: [0, -0.3, 0],
      rightUpperArm: [1.8, -0.3, -1.0], rightLowerArm: [0, -2.15, 0], rightHand: [0, 0, -0.2],
      leftUpperLeg: [-0.06, 0, 0.04], leftLowerLeg: [0.12, 0, 0], mood: { happy: 0.55 } }
  };
  const HIP = { L: { up: [1.2, 0.3, 1.1], low: [0, 1.7, 0], hand: [0, 0, 0.3] }, R: { up: [1.2, 0, -1.25], low: [0, -1.9, 0], hand: [0, 0, -0.3] } };
  C.POSES = POSES; C.HIP = HIP;
  const BONES = ['hips', 'spine', 'chest', 'neck', 'head', 'leftUpperArm', 'rightUpperArm', 'leftLowerArm', 'rightLowerArm', 'leftHand', 'rightHand',
    'leftUpperLeg', 'rightUpperLeg', 'leftLowerLeg', 'rightLowerLeg'];
  const BASE = { leftUpperArm: [0.08, 0, 1.33], rightUpperArm: [0.08, 0, -1.33], leftLowerArm: [0, -0.22, 0.08], rightLowerArm: [0, 0.22, -0.08],
    leftHand: [0, 0, 0.1], rightHand: [0, 0, -0.1], leftUpperLeg: [0, 0, -0.03], rightUpperLeg: [0, 0, 0.03] };

  function resolve(name) {
    const P = POSES[name] || POSES.idle, o = {};
    BONES.forEach(b => o[b] = (P[b] && P[b] !== 'HIP' ? P[b] : BASE[b]) || [0, 0, 0]);
    if (P.leftUpperArm === 'HIP') { o.leftUpperArm = HIP.L.up; o.leftLowerArm = HIP.L.low; o.leftHand = HIP.L.hand; }
    if (P.rightUpperArm === 'HIP') { const R = HIP.R || { up: [HIP.L.up[0], -HIP.L.up[1], -HIP.L.up[2]], low: [0, -HIP.L.low[1], 0], hand: [0, 0, -HIP.L.hand[2]] }; o.rightUpperArm = R.up; o.rightLowerArm = R.low; o.rightHand = R.hand; }
    o.mood = P.mood || {}; return o;
  }

  function init() {
    if (renderer) return;
    cv = document.createElement('canvas'); cv.className = 'c3d';
    renderer = new T.WebGLRenderer({ canvas: cv, alpha: true, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
    renderer.outputColorSpace = T.SRGBColorSpace; renderer.setClearColor(0, 0);
    scene = new T.Scene(); camera = new T.PerspectiveCamera(24, 1, 0.1, 30); scene.add(camera);
    key = new T.DirectionalLight(0xffe9d6, 1.5); key.position.set(1.6, 2.4, 2.6); scene.add(key);
    fill = new T.HemisphereLight(0xe6e8ff, 0x4a3a60, 0.7); scene.add(fill);
    rim = new T.DirectionalLight(0xffffff, 1.3); rim.position.set(-2.4, 1.8, -2.2); scene.add(rim);
    rim2 = new T.DirectionalLight(0xffffff, 0.8); rim2.position.set(2.6, 1.2, -2); scene.add(rim2);
    const rc = document.createElement('canvas'); rc.width = rc.height = 256; const x = rc.getContext('2d');
    const g = x.createRadialGradient(128, 128, 20, 128, 128, 128);
    g.addColorStop(0, 'rgba(255,255,255,.5)'); g.addColorStop(.55, 'rgba(255,255,255,.12)'); g.addColorStop(.8, 'rgba(255,255,255,.55)'); g.addColorStop(.86, 'rgba(255,255,255,.1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 256, 256); x.strokeStyle = 'rgba(255,255,255,.7)'; x.lineWidth = 2;
    for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; x.beginPath(); x.moveTo(128 + Math.cos(a) * 70, 128 + Math.sin(a) * 70); x.lineTo(128 + Math.cos(a) * 96, 128 + Math.sin(a) * 96); x.stroke(); }
    ring = new T.Mesh(new T.PlaneGeometry(1.9, 1.9), new T.MeshBasicMaterial({ map: new T.CanvasTexture(rc), transparent: true, blending: T.AdditiveBlending, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.005; scene.add(ring);
  }

  C.load = file => cache[file] || (cache[file] = new Promise((res, rej) => loader.load('models/' + file + '.vrm', g => {
    const vrm = g.userData.vrm; V3.VRMUtils.removeUnnecessaryVertices(g.scene); V3.VRMUtils.rotateVRM0(vrm);
    const root = new T.Group(); root.add(vrm.scene);
    const mats = []; vrm.scene.traverse(o => { o.frustumCulled = false; if (o.material) [].concat(o.material).forEach(m => { if ('parametricRimColorFactor' in m && !mats.includes(m)) mats.push(m); }); });
    const b = n => vrm.humanoid.getNormalizedBoneNode(n);
    vrm.userData = { b, root, mats, head: 1.45 };
    vrm.scene.updateMatrixWorld(true); const hp = new T.Vector3(); b('head').getWorldPosition(hp); vrm.userData.head = hp.y;
    if (vrm.lookAt) { vrm.lookAt.target = camera; vrm.lookAt.autoUpdate = true; }
    res(vrm);
  }, undefined, rej)));

  /* anime-style fresnel rim in the character's element colour */
  function glam(vrm, col) { const c = new T.Color(col).lerp(new T.Color('#ffffff'), 0.5).multiplyScalar(0.45);
    vrm.userData.mats.forEach(m => { m.parametricRimColorFactor.copy(c); m.parametricRimFresnelPowerFactor = 5.5; m.parametricRimLiftFactor = 0; m.rimLightingMixFactor = 0.35; }); }

  function pose(vrm, name, t) {
    const b = vrm.userData.b, P = resolve(name), s = Math.sin;
    const br = s(t * 1.6) * 0.5 + 0.5, sw = s(t * 0.7) * 0.6;
    const live = { hips: [0, sw * 0.03, sw * 0.01], spine: [br * 0.012, 0, 0], chest: [br * 0.02, 0, 0], head: [s(t * 0.9) * 0.015, s(t * 0.45) * 0.05, 0],
      leftUpperArm: [0, 0, -br * 0.02], rightUpperArm: [0, 0, br * 0.02] };
    BONES.forEach(n => { const o = b(n); if (!o) return; const v = P[n], l = live[n] || [0, 0, 0]; o.rotation.set(v[0] + l[0], v[1] + l[1], v[2] + l[2]); });
    const em = vrm.expressionManager; if (em) { ['happy', 'relaxed', 'fun', 'surprised'].forEach(k => em.setValue(k, P.mood[k] || 0));
      const k = t % 4.2; em.setValue('blink', k < 0.14 ? Math.sin(k / 0.14 * Math.PI) : 0); }
  }

  /* subtle wind through hair and cloth */
  function wind(vrm, t) { const sb = vrm.springBoneManager; if (!sb) return;
    const dir = new T.Vector3(Math.sin(t * 0.8) * 0.6 - 0.4, -1, Math.sin(t * 0.53) * 0.3 - 0.5).normalize();
    sb.joints.forEach(j => { if (j._g0 == null) j._g0 = j.settings.gravityPower || 0; j.settings.gravityDir.copy(dir); j.settings.gravityPower = j._g0 + 0.12 + Math.sin(t * 1.7) * 0.05; }); }

  function frameCam(vrm, mode, aspect) {
    const h = vrm.userData.head, top = h + 0.24; let cy, span;
    if (mode === 'bust') { cy = h - 0.08; span = 0.66; } else if (mode === 'half') { cy = h - 0.32; span = 1.2; } else { cy = top / 2 + 0.02; span = top + 0.2; }
    const tan = Math.tan(camera.fov * Math.PI / 360); let d = span / 2 / tan;
    d = Math.max(d, (mode === 'bust' ? 0.66 : mode === 'half' ? 0.95 : 1.0) / 2 / (tan * aspect));
    const low = mode === 'full' ? -0.18 : -0.06; // a slightly low camera reads as heroic
    camera.aspect = aspect; camera.position.set(0, cy + low, d); camera.lookAt(0, cy, 0); camera.updateProjectionMatrix();
  }

  function swap(vrm) { if (cur) scene.remove(cur.userData.root); cur = vrm; if (vrm) { scene.add(vrm.userData.root); if (vrm.springBoneManager) vrm.springBoneManager.reset(); } }
  function tint(col) { const c = new T.Color(col), w = new T.Color('#ffffff'); rim.color.copy(c).lerp(w, 0.55); rim2.color.copy(c).lerp(w, 0.8); ring.material.color.copy(c); }

  C.mount = (el, file, o) => {
    init(); opts = Object.assign({ mode: 'full', color: '#8fb6ff', ring: true, spin: 0, pose: 'idle' }, o); host = el; const my = ++token;
    el.appendChild(cv); cv.style.opacity = 0; tint(opts.color); ring.visible = opts.ring;
    return C.load(file).then(vrm => { if (my !== token) return; swap(vrm); glam(vrm, opts.color); curPose = opts.pose;
      vrm.userData.root.rotation.y = opts.spin ? -1.6 : 0.22; C.resize(); cv.style.opacity = 1; });
  };
  C.unmount = () => { token++; host = null; if (cv && cv.parentNode) cv.parentNode.removeChild(cv); };
  C.resize = () => { if (!host || !cur) return; const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return;
    renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1)); renderer.setSize(w, h, false); frameCam(cur, opts.mode, w / h); };
  C.frame = dt => { if (!host || !cur) return; if (!host.isConnected) return C.unmount();
    time += dt; pose(cur, curPose, time); wind(cur, time); cur.update(dt);
    const r = cur.userData.root; r.rotation.y += (0.22 + Math.sin(time * 0.35) * 0.06 - r.rotation.y) * Math.min(1, dt * (opts.spin ? 3 : 1));
    ring.rotation.z = time * 0.3; ring.material.opacity = 0.75 + Math.sin(time * 2) * 0.2;
    renderer.render(scene, camera); };
  /* one-off still render (used at build time to bake portraits) */
  C.snap = (file, mode, w, h, color, poseName) => { init(); return C.load(file).then(vrm => { swap(vrm); tint(color || '#8fb6ff'); glam(vrm, color || '#8fb6ff'); ring.visible = false;
    vrm.userData.root.rotation.y = 0.22; renderer.setPixelRatio(1); renderer.setSize(w, h, false); frameCam(vrm, mode, w / h);
    for (let i = 0; i < 60; i++) { pose(vrm, poseName || 'idle', 1.1); wind(vrm, 1.1 + i / 30); vrm.update(1 / 30); } renderer.render(scene, camera); return cv.toDataURL('image/png'); }); };
  addEventListener('resize', () => C.resize());
})();
