// ملاحظة لكل صنف (من السلة لحد المطعم والمندوب) + وضع الزحمة للمطعم بضغطة
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
const timeOf = async () => c.$eval('a.card[href="#/restaurant/burger-house"] .meta', e => e.textContent);
const before = await timeOf();
await c.goto(B + '#/restaurant/burger-house'); await c.waitForSelector('[data-add="bh3"]'); await c.click('[data-add="bh3"]'); await c.click('[data-inc="bh3"]');
await c.goto(B + '#/cart'); await c.waitForSelector('[data-note]');
await c.click('[data-note]'); await c.fill('.note-edit input', 'من غير بصل <b>لو سمحت</b>'); await c.press('.note-edit input', 'Enter');
await c.waitForSelector('.line-note-box .line-note');
ok((await c.textContent('.line-note-box .line-note')).includes('من غير بصل <b>'), 'note saved and shown escaped');
await c.reload(); await c.waitForSelector('.line-note-box .line-note');
ok(true, 'note survives reload');
await c.click('.line-note-box [data-note]'); ok(await c.inputValue('.note-edit input') === 'من غير بصل <b>لو سمحت</b>', 'edit prefilled'); await c.press('.note-edit input', 'Enter');
await c.screenshot({ path: `${SP}/notes-cart.png`, fullPage: true });
await c.selectOption('#zoneSelect', { index: 1 });
await c.goto(B + '#/checkout'); await c.waitForSelector('#placeBtn');
ok((await c.textContent('.mini-line')).includes('من غير بصل'), 'checkout shows the note');
await c.fill('textarea[name=address]', 'عنوان'); await c.click('#placeBtn'); await c.waitForSelector('.track');
const orderId = c.url().split('/').pop();
const line = await c.evaluate((id) => JSON.parse(localStorage.getItem('arrivo_demo_db_v3')).orders[id].lines[0], orderId);
ok(line.note === 'من غير بصل <b>لو سمحت</b>', 'order line keeps the note');

const o = await mk();
await o.goto(B + 'restaurant.html'); await login(o, 'owner@demo.com'); await o.waitForSelector(`[data-id="${orderId}"][data-status="preparing"]`);
ok((await o.textContent(`article:has([data-id="${orderId}"])`)).includes('من غير بصل'), 'restaurant sees the note');
ok(!(await o.$('article .line-note b')), 'note is not rendered as HTML');

// وضع الزحمة
await o.waitForSelector('[data-busy="30"]'); await o.click('[data-busy="30"]');
await o.waitForSelector('.busy-bar.on');
ok((await o.textContent('.busy-bar.on')).includes('30'), 'owner sees busy mode on');
await o.screenshot({ path: `${SP}/busy-owner.png` });
await c.goto(B + '#/'); await c.waitForSelector('a.card[href="#/restaurant/burger-house"]');
const during = await timeOf();
const nums = (t) => (t.match(/[\d٠-٩]+/g) || []).slice(0, 2).map((x) => Number(x.replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))));
ok(nums(during)[0] === nums(before)[0] + 30 && during.includes('زحمة'), `home card time +30 with busy tag (${nums(before)} → ${nums(during)})`);
await c.goto(B + '#/restaurant/burger-house'); await c.waitForSelector('.busy-note');
ok(true, 'restaurant page explains the longer time');
await o.click('[data-busy="0"]'); await o.waitForSelector('.busy-bar:not(.on)');
await c.goto(B + '#/'); await c.waitForSelector('a.card[href="#/restaurant/burger-house"]');
ok(nums(await timeOf())[0] === nums(before)[0], 'back to normal time');
// بيخلص لوحده بعد الوقت
await o.evaluate(() => { const d = JSON.parse(localStorage.getItem('arrivo_demo_db_v3')); d.restaurants['burger-house'].busy = { extra: 15, until: Date.now() - 1000 }; localStorage.setItem('arrivo_demo_db_v3', JSON.stringify(d)); });
await c.reload(); await c.waitForSelector('a.card[href="#/restaurant/burger-house"]');
ok(nums(await timeOf())[0] === nums(before)[0], 'expired busy mode is ignored');
console.log('errors', errs);
await b.close();
if (fails.length || errs.length) { console.log('FAILED'); process.exit(1); }
console.log('ALL PASSED');
