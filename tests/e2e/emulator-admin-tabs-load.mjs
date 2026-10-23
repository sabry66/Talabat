import { chromium } from 'playwright';
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const SP = ROOT + '/out';
const B = 'http://127.0.0.1:8765/', PROJECT = 'demo-talabaty', FB = 'https://www.gstatic.com/firebasejs/10.12.2/';
const cfg = `export const firebaseConfig = { apiKey: 'demo-key', authDomain: '${PROJECT}.firebaseapp.com', projectId: '${PROJECT}', appId: 'demo' }; export const useEmulators = true;`;
const b = await chromium.launch(); const errs = [];
async function newCtx(name) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  await ctx.route(/fonts\.googleapis|cdnjs|tile\.openstreetmap/, r => r.abort());
  await ctx.route(FB + '*', r => r.fulfill({ path: `${ROOT}/node_modules/firebase/${r.request().url().split('/').pop()}`, contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' } }));
  await ctx.route('**/js/firebase-config.js', r => r.fulfill({ body: cfg, contentType: 'application/javascript' }));
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(name + ': ' + e.message));
  p.on('console', m => m.type() === 'error' && errs.push(name + ': ' + m.text()));
  p.on('dialog', d => d.type() === 'prompt' ? d.accept(p._prompt ?? '') : d.accept());
  return p;
}
let n = 0;
async function register(p, name, email, username) {
  n++;
  await p.waitForSelector('.auth-card').catch(async (e) => { console.log('ERRS', errs, p.url(), (await p.content()).slice(0, 1500)); throw e; }); await p.click('[data-mode="register"]');
  await p.fill('[name=name]', name); await p.fill('[name=handle]', username); await p.fill('[name=phone]', '0101111222' + n);
  await p.fill('[name=email]', email); await p.fill('[name=password]', 'secret123'); await p.check('[name=agree]'); await p.check('[name=agreeTransfer]'); await p.click('#authForm button[type=submit]');
}
const H = { Authorization: 'Bearer owner', 'content-type': 'application/json' };
const docUrl = (path) => `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents/${path}`;
const api = (p, fnSrc, arg) => p.evaluate(async ({ fnSrc, arg }) => {
  const { getApp } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js');
  const { getAuth } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js');
  const F = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
  const db = F.getFirestore(getApp()); const me = getAuth(getApp()).currentUser.uid;
  const tests = eval(fnSrc)(F, db, me, arg); const out = [];
  for (const [k, fn] of Object.entries(tests)) { try { await fn(); out.push(`${k}: ALLOWED ❌`); } catch (e) { out.push(`${k}: ${e.code}`); } }
  return out.join('\n');
}, { fnSrc, arg });

const a = await newCtx('admin');
await a.goto(B + 'admin.html'); await register(a, 'سابري', 'admin@test.com', 'sabry'); await a.waitForSelector('text=الصفحة دي للأدمن بس');
const all = await (await fetch(`http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:query`, { method: 'POST', headers: H, body: '{}' })).json();
const adminUid = all.userInfo[0].localId;
for (let i = 0; i < 50; i++) { const d = await (await fetch(docUrl(`users/${adminUid}`), { headers: H })).json(); if (d.fields?.username) break; await new Promise(r => setTimeout(r, 200)); }
await fetch(docUrl(`users/${adminUid}?updateMask.fieldPaths=role`), { method: 'PATCH', headers: H, body: JSON.stringify({ fields: { role: { stringValue: 'admin' } } }) });
await a.waitForSelector('.stats');

for (const t of ['zones', 'coupons', 'zones']) {
  await a.reload(); await a.waitForSelector('#tabs', { state: 'attached' });
  await a.$eval(`[data-tab="${t}"]`, e => e.click());
  const ok = await a.waitForSelector(t === 'zones' ? '#settingsForm' : '#couponForm', { timeout: 15000 }).then(() => true, () => false);
  console.log(`open ${t} immediately after load →`, ok ? 'drawn ✔' : 'STUCK ✘');
}
await b.close();
