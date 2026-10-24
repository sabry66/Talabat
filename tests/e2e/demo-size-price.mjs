// الحجم بيحدد السعر (ربع / نص / كيلو): سعر الحجم هو سعر الصنف نفسه مش زيادة عليه،
// والمنيو بيكتب "من" أرخص حجم، والخصم بيتطبق على الحجم المختار، والمطعم ميشوفش مشكلة في الأسعار
import { chromium } from 'playwright';
const B = 'http://127.0.0.1:8765/';
const b = await chromium.launch(); const errs = []; const fails = [];
const ok = (cond, msg) => { console.log(cond ? '✔' : '✘', msg); if (!cond) fails.push(msg); };
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', isMobile: true, hasTouch: true });
await ctx.route(/fonts\.googleapis|tile\.openstreetmap|cdnjs|nominatim/, (r) => r.abort());
await ctx.route('**/js/firebase-config.js', (r) => r.fulfill({ contentType: 'application/javascript', body: "export const firebaseConfig = { apiKey: '' }; export const useEmulators = false;" }));
const login = async (p, email) => { await p.waitForSelector('.auth-card'); await p.click(`[data-demo="${email}"]`); await p.click('#authForm button[type=submit]'); };
const mk = async () => { const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept()); return p; };
const latin = (s) => String(s).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/٬/g, '');
const num = async (p, sel) => Number(latin(await p.textContent(sel)).replace(/[^\d.]/g, ''));

const c = await mk();
await c.goto(B + '#/login'); await login(c, 'customer@demo.com'); await c.waitForSelector('.card');
// صنف كباب: السعر الأساسي 130 (ربع كيلو) والأحجام 130 / 250 / 470، وإضافة عيش 10، وصنف تاني عليه خصم 10%
await c.evaluate(() => {
  const db = JSON.parse(localStorage.getItem('arrivo_demo_db_v3'));
  const sizes = () => [{ id: 'q', name: 'ربع كيلو', price: 130 }, { id: 'h', name: 'نص كيلو', price: 250 }, { id: 'k', name: 'كيلو', price: 470 }];
  db.restaurants['burger-house'].menu.unshift({ section: 'مشويات', items: [
    { id: 'kb', name: 'كباب', desc: 'ربع كيلو', price: 130, emoji: '🍢', options: [
      { id: 'gw', name: 'الحجم', required: true, multi: false, choices: sizes() },
      { id: 'gb', name: 'إضافات', required: false, multi: true, choices: [{ id: 'bread', name: 'عيش', price: 10 }] }] },
    { id: 'kf', name: 'كفتة', desc: '', price: 130, emoji: '🍢', offer: { type: 'percent', value: 10 },
      options: [{ id: 'gw', name: 'الحجم', required: true, multi: false, choices: sizes() }] },
  ] });
  localStorage.setItem('arrivo_demo_db_v3', JSON.stringify(db));
});
await c.goto(B + '#/restaurant/burger-house'); await c.reload(); await c.waitForSelector('[data-opt="kb"]');
const card = latin(await c.textContent('.item:has([data-opt="kb"]) .item-info'));
ok(card.includes('من') && card.includes('130'), `المنيو بيكتب "من 130" (${card.replace(/\s+/g, ' ').trim()})`);

await c.click('[data-opt="kb"]'); await c.waitForSelector('.sheet');
const choices = await c.$$eval('.sheet fieldset:first-child .opt-choice b', (x) => x.map((e) => e.textContent));
ok(choices.every((t) => !t.includes('+')), `الأحجام مكتوبة بسعرها من غير "+" (${choices.join(' | ')})`);
ok(await num(c, '[data-confirm]') === 130, 'ربع كيلو = 130 (مش 260)');
await c.click('.opt-choice:has(input[value="k"])');
ok(await num(c, '[data-confirm]') === 470, 'كيلو = 470 (مش 600)');
await c.click('.opt-choice:has(input[value="bread"])');
ok(await num(c, '[data-confirm]') === 480, 'كيلو + عيش = 480');
await c.click('[data-confirm]'); await c.waitForSelector('.sheet', { state: 'detached' });

await c.click('[data-opt="kf"]'); await c.waitForSelector('.sheet');
await c.click('.opt-choice:has(input[value="h"])');
ok(await num(c, '[data-confirm]') === 225, 'كفتة نص كيلو بخصم 10% = 225');
await c.click('[data-confirm]'); await c.waitForSelector('.sheet', { state: 'detached' });

