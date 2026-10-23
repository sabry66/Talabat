// تغيير المندوب: العميل يعرف لما المندوب يعتذر أو يتبدل، والمندوب والمطعم عندهم تنبيه عالي وزرار الإشعارات
import { chromium } from 'playwright';
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const SP = ROOT + '/out';
const B = 'http://127.0.0.1:8765/';
const b = await chromium.launch(); const errs = []; const fails = [];
const ok = (cond, msg) => { console.log(cond ? '✔' : '✘', msg); if (!cond) fails.push(msg); };
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', isMobile: true, hasTouch: true });
await ctx.route(/fonts\.googleapis|tile\.openstreetmap|cdnjs|nominatim/, r => r.abort());
await ctx.route('**/js/firebase-config.js', r => r.fulfill({ contentType: 'application/javascript', body: "export const firebaseConfig = { apiKey: '' }; export const useEmulators = false;" }));
// نعدّ مرات الصوت والاهتزاز
await ctx.addInitScript(() => {
  window.__alarms = 0; window.__vibes = 0;
  navigator.vibrate = () => { window.__vibes++; return true; };
  const Orig = window.AudioContext;
  window.AudioContext = class extends Orig { createOscillator() { window.__alarms++; return super.createOscillator(); } };
});
const login = async (p, email) => { await p.waitForSelector('.auth-card'); await p.click(`[data-demo="${email}"]`); await p.click('#authForm button[type=submit]'); };
const mk = async () => { const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept()); return p; };

const c = await mk();
await c.goto(B + '#/login'); await login(c, 'customer@demo.com'); await c.waitForSelector('.card');
await c.goto(B + '#/restaurant/burger-house'); await c.waitForSelector('[data-add="bh3"]'); await c.click('[data-add="bh3"]'); await c.click('[data-inc="bh3"]');
await c.goto(B + '#/cart'); await c.waitForSelector('#zoneSelect'); await c.selectOption('#zoneSelect', { index: 1 });
await c.goto(B + '#/checkout'); await c.waitForSelector('#placeBtn'); await c.fill('textarea[name=address]', 'عنوان'); await c.click('#placeBtn'); await c.waitForSelector('.track');
const orderId = c.url().split('/').pop();

const o = await mk();
await o.goto(B + 'restaurant.html'); await login(o, 'owner@demo.com'); await o.waitForSelector(`[data-id="${orderId}"][data-status="preparing"]`);
ok(Boolean(await o.$('[data-ask-notify], .notify-hint')), 'restaurant sees notifications button/hint');
await o.click(`[data-id="${orderId}"][data-status="preparing"]`); await o.waitForTimeout(300);

const d = await mk();
await d.goto(B + 'delivery.html'); await login(d, 'driver@demo.com'); await d.waitForSelector(`[data-claim="${orderId}"]`);
ok(Boolean(await d.$('[data-ask-notify], .notify-hint')), 'driver sees notifications button/hint');

// أوردر جديد يظهر للمندوب وهو فاتح: صوت عالي + اهتزاز
const before = await d.evaluate(() => [window.__alarms, window.__vibes]);
const c2 = await mk(); await c2.goto(B + '#/login'); await login(c2, 'customer@demo.com'); await c2.waitForSelector('.card');
await c2.goto(B + '#/restaurant/burger-house'); await c2.waitForSelector('[data-add="bh3"]');
await c2.click('[data-add="bh3"]'); await c2.click('[data-inc="bh3"]');
await c2.goto(B + '#/cart'); await c2.waitForSelector('#zoneSelect'); await c2.selectOption('#zoneSelect', { index: 1 });
await c2.goto(B + '#/checkout'); await c2.waitForSelector('#placeBtn'); await c2.fill('textarea[name=address]', 'عنوان ٢'); await c2.click('#placeBtn'); await c2.waitForSelector('.track');
const order2 = c2.url().split('/').pop();
await o.waitForSelector(`[data-id="${order2}"][data-status="preparing"]`); await o.click(`[data-id="${order2}"][data-status="preparing"]`);
await d.waitForSelector(`[data-claim="${order2}"]`); await d.waitForTimeout(300);
const after = await d.evaluate(() => [window.__alarms, window.__vibes]);
ok(after[0] - before[0] >= 8 && after[1] > before[1], `driver loud alarm + vibration on new order (tones ${after[0] - before[0]})`);
await c2.close();

// المندوب يمسك الطلب
await d.click(`[data-claim="${orderId}"]`); await d.waitForTimeout(500);
await c.waitForFunction(() => document.querySelector('.driver-box'));
ok(!(await c.$('.driver-changed')), 'first driver: no "changed" banner');
ok((await c.textContent('#toast')).includes('مسك طلبك'), 'customer told the driver took the order');

// المندوب يعتذر
await d.click('[data-tab="active"]').catch(() => {});
await d.waitForSelector(`[data-release="${orderId}"]`); await d.click(`[data-release="${orderId}"]`);
await c.waitForSelector('.driver-changed', { timeout: 8000 });
ok((await c.textContent('.driver-changed')).includes('اعتذر'), 'customer banner: driver released');
ok((await c.evaluate(() => window.__vibes)) > 0, 'customer phone vibrates on driver change');
await c.reload(); await c.waitForSelector('.track');
ok((await c.textContent('.driver-changed')).includes('اعتذر'), 'banner survives reload');

// مندوب تاني ياخده (بنكتب في قاعدة البيانات التجريبية من تاب تانية)
await d.evaluate((id) => { const db = JSON.parse(localStorage.getItem('arrivo_demo_db_v3')); Object.assign(db.orders[id], { driverUid: 'd2', driverName: 'مندوب تاني', driverPhone: '01099998888' }); localStorage.setItem('arrivo_demo_db_v3', JSON.stringify(db)); }, orderId);
await c.waitForFunction(() => document.querySelector('.driver-changed')?.textContent.includes('مندوب تاني'), null, { timeout: 8000 });
ok(true, 'customer banner: new driver name');
await c.screenshot({ path: `${SP}/driver-change-customer.png`, fullPage: true });
console.log('errors', errs);
await b.close();
if (fails.length || errs.length) { console.log('FAILED'); process.exit(1); }
console.log('ALL PASSED');
