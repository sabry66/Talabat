// "راجع طلبك قبل ما تدفع": المطعم يعلّم على الأصناف قبل "جاهز"، العميل يبلّغ عن ناقص، المندوب يأكد، والحسابات تتخصم من المطعم
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
const db = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('arrivo_demo_db_v3')));
const num = (t) => Number(String(t).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[^\d.]/g, ''));

// العميل يطلب صنفين (2 كرسبي + 1 بطاطس)
const c = await mk();
await c.goto(B + '#/login'); await login(c, 'customer@demo.com'); await c.waitForSelector('.card');
await c.goto(B + '#/restaurant/burger-house'); await c.waitForSelector('[data-add="bh3"]');
await c.click('[data-add="bh3"]'); await c.click('[data-inc="bh3"]');
const fries = await c.$$eval('[data-add]', x => x.map(e => e.dataset.add).find(id => id !== 'bh3' && id !== 'bh2'));
await c.click(`[data-add="${fries}"]`);
await c.goto(B + '#/cart'); await c.waitForSelector('#zoneSelect'); await c.selectOption('#zoneSelect', { index: 1 });
await c.goto(B + '#/checkout'); await c.waitForSelector('#placeBtn'); await c.fill('textarea[name=address]', 'عنوان'); await c.selectOption?.('[name=payment]', 'cash').catch(() => {}); await c.click('#placeBtn'); await c.waitForSelector('.track');
const orderId = c.url().split('/').pop();
ok(!(await c.$('#reportMissing')), 'no review panel before the driver is on the way');

// المطعم: قبول، و"جاهز" مقفول لحد ما يعلّم على كل الأصناف
const o = await mk();
await o.goto(B + 'restaurant.html'); await login(o, 'owner@demo.com'); await o.waitForSelector(`[data-id="${orderId}"][data-status="preparing"]`);
await o.click(`[data-id="${orderId}"][data-status="preparing"]`); await o.waitForSelector(`[data-pack^="${orderId}:"]`);
ok(await o.$eval(`[data-id="${orderId}"][data-status="ready"]`, e => e.disabled), 'ready is locked until items are ticked');
{ const card = (await o.textContent(`.order-card:has([data-id="${orderId}"])`)).replace(/[٠-٩]/g, x => '٠١٢٣٤٥٦٧٨٩'.indexOf(x)).replace(/\s+/g, ' ');
  const ord0 = (await db(o)).orders[orderId];
  ok(new RegExp(`تمن الأكل\\s*${ord0.totals.subtotal}`).test(card) && card.includes(`هتقبض ${ord0.totals.subtotal}`) && card.includes(`${ord0.totals.total} ج.م شامل التوصيل`),
    `restaurant card: food ${ord0.totals.subtotal} (not ${ord0.totals.total}), cash from rider, customer total marked "شامل التوصيل"`); }
await o.click(`[data-pack="${orderId}:0"]`); await o.waitForTimeout(150);
ok(await o.$eval(`[data-id="${orderId}"][data-status="ready"]`, e => e.disabled), 'still locked with one item left');
await o.click(`[data-pack="${orderId}:1"]`); await o.waitForTimeout(150);
ok(!(await o.$eval(`[data-id="${orderId}"][data-status="ready"]`, e => e.disabled)), 'ready unlocks after ticking all');
await o.screenshot({ path: `${SP}/review-restaurant-pack.png`, fullPage: true });
await o.click(`[data-id="${orderId}"][data-status="ready"]`); await o.waitForTimeout(300);

// المندوب ياخده ويستلمه
const d = await mk();
await d.goto(B + 'delivery.html'); await login(d, 'driver@demo.com'); await d.waitForSelector(`[data-claim="${orderId}"]`);
await d.click(`[data-claim="${orderId}"]`); await d.waitForSelector(`[data-id="${orderId}"][data-status="on_way"]`);
await d.click(`[data-id="${orderId}"][data-status="on_way"]`); await d.waitForTimeout(400);

// العميل يراجع ويبلّغ إن واحدة من الكرسبي ناقصة
await c.waitForSelector('.review-box summary'); await c.click('.review-box summary');
await c.click('[data-miss="0"]'); await c.waitForSelector('[data-miss-qty="0"]');
ok((await c.$$eval('[data-miss-qty="0"] option', x => x.length)) === 2, 'qty picker for a line with 2 items');
await c.screenshot({ path: `${SP}/review-customer.png`, fullPage: true });
await c.click('#reportMissing'); await c.waitForTimeout(600);
let ord = (await db(c)).orders[orderId];
ok(ord.missing?.length === 1 && ord.missing[0].qty === 1 && ord.missingAmount === 110, 'missing saved: 1× كرسبي = 110');
ok(Object.values((await db(c)).tickets || {}).some(t => t.orderId === orderId && t.subject === 'صنف ناقص'), 'auto complaint ticket created');
ok((await c.textContent('.review-box')).includes('المندوب بيتأكد'), 'customer sees pending state');

