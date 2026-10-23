// طلب واحد بيعدّي على الكل، وبنقرا كل رقم ظاهر عند العميل والمطعم والمندوب والأدمن ونقارنه بالحساب اليدوي.
// الإعدادات: المندوب 30% من التوصيل، عمولة 10%، رسوم خدمة 5%، والمندوب بيدفع للمطعم وقت الاستلام.
// الطلب: 2× كرسبي (110) + بطاطس (40) = 260، المعادي (توصيل 40)، كوبون ARRIVO20 (20%)، كاش.
//   خدمة 13، خصم 52، الإجمالي 261. المطعم: عمولة 26، صافي 234. المندوب: 12.
// البطاطس وصلت ناقصة والمندوب أكد: يرجع للعميل 40 × 0.8 = 32 ← العميل يدفع 229.
//   المطعم: أكل 220، عمولة 22، صافي 198، وقبض 234 ← عليه يرجّع 36.
//   المندوب: حصّل 229، دفع 234، مكسبه 12 ← المنصة عليها له 17. المنصة: 229 − 198 − 12 = 19.
import { chromium } from 'playwright';
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const SP = ROOT + '/out';
const B = 'http://127.0.0.1:8765/';
const b = await chromium.launch(); const errs = []; const fails = [];
const ok = (cond, msg) => { console.log(cond ? '✔' : '✘', msg); if (!cond) fails.push(msg); };
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
await ctx.route(/fonts\.googleapis|tile\.openstreetmap|cdnjs|nominatim/, (r) => r.abort());
await ctx.route('**/js/firebase-config.js', (r) => r.fulfill({ contentType: 'application/javascript', body: "export const firebaseConfig = { apiKey: '' }; export const useEmulators = false;" }));
const login = async (p, email) => { await p.waitForSelector('.auth-card'); await p.click(`[data-demo="${email}"]`); await p.click('#authForm button[type=submit]'); };
const mk = async () => { const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept()); return p; };
// الأرقام بتظهر عربي (٢٦١ ج.م)، فبنحوّلها ونقارن
const latin = (s) => String(s).replace(/[٠-٩]/g, (x) => '٠١٢٣٤٥٦٧٨٩'.indexOf(x)).replace(/٬/g, '').replace(/\s+/g, ' ');
const money = (n) => `${n} ج.م`;
const shows = async (p, sel, pairs, where) => {
  const text = latin(await p.textContent(sel));
  for (const [label, n] of pairs) ok(text.includes(money(n)), `${where}: ${label} = ${n}`);
};

// ---- الأدمن يظبط النسب
const a = await mk();
await a.goto(B + 'admin.html'); await login(a, 'admin@demo.com'); await a.waitForSelector('#tabs', { state: 'attached' });
await a.$eval('[data-tab="zones"]', (e) => e.click()); await a.waitForSelector('#settingsForm');
const setRate = async (key, type, value) => { await a.selectOption(`[data-rate="${key}"][data-rf="type"]`, type); await a.fill(`[data-rate="${key}"][data-rf="value"]`, String(value)); };
await setRate('driverShare', 'percent', 30); await setRate('commission', 'percent', 10); await setRate('serviceFee', 'percent', 5);
await a.check('#driverPays');
await a.$eval('#settingsForm', (f) => f.requestSubmit()); await a.waitForTimeout(400);

