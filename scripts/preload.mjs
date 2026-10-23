// بيكتب في كل صفحة لستة بكل ملفات الـ JS اللي هتحتاجها (modulepreload)، عشان المتصفح يحمّلهم كلهم مرة واحدة
// بدل ما يكتشفهم واحد ورا التاني. شغّله بعد ما تضيف أو تشيل import:  node scripts/preload.mjs
// و`node scripts/preload.mjs --check` بيقول بس لو فيه صفحة اللستة بتاعتها قديمة (بيستخدمه الاختبار).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const PAGES = {
  'index.html': 'js/app.js',
  'restaurant.html': 'js/restaurant-dashboard.js',
  'delivery.html': 'js/delivery.js',
  'admin.html': 'js/admin.js',
};
// import() اللي بتحصل على الموقع الحقيقي دايمًا (local.js للوضع التجريبي بس، والإشعارات اختيارية)
const DYNAMIC = new Set(['./firebase.js']);
const START = '<!-- preload:start (اتعمل بـ scripts/preload.mjs) -->';
const END = '<!-- preload:end -->';

function imports(src) {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const out = [];
  for (const m of code.matchAll(/\b(?:import|export)\s[^'"`;]*?from\s*['"]([^'"]+)['"]/g)) out.push(m[1]);
  for (const m of code.matchAll(/^\s*import\s*['"]([^'"]+)['"]/gm)) out.push(m[1]);
  for (const m of code.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)) if (DYNAMIC.has(m[1])) out.push(m[1]);
  return out;
}

function graph(entry) {
  const seen = new Set();
  const external = new Set();
  const walk = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    for (const spec of imports(readFileSync(join(ROOT, file), 'utf8'))) {
      if (/^https?:/.test(spec)) external.add(spec);
      else walk(relative(ROOT, resolve(join(ROOT, dirname(file)), spec)).split('\\').join('/'));
    }
  };
  walk(entry);
  seen.delete(entry); // الصفحة بتطلبه أصلًا
  return [...[...seen].sort(), ...[...external].sort()];
}

function block(entry) {
  const files = graph(entry);
  return [
    START,
    '  <link rel="preconnect" href="https://firestore.googleapis.com" crossorigin>',
    ...files.map((f) => `  <link rel="modulepreload" href="${f}"${/^https?:/.test(f) ? ' crossorigin' : ''}>`),
    `  ${END}`,
  ].join('\n');
}

const check = process.argv.includes('--check');
let stale = 0;
for (const [page, entry] of Object.entries(PAGES)) {
  const path = join(ROOT, page);
  const html = readFileSync(path, 'utf8');
  const want = block(entry);
  let next;
  if (html.includes(START)) next = html.replace(new RegExp(`${START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${END}`), want.trimStart());
  else next = html.replace('  <link rel="stylesheet" href="css/style.css">', `  <link rel="stylesheet" href="css/style.css">\n  ${want.trimStart()}`);
  if (next === html) continue;
  stale++;
  if (check) console.log(`❌ ${page}: لستة الـ preload قديمة. شغّل: node scripts/preload.mjs`);
  else { writeFileSync(path, next); console.log(`✔ ${page}: ${want.split('\n').length - 3} ملف`); }
}
if (check) { if (stale) process.exit(1); console.log('✔ كل الصفحات لستتها مظبوطة'); }
