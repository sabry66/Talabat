// اختيارات وإضافات الصنف: العميل يختار الحجم والإضافات، السلة والطلب والسعر، "اطلب تاني"، وصاحب المطعم يضيف اختيارات
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
const price = async (p, sel) => Number((await p.textContent(sel)).replace(/[^\d٠-٩]/g, '').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)));

const c = await mk();
await c.goto(B + '#/login'); await login(c, 'customer@demo.com'); await c.waitForSelector('.card');
await c.goto(B + '#/restaurant/burger-house'); await c.waitForSelector('[data-opt="bh1"]');
ok((await c.textContent('.item:has([data-opt="bh1"])')).includes('فيه اختيارات'), 'menu marks item with options');
await c.click('[data-opt="bh1"]'); await c.waitForSelector('.sheet');
ok(await c.isChecked('.sheet input[value="single"]'), 'required size pre-selected');
ok(await price(c, '[data-confirm]') === 120, 'base price 120');
await c.click('.opt-choice:has(input[value="double"])'); await c.click('.opt-choice:has(input[value="cheese"])');
ok(await price(c, '[data-confirm]') === 180, 'double + cheese = 180');
for (const v of ['bacon', 'jal']) await c.click(`.opt-choice:has(input[value="${v}"])`);
await c.click('.opt-choice:has(input[value="egg"])'); await c.waitForTimeout(200);
ok(!(await c.isChecked('.sheet input[value="egg"]')), 'max 3 extras enforced');
ok((await c.textContent('#toast')).includes('أقصى'), 'max toast shown');
await c.click('.opt-choice:has(input[value="bacon"])'); await c.click('.opt-choice:has(input[value="jal"])'); // نشيلهم
await c.click('[data-q="1"]');
ok(await price(c, '[data-confirm]') === 360, 'qty 2 → 360');
await c.screenshot({ path: `${SP}/item-options-sheet.png` });
await c.click('[data-confirm]'); await c.waitForSelector('.sheet', { state: 'detached' });
await c.click('[data-opt="bh1"]'); await c.waitForSelector('.sheet'); await c.click('[data-confirm]'); await c.waitForSelector('.sheet', { state: 'detached' });
ok((await c.textContent('[data-opt="bh1"]')).includes('3'), 'menu shows 3 in cart');
await c.goto(B + '#/cart'); await c.waitForSelector('.cart-line');
const lines = await c.$$eval('.cart-line', x => x.map(e => e.textContent.replace(/\s+/g, ' ')));
ok(lines.length === 2 && lines.some(l => l.includes('دبل') && l.includes('جبنة زيادة')) && lines.some(l => l.includes('سينجل')), 'cart has 2 separate lines with option labels');
ok((await c.textContent('.summary')).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).includes('480'), 'subtotal 480');
const dbl = await c.$eval('.cart-line:has(.line-opts:text("دبل")) [data-inc]', e => e.dataset.inc);
await c.click(`[data-inc="${dbl}"]`); await c.waitForTimeout(200);
ok((await c.textContent('.summary')).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).includes('660'), 'increase one line → 660');
await c.screenshot({ path: `${SP}/item-options-cart.png`, fullPage: true });
await c.selectOption('#zoneSelect', { index: 1 });
await c.goto(B + '#/checkout'); await c.waitForSelector('#placeBtn'); await c.fill('textarea[name=address]', 'عنوان'); await c.click('#placeBtn'); await c.waitForSelector('.track');
const order = await c.evaluate(() => { const db = JSON.parse(localStorage.getItem('arrivo_demo_db_v3')); return Object.values(db.orders).at(-1); });
ok(order.lines.length === 2 && order.lines.every(l => l.key) && order.lines.some(l => l.options?.includes('الحجم: دبل')), 'order lines saved with key + options');
ok((await c.textContent('.track, #app')).includes('الحجم: دبل'), 'tracking page shows options');
const orderUrl = c.url();

// صاحب المطعم يشوف الاختيارات ويضيف اختيارات لصنف تاني ويقفل "دبل"
const o = await mk();
await o.goto(B + 'restaurant.html'); await login(o, 'owner@demo.com'); await o.waitForSelector('.order-card');
ok((await o.textContent('.order-card')).includes('الحجم: دبل'), 'restaurant order card shows options');
await o.$eval('[data-tab="menu"]', e => e.click()); await o.waitForSelector('[data-toggle-opt]');
const bh2 = await o.$$eval('.edit-item', x => x.findIndex(e => e.querySelector('[data-f="name"]').value === 'دبل تشيز برجر'));
const key = await o.$$eval('[data-toggle-opt]', (x, i) => x[i].dataset.toggleOpt, bh2);
await o.click(`[data-toggle-opt="${key}"]`); await o.click(`[data-add-g="${key}:size"]`); await o.waitForTimeout(200);
const bh1key = await o.$$eval('[data-toggle-opt]', x => x[0].dataset.toggleOpt);
await o.click(`[data-toggle-opt="${bh1key}"]`); await o.waitForTimeout(200);
await o.uncheck(`[data-o="cavail"][data-k="${bh1key}:0:1"]`);
await o.screenshot({ path: `${SP}/item-options-editor.png`, fullPage: true });
await o.$eval('#editorForm button[type=submit]', e => e.click()); await o.waitForTimeout(600);
const menu = await o.evaluate(() => JSON.parse(localStorage.getItem('arrivo_demo_db_v3')).restaurants['burger-house'].menu);
const it2 = menu.flatMap(s => s.items).find(i => i.name === 'دبل تشيز برجر');
ok(it2.options?.[0]?.name === 'الحجم' && it2.options[0].choices.length === 3, 'owner added size options to another item');
ok(menu.flatMap(s => s.items).find(i => i.id === 'bh1').options[0].choices[1].available === false, 'owner disabled "دبل"');

// "اطلب تاني": السطر اللي اختياره بقى مش متاح مبيرجعش
await c.goto(orderUrl); await c.waitForSelector('#reorder');
const re = await c.$('#reorder');
if (re) { await re.click(); await c.waitForSelector('.cart-line'); const n = await c.$$eval('.cart-line', x => x.length); ok(n === 1, `reorder restores valid lines only (got ${n})`); }
else ok(false, 'reorder button found');
console.log('errors', errs); if (errs.length) fails.push('page errors');
console.log(fails.length ? `FAILED: ${fails.length}` : 'ALL PASSED');
await b.close();
