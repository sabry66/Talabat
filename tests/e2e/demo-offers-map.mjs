import { chromium } from 'playwright';
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const SP = ROOT + '/out';
const LF = ROOT + '/node_modules/leaflet/dist/';
const B = 'http://127.0.0.1:8765/';
const b = await chromium.launch(); const errs = [];
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', isMobile: true, hasTouch: true });
await ctx.route(/fonts\.googleapis|tile\.openstreetmap/, r => r.abort());
await ctx.route(/cdnjs.*leaflet\.min\.js/, r => r.fulfill({ path: LF + 'leaflet.js', contentType: 'application/javascript' }));
await ctx.route(/cdnjs.*leaflet\.min\.css/, r => r.fulfill({ path: LF + 'leaflet.css', contentType: 'text/css' }));
await ctx.route(/nominatim.*reverse/, r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ address: { road: 'شارع عباس العقاد', suburb: 'مدينة نصر', city: 'القاهرة' } }) }));
await ctx.route(/nominatim.*search/, r => r.fulfill({ contentType: 'application/json', body: JSON.stringify([{ display_name: 'مدينة نصر، القاهرة', lat: '30.0561', lon: '31.3301' }]) }));
await ctx.route('**/js/firebase-config.js', r => r.fulfill({ contentType: 'application/javascript', body: "export const firebaseConfig = { apiKey: '' }; export const useEmulators = false;" }));
const login = async (p, email) => { await p.waitForSelector('.auth-card'); await p.click(`[data-demo="${email}"]`); await p.click('#authForm button[type=submit]'); };
const mk = async () => { const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && !/ERR_FAILED|Failed to load resource/.test(m.text()) && errs.push('console: ' + m.text())); p.on('dialog', d => { console.log('  dialog:', d.message()); d.accept(); }); return p; };

// صاحب المطعم: خصم 20% على أول صنف + سعر جديد على التاني + عرض عام
const o = await mk();
await o.goto(B + 'restaurant.html'); await login(o, 'owner@demo.com'); await o.waitForSelector('#tabs', { state: 'attached' });
await o.$eval('[data-tab="offers"]', e => e.click()); await o.waitForSelector('.offer-row');
const rows = await o.$$('.offer-row');
await rows[0].$eval('[data-k=value]', e => { e.value = '20'; e.dispatchEvent(new Event('input')); });
console.log('preview:', await rows[0].$eval('.offer-preview', e => e.textContent));
await rows[0].$eval('[data-apply]', e => e.click()); await o.waitForTimeout(400);
let r2 = (await o.$$('.offer-row'))[1];
await (await r2.$('[data-k=type]')).selectOption('price'); await (await r2.$('[data-k=value]')).fill('9999'); await r2.$eval('[data-apply]', e => e.click()); await o.waitForTimeout(300);
console.log('too-high price toast:', await o.textContent('#toast'));
r2 = (await o.$$('.offer-row'))[1];
await (await r2.$('[data-k=type]')).selectOption('price'); await (await r2.$('[data-k=value]')).fill('50'); await r2.$eval('[data-apply]', e => e.click()); await o.waitForTimeout(400);
await o.fill('#promoText', 'توصيل مجاني النهارده'); await o.click('#promoForm button[type=submit]'); await o.waitForTimeout(400);
console.log('running offers:', await o.$$eval('.offer-row.on b', x => x.map(e => e.textContent)));
await o.screenshot({ path: SP + '/offers-tab.png', fullPage: true });

// العميل: الرئيسية فيها شريط العروض
const c = await mk();
await c.goto(B + '#/login'); await login(c, 'customer@demo.com'); await c.waitForSelector('.card');
await c.goto(B + '#/'); await c.waitForSelector('.deals-strip');
console.log('home deals:', await c.$$eval('.deals-strip .item-card', x => x.map(e => e.querySelector('b').textContent + ' ' + e.querySelector('.price-line').textContent.replace(/\s+/g, ' '))));
await c.screenshot({ path: SP + '/home-deals.png' });
await c.goto(B + '#/offers'); await c.waitForSelector('.item-grid');
await c.screenshot({ path: SP + '/offers-page.png', fullPage: true });
await c.click('.item-grid [data-quick-add]'); await c.waitForTimeout(300);
await c.goto(B + '#/cart'); await c.waitForSelector('.cart-line');
console.log('cart line:', (await c.textContent('.cart-line')).replace(/\s+/g, ' '));
await c.click('[data-inc]'); await c.waitForTimeout(150); await c.click('[data-inc]'); await c.waitForTimeout(150); await c.selectOption('#zoneSelect', { index: 1 }).catch(() => {}); console.log('url', c.url());
await c.goto(B + '#/checkout'); await c.waitForTimeout(1500); await c.waitForSelector('.picker-status');
console.log('map status before:', await c.textContent('.picker-status'));
// سحب الخريطة
const box = await c.$('.picker-map'); const bb = await box.boundingBox();
await c.mouse.move(bb.x + 150, bb.y + 150); await c.mouse.down(); await c.mouse.move(bb.x + 100, bb.y + 120, { steps: 8 }); await c.mouse.up(); await c.waitForTimeout(1200);
console.log('map status after drag:', (await c.textContent('.picker-status')).replace(/\s+/g, ' '));
// البحث
await c.fill('.picker-search input', 'مدينة نصر'); await c.press('.picker-search input', 'Enter'); await c.waitForSelector('.picker-results button');
await c.click('.picker-results button'); await c.waitForTimeout(1200);
// تكبير
await c.click('[data-full]'); await c.waitForTimeout(300); await c.screenshot({ path: SP + '/map-full.png' });
await c.click('.picker-done'); await c.waitForTimeout(200);
await c.screenshot({ path: SP + '/map-checkout.png' });
await c.fill('textarea[name=address]', 'مدينة نصر'); await c.click('#placeBtn'); await c.waitForSelector('.track');
const order = await c.evaluate(() => { const db = JSON.parse(localStorage.getItem('arrivo_demo_db_v3')); const os = Object.values(db.orders || {}); const x = os[os.length - 1] || db.orders.at?.(-1); return x; });
console.log('order lines:', JSON.stringify(order.lines), 'location:', JSON.stringify(order.location));

// المنيو: حذف صنف وحالة الخريطة
await o.$eval('[data-tab="menu"]', e => e.click()); await o.waitForSelector('.picker-status');
await o.waitForTimeout(500);
console.log('rest map status:', (await o.textContent('#restMap .picker-status')).replace(/\s+/g, ' '));
const before = await o.$$eval('.edit-item', x => x.length);
await o.click('[data-del-item="0:0"]'); await o.waitForTimeout(300);
console.log('items', before, '->', await o.$$eval('.edit-item', x => x.length));
await o.$eval('#restMap', e => e.scrollIntoView({block:'center'})); await o.waitForTimeout(200); const mb = await (await o.$('#restMap .picker-map')).boundingBox();
await o.mouse.move(mb.x + 150, mb.y + 150); await o.mouse.down(); await o.mouse.move(mb.x + 120, mb.y + 100, { steps: 8 }); await o.mouse.up(); await o.waitForTimeout(900);
console.log('rest map after move:', (await o.textContent('#restMap .picker-status')).replace(/\s+/g, ' '));
await o.click('#editorForm button[type=submit]'); await o.waitForTimeout(600);
console.log('rest map after save:', (await o.textContent('#restMap .picker-status')).replace(/\s+/g, ' '));
await o.screenshot({ path: SP + '/rest-map.png' });
console.log('errors:', errs); await b.close();