// ---- العميل: السلة والدفع
const c = await mk();
await c.goto(B + '#/login'); await login(c, 'customer@demo.com'); await c.waitForSelector('.card');
await c.goto(B + '#/restaurant/burger-house'); await c.waitForSelector('[data-add="bh3"]');
await c.click('[data-add="bh3"]'); await c.click('[data-inc="bh3"]'); await c.click('[data-add="bh5"]');
await c.goto(B + '#/cart'); await c.waitForSelector('#zoneSelect'); await c.selectOption('#zoneSelect', 'maadi');
await c.fill('#promoInput', 'arrivo20'); await c.click('#promoForm button[type=submit]'); await c.waitForSelector('.promo-applied');
await shows(c, '.summary', [['المجموع', 260], ['التوصيل', 40], ['رسوم الخدمة', 13], ['الخصم', 52], ['الإجمالي', 261]], 'السلة');
ok(latin(await c.textContent('.promo-applied')).includes(money(52)), 'السلة: "وفّرت 52"');
await c.goto(B + '#/checkout'); await c.waitForSelector('#placeBtn');
await shows(c, '#checkoutSummary', [['الإجمالي', 261]], 'الدفع');
ok(latin(await c.textContent('#placeBtn')).includes(money(261)), 'الدفع: زرار "تأكيد الطلب • 261"');
await c.fill('textarea[name=address]', 'المعادي، شارع 9'); await c.click('#placeBtn'); await c.waitForSelector('.track');
const orderId = c.url().split('/').pop();
const saved = await c.evaluate((id) => JSON.parse(localStorage.getItem('arrivo_demo_db_v3')).orders[id].totals, orderId);
ok(saved.subtotal === 260 && saved.delivery === 40 && saved.service === 13 && saved.discount === 52 && saved.total === 261, `الطلب اتحفظ بنفس الأرقام ${JSON.stringify(saved)}`);
await shows(c, '#app', [['الإجمالي في صفحة الطلب', 261]], 'صفحة الطلب');

// ---- المطعم
const o = await mk();
await o.goto(B + 'restaurant.html'); await login(o, 'owner@demo.com'); await o.waitForSelector(`[data-id="${orderId}"][data-status="preparing"]`);
const card = `article:has([data-id="${orderId}"])`;
await shows(o, card, [['تمن الأكل', 260], ['عمولة أريفو', 26], ['صافي ليك', 234], ['هتقبض من المندوب', 234]], 'كارت المطعم');
ok(!latin(await o.textContent(card)).includes(money(261)), 'كارت المطعم: مفيش إجمالي العميل (261)');
ok(!(await o.$(`${card} .price-alert`)), 'كارت المطعم: الأسعار مطابقة للمنيو (مفيش تنبيه)');
await o.click(`[data-id="${orderId}"][data-status="preparing"]`); await o.waitForSelector(`[data-pack="${orderId}:0"]`);
await o.click(`[data-pack="${orderId}:0"]`); await o.click(`[data-pack="${orderId}:1"]`); await o.waitForTimeout(150);
await o.click(`[data-id="${orderId}"][data-status="ready"]`); await o.waitForTimeout(300);

// ---- المندوب قبل الناقص
const d = await mk();
await d.goto(B + 'delivery.html'); await login(d, 'driver@demo.com'); await d.waitForSelector(`[data-claim="${orderId}"]`);
await shows(d, `article:has([data-claim="${orderId}"])`, [['تحصّل من العميل', 261], ['تدفع للمطعم', 234], ['مكسبك', 12]], 'المندوب (متاح)');
await d.click(`[data-claim="${orderId}"]`); await d.waitForSelector(`[data-id="${orderId}"][data-status="on_way"]`);
await d.click(`[data-id="${orderId}"][data-status="on_way"]`); await d.waitForTimeout(400);

// ---- العميل يبلّغ إن البطاطس ناقصة
await c.waitForSelector('.review-box summary'); await c.click('.review-box summary');
await c.click('[data-miss="1"]'); await c.click('#reportMissing'); await c.waitForTimeout(500);
ok(latin(await c.textContent('.review-box')).includes(money(229)), 'العميل (مستني المندوب): "لو أكد هتدفع 229"');
await d.waitForSelector(`[data-missing="confirmed"][data-id="${orderId}"]`);
ok(latin(await d.textContent(`article:has([data-id="${orderId}"])`)).includes(money(229)), 'المندوب: "لو فعلًا ناقص حصّل 229"');
await d.click(`[data-missing="confirmed"][data-id="${orderId}"]`); await d.waitForTimeout(500);
await shows(d, `article:has([data-id="${orderId}"])`, [['تحصّل من العميل بعد الناقص', 229], ['اترجع للعميل', 32]], 'المندوب (بعد التأكيد)');
// المطعم وهو لسه في الطريق: يعرف إنه عليه يرجّع
await o.waitForTimeout(300);
const onWayCard = `article.order-card:has-text("#${orderId.slice(-6).toUpperCase()}")`;
await shows(o, onWayCard, [['تمن الأكل بعد الناقص', 220], ['صافي ليك', 198], ['عليك ترجّع', 36]], 'كارت المطعم (بعد الناقص)');
await o.screenshot({ path: `${SP}/money-restaurant.png`, fullPage: true });
await d.click(`[data-id="${orderId}"][data-status="delivered"]`); await d.waitForTimeout(500);

