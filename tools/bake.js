// Bakes still renders (bust / half / full, transparent WebP) of every 3D model into game/img.
// Run: (cd game && python3 -m http.server 8765) & node tools/bake.js
const { chromium } = require('playwright'), fs = require('fs'), path = require('path');
const game = path.join(__dirname, '..', 'game'), out = path.join(game, 'img');
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const files = fs.readdirSync(path.join(game, 'models')).filter(f => f.endsWith('.vrm')).map(f => f.slice(0, -4));
  for (const f of fs.readdirSync(out)) if (!files.some(m => f.startsWith(m + '_'))) fs.unlinkSync(path.join(out, f)); // drop stills of removed models
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage(); p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto('http://localhost:8765/snap.html');
  for (const f of files) {
    const r = await p.evaluate(async f => { const h = Object.values(G.HEROES).concat(Object.values(G.NPC)).find(x => x.model === f) || { el: 'lumen' };
      const o = {}, sizes = { bust: [320, 320], half: [600, 800], full: [400, 520] };
      for (const k in sizes) { const png = await G.C3.snap(f, k, sizes[k][0] * 2, sizes[k][1] * 2, G.EL[h.el].c, h.pose);
        const im = new Image(); im.src = png; await im.decode(); const c = document.createElement('canvas'); c.width = sizes[k][0]; c.height = sizes[k][1];
        const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(im, 0, 0, c.width, c.height); o[k] = c.toDataURL('image/webp', 0.92); }
      return o; }, f);
    for (const k in r) fs.writeFileSync(path.join(out, `${f}_${k}.webp`), Buffer.from(r[k].split(',')[1], 'base64'));
    console.log('baked', f);
  }
  await b.close();
})();
