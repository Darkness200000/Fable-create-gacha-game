// Inlines game/ into a single self-contained HTML file (dist/veilfall.html) for easy sharing / web hosting.
const fs = require('fs'), path = require('path'), root = path.join(__dirname, '..', 'game');
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
html = html.replace(/<link rel="stylesheet" href="([^"]+)">/, (_, f) => `<style>\n${fs.readFileSync(path.join(root, f), 'utf8')}</style>`);
html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, f) => `<script>\n${fs.readFileSync(path.join(root, f), 'utf8')}</script>`);
fs.mkdirSync(path.join(__dirname, '..', 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, '..', 'dist', 'veilfall.html'), html);
console.log('dist/veilfall.html', (html.length / 1024).toFixed(1) + ' KB');
