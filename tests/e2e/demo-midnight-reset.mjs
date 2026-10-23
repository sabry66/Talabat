// اليوم الجديد بيبدأ من الصفر: اللوحة مفتوحة الساعة 11:59 بالليل، وبعد 12 "النهارده" بقى صفر والطلب راح لـ "امبارح" ومتمسحش
import { chromium } from 'playwright';
const B = 'http://127.0.0.1:8765/';
const b = await chromium.launch(); const errs = []; const fails = [];
const ok = (cond, msg) => { console.log(cond ? '✔' : '✘', msg); if (!cond) fails.push(msg); };
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
await ctx.route(/fonts\.googleapis|tile\.openstreetmap|cdnjs|nominatim/, (r) => r.abort());
await ctx.route('**/js/firebase-config.js', (r) => r.fulfill({ contentType: 'application/javascript', body: "export const firebaseConfig = { apiKey: '' }; export const useEmulators = false;" }));
const a = await ctx.newPage(); a.on('pageerror', (e) => errs.push(e.message));
const late = new Date(); late.setHours(23, 59, 0, 0);
await a.clock.install({ time: late });
const latin = (s) => String(s).replace(/[٠-٩]/g, (x) => '٠١٢٣٤٥٦٧٨٩'.indexOf(x)).replace(/٬/g, '').replace(/\s+/g, ' ');
const stat = async (label) => Number(latin((await a.$$eval('.stats .stat', (x) => x.map((e) => [e.querySelector('span').textContent, e.querySelector('strong').textContent]))).find(([l]) => l.includes(label))?.[1] || '').replace(/[^\d.]/g, ''));

await a.goto(B + 'admin.html'); await a.waitForSelector('.auth-card');
await a.click('[data-demo="admin@demo.com"]'); await a.click('#authForm button[type=submit]'); await a.waitForSelector('#tabs', { state: 'attached' });
await a.evaluate((at) => {
  const db = JSON.parse(localStorage.getItem('arrivo_demo_db_v3'));
  const rates = { driverShare: { type: 'percent', value: 30 }, commission: { type: 'percent', value: 0 }, serviceFee: { type: 'percent', value: 0 }, driverPaysRestaurant: true };
  db.orders.late = { id: 'late', createdAt: at, status: 'delivered', payment: 'cash', restaurantId: 'burger-house', restaurantName: 'بيت البرجر', customerUid: 'u-customer',
    lines: [{ id: 'bh3', name: 'صنف', price: 100, qty: 1 }], rates, totals: { subtotal: 100, delivery: 30, service: 0, discount: 0, foodDiscount: 0, total: 130 }, statusHistory: [] };
  localStorage.setItem('arrivo_demo_db_v3', JSON.stringify(db));
}, late.getTime() - 20 * 60000);
await a.reload(); await a.waitForSelector('#tabs', { state: 'attached' });
await a.$eval('[data-tab="finance"]', (e) => e.click()); await a.waitForSelector('[data-period="today"]');
await a.click('[data-period="today"]'); await a.waitForTimeout(200);
ok(await stat('اللي دفعه العملاء') === 130, '11:59 بالليل: النهارده 130');

await a.clock.runFor(2 * 60 * 1000); // عدّت 12
await a.waitForTimeout(300);
ok(await stat('اللي دفعه العملاء') === 0 && await stat('عدد الأوردرات') === 0, 'بعد 12 بالليل: النهارده بقى صفر من غير ما حد يعمل حاجة');
await a.click('[data-period="yesterday"]'); await a.waitForTimeout(200);
ok(await stat('اللي دفعه العملاء') === 130, 'وطلب امبارح لسه موجود في "امبارح" (متمسحش)');
console.log('errors', errs);
await b.close();
if (fails.length || errs.length) { console.log('FAILED'); process.exit(1); }
console.log('ALL PASSED');
