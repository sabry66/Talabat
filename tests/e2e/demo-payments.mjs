// طرق الدفع: الأدمن يفعّل ويقفل ويكتب ملاحظة، والعميل يشوف المفعّل بس، والمندوب يعرف هيحصّل إزاي
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
const toasts = []; const lastToast = async (p) => (await p.textContent('#toast')).trim();
const methods = (p) => p.$$eval('#payOptions [name=payment]', x => x.map(e => e.value));

const c = await mk();
await c.goto(B + '#/login'); await login(c, 'customer@demo.com'); await c.waitForSelector('.card');
const toCheckout = async () => {
  await c.goto(B + '#/restaurant/burger-house'); await c.waitForSelector('[data-add="bh3"], [data-inc="bh3"]');
  if (!(await c.$('[data-inc="bh3"]'))) await c.click('[data-add="bh3"]');
  await c.click('[data-inc="bh3"]');
  await c.goto(B + '#/cart'); await c.waitForSelector('#zoneSelect'); await c.selectOption('#zoneSelect', { index: 1 });
  await c.goto(B + '#/checkout'); await c.waitForSelector('#placeBtn');
};
await toCheckout();
ok(JSON.stringify(await methods(c)) === '["cash","card"]', 'default: cash + card, wallet off');

// الأدمن
const a = await mk();
await a.goto(B + 'admin.html'); await login(a, 'admin@demo.com'); await a.waitForSelector('#tabs', { state: 'attached' });
await a.$eval('[data-tab="zones"]', e => e.click()); await a.waitForSelector('[data-pay="cash"]');
await a.uncheck('[data-pay="cash"]'); await a.uncheck('[data-pay="card"]');
await a.$eval('#settingsForm', f => f.requestSubmit()); await a.waitForTimeout(200);
ok((await lastToast(a)).includes('طريقة دفع واحدة على الأقل'), 'cannot turn off every method');
await a.check('[data-pay="wallet"]');
await a.$eval('#settingsForm', f => f.requestSubmit()); await a.waitForTimeout(200);
ok((await lastToast(a)).includes('رقم التحويل'), 'wallet needs the transfer number');
await a.fill('[data-pay-note="wallet"]', 'إنستاباي arrivo@instapay أو فودافون كاش 01011112222');
await a.check('[data-pay="card"]');
await a.$eval('#settingsForm', f => f.requestSubmit()); await a.waitForTimeout(300);
ok((await lastToast(a)).includes('تم حفظ'), 'admin saved: card + wallet, cash off');
await a.screenshot({ path: `${SP}/payments-admin.png`, fullPage: true });

// العميل وهو في صفحة الدفع: الطرق اتحدثت لوحدها
await c.waitForTimeout(400);
ok(JSON.stringify(await methods(c)) === '["card","wallet"]', 'checkout updates live: card + wallet');
await c.check('#payOptions [value=wallet]');
ok(await c.isVisible('#payOptions .pay:has([value=wallet]) .pay-note') && (await c.textContent('#payOptions')).includes('01011112222'), 'wallet note shown when picked');
await c.fill('textarea[name=address]', 'عنوان تجربة الدفع');
await c.screenshot({ path: `${SP}/payments-checkout.png`, fullPage: true });
await c.click('#placeBtn'); await c.waitForSelector('.track');
const orderId = c.url().split('/').pop();
ok((await c.textContent('.track, #app')).includes('01011112222'), 'order page shows transfer instructions');
const order = await c.evaluate((id) => JSON.parse(localStorage.getItem('arrivo_demo_db_v3')).orders[id], orderId);
ok(order.payment === 'wallet' && order.paymentNote.includes('instapay'), 'order saved with wallet + note');

// الباك إند بيرفض طريقة مقفولة (زي القواعد)
const refused = await c.evaluate(async () => {
  const { backend } = await import('/js/backend/index.js');
  try { await backend.createOrder({ customerUid: 'x', payment: 'cash', lines: [] }, []); return false; } catch { return true; }
});
ok(refused, 'backend refuses a disabled method (cash)');

// المطعم يقبل، والمندوب يشوف هيحصّل إزاي
const o = await mk();
await o.goto(B + 'restaurant.html'); await login(o, 'owner@demo.com'); await o.waitForSelector(`[data-id="${orderId}"][data-status="preparing"]`);
await o.click(`[data-id="${orderId}"][data-status="preparing"]`); await o.waitForTimeout(300);
const d = await mk();
await d.goto(B + 'delivery.html'); await login(d, 'driver@demo.com'); await d.waitForSelector(`[data-claim="${orderId}"]`);
const card = await d.$eval(`[data-claim="${orderId}"]`, e => e.closest('article').textContent);
await d.screenshot({ path: `${SP}/payments-driver.png`, fullPage: true });
ok(card.includes('تحويل') && card.includes('رسالة التحويل'), 'driver told to check the transfer message');

console.log('errors', errs);
await b.close();
if (fails.length || errs.length) { console.log('FAILED'); process.exit(1); }
console.log('ALL PASSED');
