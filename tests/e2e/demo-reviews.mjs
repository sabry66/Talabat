// التقييمات: العميل يقيّم بعد التوصيل بس ومرة واحدة، والتقييم الحقيقي بيظهر على المطعم ولصاحبه
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

const c = await mk();
await c.goto(B + '#/login'); await login(c, 'customer@demo.com'); await c.waitForSelector('.card');
ok((await c.$$eval('.grid .card .rating', x => x.map(e => e.textContent))).every(t => t.includes('جديد')), 'no fake ratings: every restaurant shows "جديد" before real reviews');
await c.goto(B + '#/restaurant/burger-house'); await c.waitForSelector('[data-add="bh3"]'); await c.click('[data-add="bh3"]'); await c.click('[data-inc="bh3"]');
await c.goto(B + '#/cart'); await c.waitForSelector('#zoneSelect'); await c.selectOption('#zoneSelect', { index: 1 });
await c.goto(B + '#/checkout'); await c.waitForSelector('#placeBtn'); await c.fill('textarea[name=address]', 'عنوان'); await c.click('#placeBtn'); await c.waitForSelector('.track');
const orderId = c.url().split('/').pop();
ok(!(await c.$('#rateForm')), 'no rating form before delivery');

// المطعم والمندوب يوصّلوا الطلب
const o = await mk();
await o.goto(B + 'restaurant.html'); await login(o, 'owner@demo.com'); await o.waitForSelector(`[data-id="${orderId}"][data-status="preparing"]`);
await o.click(`[data-id="${orderId}"][data-status="preparing"]`); await o.waitForSelector(`[data-pack="${orderId}:0"]`);
await o.click(`[data-pack="${orderId}:0"]`); await o.waitForTimeout(150); await o.click(`[data-id="${orderId}"][data-status="ready"]`); await o.waitForTimeout(300);
const d = await mk();
await d.goto(B + 'delivery.html'); await login(d, 'driver@demo.com'); await d.waitForSelector(`[data-claim="${orderId}"]`);
await d.click(`[data-claim="${orderId}"]`); await d.waitForSelector(`[data-id="${orderId}"][data-status="on_way"]`); await d.click(`[data-id="${orderId}"][data-status="on_way"]`);
await d.waitForSelector(`[data-id="${orderId}"][data-status="delivered"]`); await d.click(`[data-id="${orderId}"][data-status="delivered"]`); await d.waitForTimeout(500);

// العميل يقيّم
await c.waitForSelector('#rateForm', { timeout: 8000 });
ok(await c.$eval('#rateForm button[type=submit]', e => e.disabled), 'submit disabled until the food is rated');
await c.click('[data-star="food:4"]'); await c.fill('#rateComment', 'البرجر حلو بس محتاج صوص أكتر');
await c.click('[data-star="delivery:5"]');
ok(await c.inputValue('#rateComment') === 'البرجر حلو بس محتاج صوص أكتر', 'comment kept while picking stars');
await c.screenshot({ path: `${SP}/reviews-form.png`, fullPage: true });
await c.click('#rateForm button[type=submit]'); await c.waitForTimeout(600);
const dbx = await db(c);
ok(dbx.reviews?.[orderId]?.food === 4 && dbx.reviews[orderId].delivery === 5 && dbx.reviews[orderId].name === 'عميل', 'review saved (food 4, delivery 5, first name only)');
ok(dbx.restaurants['burger-house'].ratingSum === 4 && dbx.restaurants['burger-house'].ratingCount === 1, 'restaurant aggregate updated (4 / 1)');
ok((await c.textContent('.review-box.ok')).includes('شكرًا'), 'thank-you shown after rating');
await c.reload(); await c.waitForSelector('.track'); await c.waitForTimeout(800);
ok(!(await c.$('#rateForm')) && !!(await c.$('.review-box.ok')), 'cannot rate the same order twice (form gone after reload)');
const again = await c.evaluate(async (id) => { try { const { backend } = await import('/js/backend/index.js'); const o = JSON.parse(localStorage.getItem('arrivo_demo_db_v3')).orders[id]; await backend.submitReview(o, { uid: 'u-customer', name: 'x' }, { food: 5 }); return 'ALLOWED'; } catch (e) { return e.code; } }, orderId);
ok(again === 'permission-denied', 'backend refuses a second review');

await c.goto(B); await c.waitForSelector('.grid .card');
const card = await c.$eval('.grid .card[href="#/restaurant/burger-house"] .rating', e => e.textContent.replace(/[٠-٩]/g, x => '٠١٢٣٤٥٦٧٨٩'.indexOf(x)));
ok(card.includes('4') && card.includes('(1)'), `home card shows the real rating: ${card}`);
await c.goto(B + '#/restaurant/burger-house'); await c.waitForSelector('#reviewsBox:not([hidden])');
ok((await c.textContent('#reviewsBox')).includes('محتاج صوص أكتر'), 'restaurant page shows the customer comment');
await c.screenshot({ path: `${SP}/reviews-restaurant-page.png`, fullPage: true });

await o.$eval('[data-tab="reviews"]', e => e.click()); await o.waitForSelector('.rating-summary');
ok((await o.textContent('#tabBody')).includes('محتاج صوص أكتر'), 'owner sees the review in ⭐ التقييمات');
await o.screenshot({ path: `${SP}/reviews-owner.png`, fullPage: true });
console.log('errors', errs); if (errs.length) fails.push('page errors');
console.log(fails.length ? `FAILED: ${fails.length}` : 'ALL PASSED');
await b.close();
