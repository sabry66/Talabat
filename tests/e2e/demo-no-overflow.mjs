// على الموبايل مفيش صفحة تعرض عن الشاشة (وإلا الموبايل بيصغّرها والقايمة الجانبية بتطلع نصها برّه):
// كل لوحة وكل تبويب، ببيانات كتير وأسامي طويلة، على 390px، والقايمة لازم تفتح كلها جوه الشاشة
import { chromium } from 'playwright';
const B = 'http://127.0.0.1:8765/';
const b = await chromium.launch(); const errs = []; const fails = [];
const ok = (cond, msg) => { console.log(cond ? '✔' : '✘', msg); if (!cond) fails.push(msg); };
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block', colorScheme: 'dark' });
await ctx.route(/fonts\.googleapis|tile\.openstreetmap|cdnjs|nominatim/, (r) => r.abort());
await ctx.route('**/js/firebase-config.js', (r) => r.fulfill({ contentType: 'application/javascript', body: "export const firebaseConfig = { apiKey: '' }; export const useEmulators = false;" }));
const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept());

// بيانات كتير: طلبات منتهية بأسامي طويلة وناقص، وشكاوي
await p.goto(B); await p.waitForSelector('.card');
await p.evaluate(() => {
  const db = JSON.parse(localStorage.getItem('arrivo_demo_db_v3'));
  const rates = { driverShare: { type: 'percent', value: 30 }, commission: { type: 'percent', value: 10 }, serviceFee: { type: 'percent', value: 0 }, driverPaysRestaurant: true };
  const long = 'عبد الرحمن محمد عبد العزيز الشرقاوي';
  ['delivered', 'cancelled', 'rejected', 'delivered', 'delivered', 'preparing', 'placed'].forEach((status, i) => {
    const id = `long${i}`;
    db.orders[id] = { id, createdAt: Date.now() - i * 3600e3, status, payment: 'cash', ownerUid: 'u-owner', restaurantId: 'burger-house', restaurantName: 'بيت البرجر',
      customerUid: 'u-customer', customerName: long, customerUsername: 'demo_customer_with_a_long_username', customerPhone: '01000000003',
      driverUid: status === 'delivered' ? 'u-driver' : null, driverName: long, driverUsername: 'demo_driver_long_name', zoneName: 'التجمع الخامس', address: long + ' ' + long,
      lines: [{ id: 'bh3', name: 'كرسبي تشيكن بصوص الرانش والهالبينو الحار زيادة', price: 110, qty: 2, note: long }], rates,
      totals: { subtotal: 220, delivery: 45, service: 0, discount: 0, foodDiscount: 0, total: 265 }, missing: i === 0 ? [{ i: 0, qty: 1 }] : null, missingDecision: i === 0 ? 'confirmed' : null,
      statusHistory: [{ status: 'placed', at: Date.now() - i * 3600e3, by: { uid: 'u-customer', name: long, role: 'customer' } }],
      driverLog: [{ uid: 'u-driver', name: long, phone: '01000000004', username: 'x', action: 'claimed', at: Date.now() }] };
  });
  db.tickets ||= {};
  db.tickets.longT = { id: 'longT', uid: 'u-customer', name: 'عبد الرحمن محمد عبد العزيز', role: 'customer', topic: 'order', subject: 'الأكل وصل بارد جدًا والمندوب اتأخر ساعة كاملة', orderId: 'long0', status: 'open', lastBy: 'user', createdAt: Date.now(), updatedAt: Date.now(), messages: [{ by: 'u-customer', name: 'x', text: 'https://example.com/' + 'a'.repeat(120), at: Date.now() }] };
  localStorage.setItem('arrivo_demo_db_v3', JSON.stringify(db));
});

const check = async (where) => {
  await p.waitForTimeout(250);
  const w = await p.evaluate(() => ({ page: document.documentElement.scrollWidth, screen: innerWidth }));
  ok(w.page <= w.screen, `${where}: الصفحة مش أعرض من الشاشة (${w.page} ≤ ${w.screen})`);
};
const drawerFits = async (where) => {
  await p.$eval('[aria-label="القايمة"]', (e) => e.click()); await p.waitForTimeout(450);
  const r = await p.$eval('.drawer', (d) => { const x = d.getBoundingClientRect(); return { left: Math.round(x.left), right: Math.round(x.right), w: innerWidth, items: d.querySelectorAll('.drawer-item').length }; });
  ok(r.left >= 0 && r.right <= r.w && r.items > 3, `${where}: القايمة الجانبية كلها جوه الشاشة (${r.left}→${r.right} من ${r.w})، وفيها ${r.items} اختيار`);
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
};
const login = async (email) => { await p.waitForSelector('.auth-card'); await p.click(`[data-demo="${email}"]`); await p.click('#authForm button[type=submit]'); };
const tabs = async (where) => {
  const list = await p.$$eval('#tabs [data-tab]', (x) => x.map((e) => e.dataset.tab));
  for (const t of list) { await p.$eval(`#tabs [data-tab="${t}"]`, (e) => e.click()); await check(`${where} ← ${t}`); }
};

for (const [page, email] of [['restaurant.html', 'owner@demo.com'], ['delivery.html', 'driver@demo.com'], ['admin.html', 'admin@demo.com'], ['admin.html', 'staff@demo.com']]) {
  await p.goto(B + page); await login(email); await p.waitForSelector('#tabs', { state: 'attached' }); await p.waitForTimeout(500);
  await check(`${page} (${email})`);
  await drawerFits(`${page} (${email})`);
  await tabs(`${page} (${email})`);
  if (email === 'admin@demo.com') {
    await p.$eval('[data-tab="orders"]', (e) => e.click()); await p.waitForSelector('[data-filter="all"]');
    await p.$eval('[data-filter="all"]', (e) => e.click()); await p.waitForSelector('tr[data-open-order="long0"]');
    await p.$eval('tr[data-open-order="long0"]', (e) => e.click()); await p.waitForSelector('.od-head'); await check('admin ← صفحة طلب بأسامي طويلة');
    await p.$eval('[data-tab="support"]', (e) => e.click()); await p.waitForSelector('[data-ticket]');
    await p.$eval('[data-ticket="longT"]', (e) => e.click()); await p.waitForSelector('#adminReply'); await check('admin ← شكوى فيها لينك طويل');
  }
  await p.evaluate(() => localStorage.removeItem('arrivo_demo_session')).catch(() => {});
  await p.context().clearCookies();
  await p.evaluate(() => { for (const k of Object.keys(sessionStorage)) sessionStorage.removeItem(k); });
}

// العميل
await p.goto(B + '#/login'); await login('customer@demo.com'); await p.waitForSelector('.card');
for (const h of ['#/', '#/restaurant/burger-house', '#/offers', '#/orders', '#/order/long0', '#/account', '#/support', '#/favorites']) {
  await p.goto(B + h); await p.waitForTimeout(500); await check(`العميل ${h}`);
}
await drawerFits('العميل');

console.log('errors', errs);
await b.close();
if (fails.length || errs.length) { console.log('FAILED'); process.exit(1); }
console.log('ALL PASSED');
