// مناطق توصيل المطعم: صاحب المطعم يختار بيوصّل لفين، والعميل في منطقة تانية يعرف ومينفعش يطلب
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

const o = await mk();
await o.goto(B + 'restaurant.html'); await login(o, 'owner@demo.com'); await o.waitForSelector('#tabs', { state: 'attached' });
await o.$eval('[data-tab="menu"]', e => e.click()); await o.waitForSelector('[data-zall]');
ok(await o.$eval('[data-zall]', e => e.checked) && await o.isHidden('.zone-chips'), 'default: all zones');
await o.uncheck('[data-zall]');
ok(await o.isVisible('.zone-chips'), 'unchecking "all" shows the zone list');
const zoneIds = await o.$$eval('[data-rzone]', x => x.map(e => e.dataset.rzone));
for (const id of zoneIds) await o.uncheck(`[data-rzone="${id}"]`);
await o.$eval('#editorForm', f => f.requestSubmit()); await o.waitForTimeout(200);
ok(await o.isVisible('#editorError') && (await o.textContent('#editorError')).includes('منطقة توصيل واحدة'), 'needs at least one zone');
await o.check('[data-rzone="nasr_city"]'); await o.check('[data-rzone="heliopolis"]');
await o.$eval('#editorForm', f => f.requestSubmit()); await o.waitForTimeout(400);
const saved = await o.evaluate(() => JSON.parse(localStorage.getItem('arrivo_demo_db_v3')).restaurants['burger-house'].zones);
ok(JSON.stringify(saved?.sort()) === '["heliopolis","nasr_city"]', 'zones saved: ' + JSON.stringify(saved));

const c = await mk();
await c.goto(B + '#/login'); await login(c, 'customer@demo.com'); await c.waitForSelector('#homeZone');
await c.selectOption('#homeZone', 'maadi'); await c.waitForTimeout(200);
const cards = await c.$$eval('.grid a.card', x => x.map(a => ({ id: a.getAttribute('href').split('/').pop(), off: a.textContent.includes('مش بيوصّل') })));
ok(cards.at(-1).id === 'burger-house' && cards.at(-1).off, 'out-of-zone restaurant goes last with a tag');
ok(cards.filter(x => x.off).length === 1, 'other restaurants still deliver');
await c.screenshot({ path: `${SP}/zones-home.png` });
await c.goto(B + '#/restaurant/burger-house'); await c.waitForSelector('[data-add="bh3"]');
ok((await c.textContent('#app')).includes('مش بيوصّل لـ المعادي'), 'restaurant page warns');
await c.click('[data-add="bh3"]'); await c.click('[data-inc="bh3"]');
await c.goto(B + '#/cart'); await c.waitForSelector('#zoneSelect');
const opts = await c.$$eval('#zoneSelect option', x => x.map(e => e.value).filter(Boolean));
ok(JSON.stringify(opts.sort()) === '["heliopolis","nasr_city"]', 'cart lists only zones it serves');
ok((await c.textContent('#app')).includes('مش بيوصّل لـ المعادي') && !(await c.textContent('.summary')).includes('٤٠'), 'cart warns and charges no maadi fee');
await c.goto(B + '#/checkout'); await c.waitForSelector('#placeBtn');
await c.fill('textarea[name=address]', 'عنوان'); await c.click('#placeBtn'); await c.waitForTimeout(300);
ok(c.url().includes('checkout'), 'cannot order to maadi');
await c.selectOption('#zoneSelect', 'nasr_city'); await c.click('#placeBtn'); await c.waitForSelector('.track');
ok(true, 'order to nasr_city works');
const refused = await c.evaluate(async () => {
  const { backend } = await import('/js/backend/index.js');
  try { await backend.createOrder({ customerUid: 'x', payment: 'cash', lines: [], restaurantId: 'burger-house', zoneId: 'maadi' }, []); return false; } catch { return true; }
});
ok(refused, 'backend refuses an out-of-zone order');
console.log('errors', errs);
await b.close();
if (fails.length || errs.length) { console.log('FAILED'); process.exit(1); }
console.log('ALL PASSED');
