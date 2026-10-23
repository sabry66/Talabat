// مكان المندوب لحظيًا: المندوب بيشارك مكانه وهو في الطريق، والعميل شايفه على الخريطة، وبيقف لما يوصّل
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const SP = ROOT + '/out';
const B = 'http://127.0.0.1:8765/';
const LEAF = ROOT + '/node_modules/leaflet/dist/';
const b = await chromium.launch(); const errs = []; const fails = [];
const ok = (cond, msg) => { console.log(cond ? '✔' : '✘', msg); if (!cond) fails.push(msg); };
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', isMobile: true, hasTouch: true,
  geolocation: { latitude: 30.0626, longitude: 31.344 }, permissions: ['geolocation'] });
await ctx.route(/fonts\.googleapis|tile\.openstreetmap|nominatim/, r => r.abort());
// Leaflet من النسخة المحلية بدل الـ CDN
await ctx.route(/cdnjs\.cloudflare\.com\/ajax\/libs\/leaflet\/1\.9\.4\/leaflet\.min\.(js|css)/, (r) => {
  const js = r.request().url().endsWith('.js');
  r.fulfill({ contentType: js ? 'application/javascript' : 'text/css', body: readFileSync(LEAF + (js ? 'leaflet.js' : 'leaflet.css')) });
});
await ctx.route('**/js/firebase-config.js', r => r.fulfill({ contentType: 'application/javascript', body: "export const firebaseConfig = { apiKey: '' }; export const useEmulators = false;" }));
const login = async (p, email) => { await p.waitForSelector('.auth-card'); await p.click(`[data-demo="${email}"]`); await p.click('#authForm button[type=submit]'); };
const mk = async () => { const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept()); return p; };
const dbOf = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('arrivo_demo_db_v3')));

const c = await mk();
await c.goto(B + '#/login'); await login(c, 'customer@demo.com'); await c.waitForSelector('.card');
await c.goto(B + '#/restaurant/burger-house'); await c.waitForSelector('[data-add="bh3"]'); await c.click('[data-add="bh3"]'); await c.click('[data-inc="bh3"]');
await c.goto(B + '#/cart'); await c.waitForSelector('#zoneSelect'); await c.selectOption('#zoneSelect', { index: 1 });
await c.goto(B + '#/checkout'); await c.waitForSelector('#placeBtn'); await c.fill('textarea[name=address]', 'عنوان');
await c.click('#placeBtn'); await c.waitForSelector('.track');
const orderId = c.url().split('/').pop();
// مكان التسليم (العميل كان ممكن يحدده من الخريطة)
await c.evaluate((id) => { const d = JSON.parse(localStorage.getItem('arrivo_demo_db_v3')); d.orders[id].location = { lat: 30.07, lng: 31.35 }; localStorage.setItem('arrivo_demo_db_v3', JSON.stringify(d)); }, orderId);

const o = await mk();
await o.goto(B + 'restaurant.html'); await login(o, 'owner@demo.com'); await o.waitForSelector(`[data-id="${orderId}"][data-status="preparing"]`);
await o.click(`[data-id="${orderId}"][data-status="preparing"]`); await o.waitForSelector(`[data-pack="${orderId}:0"]`);
await o.click(`[data-pack="${orderId}:0"]`); await o.waitForTimeout(150); await o.click(`[data-id="${orderId}"][data-status="ready"]`); await o.waitForTimeout(300);

const d = await mk();
await d.goto(B + 'delivery.html'); await login(d, 'driver@demo.com'); await d.waitForSelector(`[data-claim="${orderId}"]`);
await d.click(`[data-claim="${orderId}"]`); await d.waitForSelector(`[data-id="${orderId}"][data-status="on_way"]`);
ok(!(await dbOf(d)).riderLocations?.[orderId], 'no location shared before "on the way"');
ok(!(await c.$('#riderSlot')), 'customer: no map before "on the way"');
await d.click(`[data-id="${orderId}"][data-status="on_way"]`);
await d.waitForFunction((id) => JSON.parse(localStorage.getItem('arrivo_demo_db_v3')).riderLocations?.[id], orderId, { timeout: 10000 });
const loc = (await dbOf(d)).riderLocations[orderId];
ok(Math.abs(loc.lat - 30.0626) < 0.001 && Math.abs(loc.lng - 31.344) < 0.001, 'driver location shared on "on the way"');
ok((await d.textContent('.share-live')).includes('العميل شايف مكانك'), 'driver told the customer can see them');

await c.waitForSelector('#riderSlot .map-emoji.rider', { timeout: 10000 });
ok(Boolean(await c.$('#riderSlot .map-emoji.dest')), 'customer map shows rider and home');
ok((await c.textContent('.track-status')).includes('دلوقتي'), 'status: location is fresh');
const pos1 = await c.$eval('#riderSlot .map-emoji.rider', e => e.style.transform);
// المندوب اتحرك (كتابة مباشرة كأن ده التحديث اللي بعده)
await d.evaluate((id) => { const db = JSON.parse(localStorage.getItem('arrivo_demo_db_v3')); db.riderLocations[id] = { lat: 30.066, lng: 31.347, at: Date.now() }; localStorage.setItem('arrivo_demo_db_v3', JSON.stringify(db)); }, orderId);
await c.waitForFunction((p) => document.querySelector('#riderSlot .map-emoji.rider')?.style.transform !== p, pos1, { timeout: 5000 });
ok(true, 'rider marker moves live without reloading the map');
await c.screenshot({ path: `${SP}/live-rider-customer.png` });

// العميل من حساب تاني مايشوفش (الباك إند التجريبي بيحاكي القواعد في الكتابة بس، فبنجرّب الكتابة)
const refused = await c.evaluate(async (id) => {
  const { backend } = await import('/js/backend/index.js');
  try { await backend.shareRiderLocation(id, { lat: 1, lng: 1 }); return false; } catch { return true; }
}, orderId);
ok(refused, 'customer cannot fake the rider location');

await d.waitForSelector(`[data-id="${orderId}"][data-status="delivered"]`); await d.click(`[data-id="${orderId}"][data-status="delivered"]`);
await c.waitForFunction(() => !document.querySelector('#riderSlot'), null, { timeout: 8000 });
ok(true, 'map disappears after delivery');
ok(!(await d.$('.share-live')), 'driver stops sharing after delivery');
console.log('errors', errs);
await b.close();
if (fails.length || errs.length) { console.log('FAILED'); process.exit(1); }
console.log('ALL PASSED');
