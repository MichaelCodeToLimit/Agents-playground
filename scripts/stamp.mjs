// Content-hash cache busting for the static site. Render's CDN caches every file for up to 5 minutes on its own,
// so right after a deploy a visitor could otherwise get a mix of old and new modules. This rewrites public/index.html
// so every game file is requested as /js/x.js?v=<hash of all game files>: a deploy then always loads one consistent set.
// Run `npm run stamp` after changing anything in public/js or public/style.css (a unit test fails if you forget).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const pub = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
export function compute() {
  const js = fs.readdirSync(path.join(pub, 'js')).filter(f => f.endsWith('.js')).sort();
  const h = crypto.createHash('sha1');
  for (const f of js) h.update(f).update(fs.readFileSync(path.join(pub, 'js', f)));
  h.update(fs.readFileSync(path.join(pub, 'style.css')));
  const v = h.digest('hex').slice(0, 10);
  const imports = { three: './vendor/three.module.js' };
  for (const f of js) imports['/js/' + f] = `/js/${f}?v=${v}`;
  return { v, importmap: JSON.stringify({ imports }) };
}
export function stamped(html) {
  const { v, importmap } = compute();
  return html
    .replace(/<script type="importmap">[\s\S]*?<\/script>/, `<script type="importmap">${importmap}</script>`)
    .replace(/<link rel="stylesheet" href="style\.css[^"]*">/, `<link rel="stylesheet" href="style.css?v=${v}">`)
    .replace(/<script type="module" src="js\/main\.js[^"]*"><\/script>/, `<script type="module" src="js/main.js?v=${v}"></script>`);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const f = path.join(pub, 'index.html'), html = fs.readFileSync(f, 'utf8'), out = stamped(html);
  if (out !== html) { fs.writeFileSync(f, out); console.log('index.html stamped with v=' + compute().v); } else console.log('index.html already current (v=' + compute().v + ')');
}
