// الحسابات بالتواريخ: النهارده، امبارح، آخر 7 أيام، يوم واحد، من يوم ليوم، يوم بيوم، وتنزيل Excel،
// وفترة قديمة بعد ما الطلبات تعدّي 1000 (بتتجاب من قاعدة البيانات مش من اللي متحمّل)
// كل طلب: أكل S + توصيل 30، من غير خصم ولا عمولة ← العميل يدفع S + 30، المندوب 9، المنصة 21
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const B = 'http://127.0.0.1:8765/';
const b = await chromium.launch(); const errs = []; const fails = [];
const ok = (cond, msg) => { console.log(cond ? '✔' : '✘', msg); if (!cond) fails.push(msg); };
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block', acceptDownloads: true });
await ctx.route(/fonts\.googleapis|tile\.openstreetmap|cdnjs|nominatim/, (r) => r.abort());
await ctx.route('**/js/firebase-config.js', (r) => r.fulfill({ contentType: 'application/javascript', body: "export const firebaseConfig = { apiKey: '' }; export const useEmulators = false;" }));
const login = async (p, email) => { await p.waitForSelector('.auth-card'); await p.click(`[data-demo="${email}"]`); await p.click('#authForm button[type=submit]'); };
const a = await ctx.newPage(); a.on('pageerror', (e) => errs.push(e.message));
const latin = (s) => String(s).replace(/[٠-٩]/g, (x) => '٠١٢٣٤٥٦٧٨٩'.indexOf(x)).replace(/٬/g, '').replace(/\s+/g, ' ');
const day = (off) => { const d = new Date(); d.setDate(d.getDate() - off); d.setHours(12, 0, 0, 0); return d; };
const iso = (off) => { const d = day(off); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

await a.goto(B + 'admin.html'); await login(a, 'admin@demo.com'); await a.waitForSelector('#tabs', { state: 'attached' });
// طلبات في أيام مختلفة
const seed = (list) => a.evaluate((list) => {
  const db = JSON.parse(localStorage.getItem('arrivo_demo_db_v3'));
  const rates = { driverShare: { type: 'percent', value: 30 }, commission: { type: 'percent', value: 0 }, serviceFee: { type: 'percent', value: 0 }, driverPaysRestaurant: true };
  for (const [i, [at, sub, status]] of list.entries()) {
    const id = `seed${i}_${at}`;
    db.orders[id] = { id, createdAt: at, status: status || 'delivered', payment: 'cash', restaurantId: 'burger-house', restaurantName: 'بيت البرجر', customerUid: 'u-customer', customerName: 'عميل',
      driverUid: 'u-driver', driverName: 'مندوب تجريبي', zoneName: 'المعادي', lines: [{ id: 'bh3', name: 'صنف', price: sub, qty: 1 }], rates,
      totals: { subtotal: sub, delivery: 30, service: 0, discount: 0, foodDiscount: 0, total: sub + 30 }, statusHistory: [] };
  }
  localStorage.setItem('arrivo_demo_db_v3', JSON.stringify(db));
}, list);
await seed([[+day(0), 100], [+day(0), 200], [+day(0), 999, 'cancelled'], [+day(1), 150], [+day(3), 50], [+day(40), 300]]);
// شكاوي: اتنين النهارده (واحدة اتقفلت)، وواحدة من 3 أيام، وواحدة من 40 يوم
const seedTickets = (list) => a.evaluate((list) => {
  const db = JSON.parse(localStorage.getItem('arrivo_demo_db_v3'));
  db.tickets ||= {};
  for (const [i, [at, status]] of list.entries()) {
    const id = `t${i}_${at}`;
    db.tickets[id] = { id, uid: 'u-customer', name: 'عميل', role: 'customer', topic: 'order', subject: 'شكوى', status, lastBy: 'user', createdAt: at, updatedAt: at, messages: [{ by: 'u-customer', name: 'عميل', text: 'x', at }] };
  }
  localStorage.setItem('arrivo_demo_db_v3', JSON.stringify(db));
}, list);
await seedTickets([[+day(0), 'open'], [+day(0), 'closed'], [+day(3), 'open'], [+day(40), 'closed']]);
await a.reload(); await a.waitForSelector('#tabs', { state: 'attached' });
await a.$eval('[data-tab="finance"]', (e) => e.click()); await a.waitForSelector('.period-box');

const stat = async (label) => {
  const all = await a.$$eval('.stats .stat', (x) => x.map((e) => [e.querySelector('span').textContent, e.querySelector('strong').textContent]));
  return Number(latin(all.find(([l]) => l.includes(label))?.[1] || '').replace(/[^\d.]/g, ''));
};
const pick = async (k) => { await a.click(`[data-period="${k}"]`); await a.waitForTimeout(250); };

await pick('today');
ok(await stat('اللي دفعه العملاء') === 360 && await stat('عدد الأوردرات') === 2, 'النهارده: طلبين بـ 360 (الملغي مش محسوب)');
ok(await stat('ربح المنصة') === 42, 'النهارده: ربح المنصة 42');
ok(await stat('اتلغى') === 1, 'النهارده: طلب واحد اتلغى (معدود لوحده)');
ok(await stat('الشكاوي') === 2 && latin(await a.textContent('.stats')).includes('1 اتقفلت • 1 مفتوحة'), 'النهارده: شكوتين (واحدة اتقفلت وواحدة مفتوحة)');
await pick('yesterday');
ok(await stat('اللي دفعه العملاء') === 180, 'امبارح: 180');
await pick('week');
ok(await stat('اللي دفعه العملاء') === 620, 'آخر 7 أيام: 360 + 180 + 80 = 620');
const days = await a.$$eval('.days-table tbody tr', (r) => r.length);
ok(days === 3, `يوم بيوم: 3 أيام فيهم طلبات (${days})`);
ok(latin(await a.textContent('.days-table tfoot')).includes('620'), 'يوم بيوم: سطر الإجمالي 620');
const cols = await a.$$eval('.days-table tbody tr', (r) => r.map((x) => [...x.children].slice(-3).map((c) => c.textContent.trim())));
ok(JSON.stringify(cols[0]) === JSON.stringify(['1', '—', '2']) && JSON.stringify(cols[2]) === JSON.stringify(['—', '—', '1']), `يوم بيوم: الملغي والناقص والشكاوي لكل يوم ${JSON.stringify(cols)}`);
await a.screenshot({ path: new URL('../out/finance-periods.png', import.meta.url).pathname, fullPage: true });

// تنزيل Excel
const [dl] = await Promise.all([a.waitForEvent('download'), a.click('#exportCsv')]);
const csv = readFileSync(await dl.path(), 'utf8');
ok(dl.suggestedFilename().startsWith('arrivo-') && csv.startsWith('﻿') && csv.trim().split('\n').length === 1 + 4, `ملف Excel فيه 4 طلبات + العناوين (${dl.suggestedFilename()})`);
ok(csv.includes('ربح المنصة') && csv.includes('بيت البرجر'), 'الملف فيه الأعمدة والبيانات بالعربي');

// يوم واحد، ومن يوم ليوم
await pick('custom'); await a.waitForSelector('#rangeFrom');
await a.fill('#rangeFrom', iso(3)); await a.dispatchEvent('#rangeFrom', 'change'); await a.waitForTimeout(150);
await a.fill('#rangeTo', iso(3)); await a.dispatchEvent('#rangeTo', 'change'); await a.waitForTimeout(250);
ok(await stat('اللي دفعه العملاء') === 80, `يوم واحد (${iso(3)}): 80`);
await a.fill('#rangeTo', iso(1)); await a.dispatchEvent('#rangeTo', 'change'); await a.waitForTimeout(250);
ok(await stat('اللي دفعه العملاء') === 260, `من ${iso(3)} لـ ${iso(1)}: 80 + 180 = 260`);
ok(latin(await a.textContent('.range-label')).includes('من'), 'مكتوب الفترة من … لـ …');
await pick('all');
ok(await stat('اللي دفعه العملاء') === 950, 'الكل: 950');

// أكتر من 1000 طلب: الطلب القديم (من 40 يوم) مش في اللي متحمّل، والفترة بتتجاب من قاعدة البيانات
await seed(Array.from({ length: 1000 }, () => [+day(0) + Math.floor(Math.random() * 1000), 10]));
await a.reload(); await a.waitForSelector('#tabs', { state: 'attached' });
await a.$eval('[data-tab="finance"]', (e) => e.click()); await a.waitForSelector('.period-box');
await pick('custom'); await a.waitForSelector('#rangeFrom');
await a.fill('#rangeFrom', iso(41)); await a.dispatchEvent('#rangeFrom', 'change'); await a.waitForTimeout(150);
await a.fill('#rangeTo', iso(39)); await a.dispatchEvent('#rangeTo', 'change');
await a.waitForSelector('.stats', { timeout: 8000 });
ok(await stat('اللي دفعه العملاء') === 330 && await stat('عدد الأوردرات') === 1, 'فترة قديمة بعد 1000 طلب: الطلب اتجاب (330)');
// نفس الكلام للشكاوي بعد 300 شكوى
await seedTickets(Array.from({ length: 300 }, () => [+day(0) + Math.floor(Math.random() * 1000), 'closed']));
await a.reload(); await a.waitForSelector('#tabs', { state: 'attached' });
await a.$eval('[data-tab="finance"]', (e) => e.click()); await a.waitForSelector('.period-box');
await pick('custom'); await a.waitForSelector('#rangeFrom');
await a.fill('#rangeFrom', iso(41)); await a.dispatchEvent('#rangeFrom', 'change'); await a.waitForTimeout(150);
await a.fill('#rangeTo', iso(39)); await a.dispatchEvent('#rangeTo', 'change');
await a.waitForSelector('.stats', { timeout: 8000 });
ok(await stat('الشكاوي') === 1, 'شكوى قديمة بعد 300 شكوى: اتجابت من قاعدة البيانات');

console.log('errors', errs);
await b.close();
if (fails.length || errs.length) { console.log('FAILED'); process.exit(1); }
console.log('ALL PASSED');
