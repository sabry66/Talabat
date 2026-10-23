// كل طلب متسجل بمين طلبه ومين المطعم ومين المندوب (وكل مندوب أخده ورجّعه)، وكل خطوة مين عملها،
// والأدمن وخدمة العملاء يقدروا يدوّروا برقم الطلب أو الموبايل ويفتحوا كل التفاصيل والشكاوي
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
const dbOrder = (p, id) => p.evaluate((x) => JSON.parse(localStorage.getItem('arrivo_demo_db_v3')).orders[x], id);

// العميل يطلب
const c = await mk();
await c.goto(B + '#/login'); await login(c, 'customer@demo.com'); await c.waitForSelector('.card');
await c.goto(B + '#/restaurant/burger-house'); await c.waitForSelector('[data-add="bh3"]'); await c.click('[data-add="bh3"]'); await c.click('[data-inc="bh3"]');
await c.goto(B + '#/cart'); await c.waitForSelector('#zoneSelect'); await c.selectOption('#zoneSelect', 'maadi');
await c.goto(B + '#/checkout'); await c.waitForSelector('#placeBtn'); await c.fill('textarea[name=address]', 'المعادي'); await c.click('#placeBtn'); await c.waitForSelector('.track');
const id = c.url().split('/').pop();
const code = id.slice(-6).toUpperCase();
ok((await c.textContent('.track')).includes(code), `العميل شايف رقم الطلب #${code} (يقوله لخدمة العملاء)`);

// المطعم يقبل، والمندوب ياخده ويرجّعه، وبعدين ياخده تاني ويوصّله
const o = await mk();
await o.goto(B + 'restaurant.html'); await login(o, 'owner@demo.com'); await o.waitForSelector(`[data-id="${id}"][data-status="preparing"]`);
await o.click(`[data-id="${id}"][data-status="preparing"]`); await o.waitForSelector(`[data-pack="${id}:0"]`);
await o.click(`[data-pack="${id}:0"]`); await o.waitForTimeout(150); await o.click(`[data-id="${id}"][data-status="ready"]`); await o.waitForTimeout(300);
const d = await mk();
await d.goto(B + 'delivery.html'); await login(d, 'driver@demo.com'); await d.waitForSelector(`[data-claim="${id}"]`);
await d.click(`[data-claim="${id}"]`); await d.waitForSelector(`[data-release="${id}"]`);
await d.click(`[data-release="${id}"]`); await d.waitForTimeout(400);
await d.$eval('[data-tab="available"]', (e) => e.click()); await d.waitForSelector(`[data-claim="${id}"]`);
await d.click(`[data-claim="${id}"]`); await d.waitForSelector(`[data-id="${id}"][data-status="on_way"]`);
await d.click(`[data-id="${id}"][data-status="on_way"]`); await d.waitForSelector(`[data-id="${id}"][data-status="delivered"]`);
await d.click(`[data-id="${id}"][data-status="delivered"]`); await d.waitForTimeout(400);

const ord = await dbOrder(c, id);
ok(ord.restaurantId === 'burger-house' && ord.restaurantName && ord.restaurantPhone, 'الطلب متسجل بالمطعم (اسمه وتليفونه)');
ok(ord.driverUid === 'u-driver' && ord.driverName && ord.driverPhone, 'الطلب متسجل بالمندوب اللي وصّله (اسمه وموبايله)');
ok(ord.driverLog?.map((x) => x.action).join() === 'claimed,released,claimed' && ord.driverLog.every((x) => x.uid === 'u-driver' && x.phone), 'سجل المندوبين: أخده ← رجّعه ← أخده تاني');
const steps = ord.statusHistory.map((h) => `${h.status}:${h.by?.role}`).join(' ');
ok(steps === 'placed:customer preparing:restaurant ready:restaurant on_way:driver delivered:driver', `كل خطوة متسجلة باللي عملها: ${steps}`);

// العميل يشتكي على الطلب
await c.goto(B + `#/support/order/${id}`); await c.waitForSelector('[name=subject]');
await c.fill('[name=subject]', 'الأكل وصل بارد'); await c.fill('[name=text]', 'الأكل كان بارد خالص');
await c.click('form button[type=submit]'); await c.waitForTimeout(500);

