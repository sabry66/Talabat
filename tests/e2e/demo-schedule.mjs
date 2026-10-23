// جدولة الطلب: العميل يختار النهارده أو بكرة وميعاد، والمطعم والمندوب يشوفوا الميعاد
import { chromium } from 'playwright';
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const SP = ROOT + '/out';
const B = 'http://127.0.0.1:8765/';
const b = await chromium.launch(); const errs = []; const fails = [];
const ok = (cond, msg) => { console.log(cond ? '✔' : '✘', msg); if (!cond) fails.push(msg); };
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', isMobile: true, hasTouch: true });
await ctx.route(/fonts\.googleapis|tile\.openstreetmap|cdnjs|nominatim/, r => r.abort());
await ctx.route('**/js/firebase-config.js', r => r.fulfill({ contentType: 'application/javascript', body: "export const firebaseConfig = { apiKey: '' }; export const useEmulators = false;" }));
const login = async (p, email) => { await p.waitForSelector('.auth-card'); await p.click(`[data-demo="${email}"]`); await p.click('#authForm button[type=submit]'); };
const mk = async () => { const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept()); return p; };

const c = await mk();
await c.goto(B + '#/login'); await login(c, 'customer@demo.com'); await c.waitForSelector('.card');
await c.goto(B + '#/restaurant/burger-house'); await c.waitForSelector('[data-add="bh3"]'); await c.click('[data-add="bh3"]'); await c.click('[data-inc="bh3"]');
await c.goto(B + '#/cart'); await c.waitForSelector('#zoneSelect'); await c.selectOption('#zoneSelect', { index: 1 });
await c.goto(B + '#/checkout'); await c.waitForSelector('#placeBtn');
ok(await c.$eval('[name=when][value=now]', e => e.checked) && await c.isHidden('#whenLater'), '"now" is the default');
await c.check('[name=when][value=later]');
ok(await c.isVisible('#whenLater'), 'picking "later" shows day + time');
const today = await c.$$eval('[name=slot] option', o => o.map(x => +x.value));
const now = Date.now();
ok(today.every(t => t >= now + 30 * 60e3) && today.every((t, i) => !i || t - today[i - 1] === 30 * 60e3), `slots are 30 min apart and at least 30 min ahead (${today.length} today)`);
await c.selectOption('[name=day]', '1');
const tomorrow = await c.$$eval('[name=slot] option', o => o.map(x => ({ v: +x.value, t: x.textContent })));
ok(tomorrow.length > 20 && new Date(tomorrow[0].v).getHours() === 9, 'tomorrow starts at 9:00 ' + tomorrow[0].t);
await c.selectOption('[name=slot]', String(tomorrow[2].v));
await c.fill('textarea[name=address]', 'عنوان'); await c.screenshot({ path: `${SP}/schedule-checkout.png`, fullPage: true });
await c.click('#placeBtn'); await c.waitForSelector('.track');
const orderId = c.url().split('/').pop();
const o = await c.evaluate((id) => JSON.parse(localStorage.getItem('arrivo_demo_db_v3')).orders[id], orderId);
ok(o.scheduledFor === tomorrow[2].v, 'order saved with the chosen time');
ok((await c.textContent('.eta')).includes('بكرة'), 'order page: "arrives tomorrow at ..." ' + (await c.textContent('.eta')).trim());

// الباك إند بيرفض مواعيد غلط
const refused = await c.evaluate(async () => {
  const { backend } = await import('/js/backend/index.js');
  const tryAt = async (t) => { try { await backend.createOrder({ customerUid: 'x', payment: 'cash', lines: [], scheduledFor: t }, []); return false; } catch { return true; } };
  return [await tryAt(Date.now() + 5 * 60e3), await tryAt(Date.now() + 5 * 86400e3)];
});
ok(refused[0] && refused[1], 'backend refuses too soon / too far');

const r = await mk();
await r.goto(B + 'restaurant.html'); await login(r, 'owner@demo.com'); await r.waitForSelector(`[data-id="${orderId}"][data-status="preparing"]`);
ok((await r.textContent(`article:has([data-id="${orderId}"]) .sched-tag`)).includes('بكرة'), 'restaurant sees the scheduled time');
await r.click(`[data-id="${orderId}"][data-status="preparing"]`); await r.waitForTimeout(300);
const d = await mk();
await d.goto(B + 'delivery.html'); await login(d, 'driver@demo.com'); await d.waitForSelector(`[data-claim="${orderId}"]`);
ok((await d.$eval(`[data-claim="${orderId}"]`, e => e.closest('article').textContent)).includes('سلّمه للعميل بكرة'), 'driver sees when to deliver');
console.log('errors', errs);
await b.close();
if (fails.length || errs.length) { console.log('FAILED'); process.exit(1); }
console.log('ALL PASSED');