// المندوب: "تم التوصيل" مقفول لحد ما يرد، وبعدين يأكد
await d.waitForSelector(`[data-missing="confirmed"][data-id="${orderId}"]`);
ok(await d.$eval(`[data-id="${orderId}"][data-status="delivered"]`, e => e.disabled), 'delivered locked until driver answers');
await d.screenshot({ path: `${SP}/review-driver.png`, fullPage: true });
await d.click(`[data-missing="confirmed"][data-id="${orderId}"]`); await d.waitForTimeout(500);
ok((await d.textContent('.money')).replace(/[٠-٩]/g, x => '٠١٢٣٤٥٦٧٨٩'.indexOf(x)).includes(String(ord.totals.total - 110)), 'driver collects total − 110');
await d.click(`[data-id="${orderId}"][data-status="delivered"]`); await d.waitForTimeout(500);
ord = (await db(c)).orders[orderId];
ok(ord.status === 'delivered' && ord.missingDecision === 'confirmed', 'delivered with confirmed deduction');
await c.waitForTimeout(500);
ok((await c.textContent('#app')).includes('اتخصم'), 'customer sees the deduction');

// الحسابات: الخصم على المطعم
const split = await c.evaluate(async (o) => (await import('/js/finance.js')).orderSplit(o), ord);
ok(split.missing === 110 && split.restaurant === ord.totals.subtotal - 110 && split.cash === ord.totals.total - 110, `split: restaurant −110, cash −110 (restaurant ${split.restaurant}, cash ${split.cash})`);
await o.reload(); await o.waitForSelector('#tabs', { state: 'attached' }); await o.waitForTimeout(500);
ok((await o.textContent('#app')).includes('اتخصم'), 'restaurant sees the confirmed missing note');
// مع كوبون: الفلوس متبقاش بالسالب، والعميل مياخدش الخصم مرتين، والاسم/السعر من الطلب نفسه
const fin = await c.evaluate(async () => {
  const F = await import('/js/finance.js');
  const base = { payment: 'cash', rates: { driverShare: { type: 'percent', value: 30 }, commission: { type: 'percent', value: 0 }, serviceFee: { type: 'percent', value: 0 }, driverPaysRestaurant: true },
    totals: { subtotal: 100, delivery: 10, service: 0, discount: 50, foodDiscount: 50, total: 60 },
    lines: [{ id: 'a', name: 'برجر', price: 60, qty: 1 }, { id: 'b', name: 'بطاطس', price: 40, qty: 1 }], missingDecision: 'confirmed' };
  const all = F.orderSplit({ ...base, missing: [{ i: 0, qty: 1 }, { i: 1, qty: 1 }] });
  const part = F.orderSplit({ ...base, missing: [{ i: 0, qty: 1 }] });
  const evil = F.missingItems({ ...base, missing: [{ i: 0, qty: '<img src=x onerror=alert(1)>', name: '<script>', amount: 99999 }, { i: 0, qty: 1 }, { i: 9, qty: 1 }] });
  const freeDel = F.orderSplit({ ...base, totals: { subtotal: 100, delivery: 10, service: 0, discount: 10, foodDiscount: 0, total: 100 }, missing: [{ i: 1, qty: 1 }] });
  return { all, part, evil, freeDel };
});
ok(fin.all.cash >= 0 && fin.all.cash === 10 && fin.all.restaurant === 0 && fin.all.platform >= 0, `coupon + everything missing: cash ${fin.all.cash}, restaurant ${fin.all.restaurant}, platform ${fin.all.platform}`);
ok(fin.part.cash === 30 && fin.part.restaurant === 40, `coupon + one item missing: cash ${fin.part.cash} (60−30), restaurant ${fin.part.restaurant}`);
ok(fin.evil.length === 1 && fin.evil[0].name === 'برجر' && fin.evil[0].qty === 1 && fin.evil[0].amount === 60, 'tampered missing data ignored (name/price from the order, duplicates and bad index dropped)');
ok(fin.freeDel.cash === 60 && fin.freeDel.restaurant === 60, `free-delivery coupon + missing item: full item refund (cash ${fin.freeDel.cash})`);
console.log('errors', errs); if (errs.length) fails.push('page errors');
console.log(fails.length ? `FAILED: ${fails.length}` : 'ALL PASSED');
await b.close();
