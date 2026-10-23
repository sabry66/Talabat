// البيانات بتتحفظ على الجهاز: بعد أول زيارة، المطاعم بتظهر حتى لو قاعدة البيانات لسه مردتش (أو النت قطع)
import { chromium } from 'playwright';
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const B = 'http://127.0.0.1:8765/', PROJECT = 'demo-talabaty', FB = 'https://www.gstatic.com/firebasejs/10.12.2/';
const cfg = `export const firebaseConfig = { apiKey: 'demo-key', authDomain: '${PROJECT}.firebaseapp.com', projectId: '${PROJECT}', appId: 'demo' }; export const useEmulators = true;`;
const fails = []; const errs = [];
const ok = (cond, msg) => { console.log(cond ? '✔' : '✘', msg); if (!cond) fails.push(msg); };
const docUrl = (path) => `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents/${path}`;
const H = { Authorization: 'Bearer owner', 'content-type': 'application/json' };

// مطعم ومنطقة بصلاحية الأدمن (Bearer owner بيعدّي القواعد في الـ Emulator)
const str = (v) => ({ stringValue: v });
const item = { mapValue: { fields: { id: str('x1'), name: str('صنف'), price: { integerValue: '50' }, available: { booleanValue: true } } } };
await fetch(docUrl('restaurants/cache-test'), { method: 'PATCH', headers: H, body: JSON.stringify({ fields: {
  name: str('مطعم الكاش'), emoji: str('🍔'), color: str('#ffe3d1'), category: str('burger'), isOpen: { booleanValue: true },
  time: { arrayValue: { values: [{ integerValue: '20' }, { integerValue: '30' }] } }, minOrder: { integerValue: '0' },
  menu: { arrayValue: { values: [{ mapValue: { fields: { section: str('قسم'), items: { arrayValue: { values: [item] } } } } }] } },
} }) });
await fetch(docUrl('settings/app'), { method: 'PATCH', headers: H, body: JSON.stringify({ fields: { zones: { mapValue: { fields: {} } } } }) });

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
await ctx.route(/fonts\.googleapis|cdnjs|tile\.openstreetmap/, (r) => r.abort());
await ctx.route(FB + '*', (r) => r.fulfill({ path: `${ROOT}/node_modules/firebase/${r.request().url().split('/').pop()}`, contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' } }));
await ctx.route('**/js/firebase-config.js', (r) => r.fulfill({ body: cfg, contentType: 'application/javascript' }));
const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message));
await p.goto(B + '#/'); await p.waitForSelector('.card', { timeout: 20000 });
ok((await p.textContent('.grid')).includes('مطعم الكاش'), 'first visit loads from Firestore');
await p.waitForTimeout(1500); // يلحق يكتب في IndexedDB

// قاعدة البيانات "بطيئة جدًا": أي طلب ليها بيستنى 20 ثانية
await ctx.route('http://127.0.0.1:8080/**', async (r) => { await new Promise((x) => setTimeout(x, 20000)); r.continue().catch(() => {}); });
const t0 = Date.now();
await p.reload(); await p.waitForSelector('.card', { timeout: 15000 }).catch(() => {});
const ms = Date.now() - t0;
ok(Boolean(await p.$('.card')) && ms < 10000, `second visit shows restaurants from the device without waiting for the server (${ms}ms)`);
console.log('errors', errs);
await b.close();
if (fails.length) { console.log('FAILED'); process.exit(1); }
console.log('ALL PASSED');