// ---- العميل بعد التوصيل
await c.waitForTimeout(400);
await shows(c, '#app', [['اتخصم', 32], ['دفعت', 229]], 'صفحة الطلب (بعد التوصيل)');
await c.goto(B + '#/orders'); await c.waitForTimeout(400);
ok(latin(await c.textContent('#app')).includes(money(229)), 'طلباتي: 229');

// ---- المطعم بعد التوصيل
await o.reload(); await o.waitForSelector('.stats');
await shows(o, '.stats', [['مبيعات النهارده', 220], ['صافي ليك النهارده', 198]], 'لوحة المطعم');
ok(latin(await o.textContent('table')).includes(money(220)), 'المطعم (الطلبات المنتهية): تمن الأكل 220');

// ---- المندوب بعد التوصيل
await d.$eval('[data-tab="history"]', (e) => e.click()); await d.waitForSelector('.stats');
await shows(d, '.stats', [['مكسبك النهارده', 12], ['المنصة عليها ليك', 17]], 'حسابات المندوب');
ok(latin(await d.textContent('.stats')).includes('المنصة عليها ليك'), 'المندوب: مكتوب "المنصة عليها ليك" مش "عليك"');
ok(latin(await d.textContent('table')).includes(money(229)), 'المندوب (الجدول): حصّلت 229');

// ---- الأدمن
await a.reload(); await a.waitForSelector('.stats');
await shows(a, '.stats', [['مبيعات النهارده', 229], ['ربح المنصة النهارده', 19]], 'الأدمن (نظرة عامة)');
await a.$eval('[data-tab="finance"]', (e) => e.click()); await a.waitForSelector('.formula');
await shows(a, '.stats', [['اللي دفعه العملاء', 229], ['ربح المنصة', 19], ['حق المطاعم', 198], ['حق المندوبين', 12]], 'الأدمن (الحسابات)');
const fin = latin(await a.textContent('#tabBody, main'));
ok(fin.includes(money(220)) && fin.includes(money(22)) && fin.includes('المطعم عليه ' + money(36)), 'الأدمن (المطاعم): مبيعات 220، عمولة 22، المطعم عليه 36');
ok(fin.includes('المنصة عليها ' + money(17)), 'الأدمن (المندوبين): المنصة عليها 17');
await a.screenshot({ path: `${SP}/money-admin.png`, fullPage: true });
await a.$eval('[data-tab="drivers"]', (e) => e.click()); await a.waitForTimeout(300);
ok(latin(await a.textContent('table')).includes('المنصة عليها ' + money(17)), 'الأدمن (المندوبين): كاش معاه = المنصة عليها 17');

// ---- طلب أسعاره متعدلة (صنف بـ 110 اتسجل بـ 5): المطعم بيشوف تنبيه قبل ما يقبل
const fakeId = await c.evaluate(async () => {
  const db = JSON.parse(localStorage.getItem('arrivo_demo_db_v3'));
  const real = Object.values(db.orders)[0];
  const id = 'fake' + Date.now();
  db.orders[id] = { ...real, id, status: 'placed', missing: null, missingDecision: null, driverUid: null, createdAt: Date.now(),
    lines: [{ id: 'bh3', key: 'bh3', name: 'كرسبي تشيكن', price: 5, qty: 2 }], totals: { ...real.totals, subtotal: 10, total: 10 } };
  localStorage.setItem('arrivo_demo_db_v3', JSON.stringify(db));
  return id;
});
await o.reload(); await o.waitForSelector(`article:has([data-id="${fakeId}"]) .price-alert`);
ok(latin(await o.textContent(`article:has([data-id="${fakeId}"]) .price-alert`)).includes('110'), 'المطعم: تنبيه "كرسبي متسجل بـ 5 والمنيو بـ 110"');

console.log('errors', errs);
await b.close();
if (fails.length || errs.length) { console.log('FAILED'); process.exit(1); }
console.log('ALL PASSED');