// الأدمن يدوّر
const a = await mk();
await a.goto(B + 'admin.html'); await login(a, 'admin@demo.com'); await a.waitForSelector('#tabs', { state: 'attached' });
await a.$eval('[data-tab="orders"]', (e) => e.click()); await a.waitForSelector('#orderSearch');
const found = async (q) => { await a.fill('#orderSearch', q); await a.waitForTimeout(150); return a.$$eval('#ordersTable tr[data-open-order]', (r) => r.map((x) => x.dataset.openOrder)); };
let r = await found(`#${code.toLowerCase()}`); ok(r.length === 1 && r[0] === id, `بحث برقم الطلب #${code.toLowerCase()} (حروف صغيرة)`);
r = await found('+201000000003'); ok(r.includes(id), 'بحث بموبايل العميل بـ +20');
r = await found('٠١٠٠٠٠٠٠٠٠٤'); ok(r.includes(id), 'بحث بموبايل المندوب بأرقام عربي');
r = await found('مندوب تجريبي'); ok(r.includes(id), 'بحث باسم المندوب');
r = await found('بيت البرجر'); ok(r.includes(id), 'بحث باسم المطعم');
r = await found('zzzz'); ok(r.length === 0 && (await a.textContent('#ordersTable')).includes('مفيش طلب مطابق'), 'بحث مالوش نتيجة');
ok(await a.$eval('#orderSearch', (e) => document.activeElement === e), 'خانة البحث فاضلة شغالة وإنت بتكتب');

// يفتح الطلب
await found(code); await a.click(`tr[data-open-order="${id}"]`); await a.waitForSelector('.od-head');
const page = await a.textContent('#tabBody');
ok(page.includes('بيت البرجر') && page.includes(ord.restaurantPhone), 'التفاصيل: المطعم وتليفونه');
ok(page.includes('عميل تجريبي') && page.includes('01000000003'), 'التفاصيل: العميل وموبايله');
ok(page.includes('وصّله') && page.includes('مندوب تجريبي') && page.includes('01000000004'), 'التفاصيل: المندوب اللي وصّله وموبايله');
ok((await a.$$('.od-log li')).length === 3 && (await a.textContent('.od-log')).includes('رجّعه'), 'التفاصيل: سجل المندوبين (3 سطور فيهم "رجّعه")');
const tl = await a.textContent('.od-timeline');
ok(tl.includes('صاحب بيت البرجر') && tl.includes('مندوب تجريبي') && tl.includes('عميل تجريبي'), 'التفاصيل: كل خطوة باسم اللي عملها');
ok((await a.textContent('#tabBody')).includes('الأكل وصل بارد'), 'التفاصيل: الشكوى المرتبطة بالطلب ظاهرة');
await a.screenshot({ path: `${SP}/order-detail-admin.png`, fullPage: true });
await a.click('[data-open-ticket]'); await a.waitForSelector('#adminReply');
ok(true, 'من الطلب للشكوى بدوسة');
await a.click('#openTicketOrder'); await a.waitForSelector('.od-head');
ok((await a.textContent('.od-head')).includes(code), 'ومن الشكوى للطلب بدوسة');

// خدمة العملاء: تشوف الطلبات وتدوّر بس من غير ما تغيّر الحالة
const s = await mk();
await s.goto(B + 'admin.html'); await login(s, 'staff@demo.com'); await s.waitForSelector('#tabs', { state: 'attached' });
ok(Boolean(await s.$('[data-tab="orders"]')), 'خدمة العملاء عندها تبويب الطلبات');
await s.$eval('[data-tab="orders"]', (e) => e.click()); await s.waitForSelector('#orderSearch');
await s.fill('#orderSearch', code); await s.waitForTimeout(150); await s.click(`tr[data-open-order="${id}"]`); await s.waitForSelector('.od-head');
ok(!(await s.$('.od-head select')), 'خدمة العملاء مش بتقدر تغيّر حالة الطلب');

console.log('errors', errs);
await b.close();
if (fails.length || errs.length) { console.log('FAILED'); process.exit(1); }
console.log('ALL PASSED');
