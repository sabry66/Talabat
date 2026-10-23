import { chromium } from 'playwright';
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const B = 'http://127.0.0.1:8765/';
const b = await chromium.launch(); const errs = [];
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', isMobile: true, hasTouch: true });
await ctx.route(/fonts\.googleapis|tile\.openstreetmap|cdnjs|nominatim/, r => r.abort());
await ctx.route('**/js/firebase-config.js', r => r.fulfill({ contentType: 'application/javascript', body: "export const firebaseConfig = { apiKey: '' }; export const useEmulators = false;" }));
const login = async (p, email) => { await p.waitForSelector('.auth-card'); await p.click(`[data-demo="${email}"]`); await p.click('#authForm button[type=submit]'); };
const a = await ctx.newPage(); a.on('pageerror', e => errs.push(e.message));
await a.goto(B + 'admin.html'); await login(a, 'admin@demo.com'); await a.waitForSelector('#tabs', { state: 'attached' });
await a.$eval('[data-tab="users"]', e => e.click()); await a.waitForSelector('#userSearch');
const rows = async () => a.$$eval('#usersTable tbody tr', x => x.map(r => r.querySelector('.uname')?.textContent || r.textContent.trim().slice(0, 20)));
for (const q of ['demo_owner', '@demo_driver', 'مندوب', 'مدير', '٠١٠٠٠٠٠٠٠٠٤', '+201000000004', '01000000005', 'owner@demo', 'بيت البرجر', 'zzz']) {
  await a.fill('#userSearch', q); await a.waitForTimeout(150); console.log(q.padEnd(16), '→', (await rows()).join(', '));
}
// كتابة حرف حرف وفي نفس الوقت يحصل تحديث لحظي (طلب جديد من تاب تانية)
await a.fill('#userSearch', ''); await a.focus('#userSearch');
const c = await ctx.newPage(); await c.goto(B + '#/login'); await login(c, 'customer@demo.com'); await c.waitForSelector('.card');
await a.bringToFront(); await a.focus('#userSearch');
const typing = a.keyboard.type('demo_cust', { delay: 120 });
await c.evaluate(() => { const db = JSON.parse(localStorage.getItem('arrivo_demo_db_v3')); db.applications['x' + Date.now()] = { uid: 'x', type: 'driver', status: 'pending', name: 'تحديث', createdAt: Date.now() }; localStorage.setItem('arrivo_demo_db_v3', JSON.stringify(db)); });
await typing; await a.waitForTimeout(300);
console.log('typed while live update → value:', await a.inputValue('#userSearch'), '| focused:', await a.evaluate(() => document.activeElement?.id), '| rows:', (await rows()).join(', '));
console.log('errors', errs); await b.close();