await c.goto(B + '#/cart'); await c.waitForSelector('.cart-line');
ok(latin(await c.textContent('.summary')).includes('705'), 'السلة: 480 + 225 = 705');
await c.selectOption('#zoneSelect', { index: 1 });
await c.goto(B + '#/checkout'); await c.waitForSelector('#placeBtn'); await c.fill('textarea[name=address]', 'عنوان'); await c.click('#placeBtn'); await c.waitForSelector('.track');
const order = await c.evaluate(() => Object.values(JSON.parse(localStorage.getItem('arrivo_demo_db_v3')).orders).at(-1));
const kbLine = order.lines.find((l) => l.id === 'kb'); const kfLine = order.lines.find((l) => l.id === 'kf');
ok(kbLine.options?.includes('الحجم: كيلو') && kbLine.options.includes('إضافات: عيش') && kfLine.options?.includes('الحجم: نص كيلو'),
  `الأوردر متسجل فيه الحجم والإضافات (${JSON.stringify([kbLine.options, kfLine.options])})`);
const track = await c.textContent('#app');
ok(track.includes('الحجم: كيلو') && track.includes('عيش') && track.includes('الحجم: نص كيلو'), 'صفحة متابعة الطلب عند العميل بتكتب الحجم والإضافات');
ok(order.totals.subtotal === 705 && order.lines.find((l) => l.id === 'kb').price === 480, `الطلب اتسجل بـ 705 (${order.totals.subtotal})`);

// المطعم: مفيش تحذير أسعار، ومحرر المنيو بيعرف إن الحجم هو السعر
const o = await mk();
await o.goto(B + 'restaurant.html'); await login(o, 'owner@demo.com'); await o.waitForSelector('.order-card');
const oc = await o.textContent('.order-card');
ok(oc.includes('الحجم: كيلو') && oc.includes('عيش') && oc.includes('الحجم: نص كيلو'), 'المطعم شايف في الأوردر: كباب كيلو + عيش، وكفتة نص كيلو');
ok(!(await o.textContent('.order-card')).includes('المنيو بـ'), 'المطعم مشافش تحذير أسعار على الطلب');
await o.$eval('[data-tab="menu"]', (e) => e.click()); await o.waitForSelector('[data-toggle-opt]');
const key = await o.$$eval('[data-toggle-opt]', (x) => x[0].dataset.toggleOpt);
await o.click(`[data-toggle-opt="${key}"]`); await o.waitForTimeout(200);
ok(await o.isChecked(`[data-o="gsets"][data-k="${key}:0"]`), 'محرر المنيو: "السعر نفسه" متعلّم على الحجم');
ok(latin(await o.textContent(`.edit-item:has([data-toggle-opt="${key}"])`)).includes('من 130'), 'محرر المنيو: سعر الصنف "من 130" بدل خانة السعر');
// لو شال العلامة: يرجع زيادة على السعر
await o.uncheck(`[data-o="gsets"][data-k="${key}:0"]`); await o.waitForTimeout(200);
ok(await o.isVisible(`.edit-item:has([data-toggle-opt="${key}"]) input[data-f="price"]`), 'من غير العلامة: خانة السعر رجعت');
await o.check(`[data-o="gsets"][data-k="${key}:0"]`); await o.waitForTimeout(200);
await o.$eval('#editorForm button[type=submit]', (e) => e.click()); await o.waitForTimeout(600);
const kb = await o.evaluate(() => JSON.parse(localStorage.getItem('arrivo_demo_db_v3')).restaurants['burger-house'].menu[0].items[0]);
ok(kb.options[0].sets === true && kb.price === 130, 'الحفظ: الحجم هو السعر، وسعر الصنف = أرخص حجم');

// المندوب بعد ما المطعم يجهّز الطلب، والأدمن في صفحة الطلب
await o.$eval('[data-tab="orders"]', (e) => e.click()).catch(() => {});
await o.waitForSelector(`[data-id="${order.id}"][data-status="preparing"]`); await o.click(`[data-id="${order.id}"][data-status="preparing"]`); await o.waitForTimeout(300);
const d = await mk();
await d.goto(B + 'delivery.html'); await login(d, 'driver@demo.com'); await d.waitForSelector(`[data-claim="${order.id}"]`);
const dc = await d.textContent('#app');
ok(dc.includes('الحجم: كيلو') && dc.includes('الحجم: نص كيلو'), 'المندوب شايف الحجم في الأوردر');
const a = await mk();
await a.goto(B + 'admin.html'); await login(a, 'admin@demo.com'); await a.waitForSelector('#tabs', { state: 'attached' });
await a.$eval('[data-tab="orders"]', (e) => e.click()); await a.waitForSelector('[data-filter="all"]');
await a.$eval('[data-filter="all"]', (e) => e.click()); await a.waitForSelector(`tr[data-open-order="${order.id}"]`);
await a.$eval(`tr[data-open-order="${order.id}"]`, (e) => e.click()); await a.waitForSelector('.od-head');
const ad = await a.textContent('#app');
ok(ad.includes('الحجم: كيلو') && ad.includes('عيش') && ad.includes('الحجم: نص كيلو'), 'الأدمن وخدمة العملاء شايفين الحجم والإضافات في صفحة الطلب');

console.log('errors', errs);
await b.close();
if (fails.length || errs.length) { console.log('FAILED'); process.exit(1); }
console.log('ALL PASSED');
