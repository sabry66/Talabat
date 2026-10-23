import { chromium } from 'playwright';
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const SP = ROOT + '/out';
const B = 'http://127.0.0.1:8765/';
const b = await chromium.launch(); const errs = [];
async function ctxFor(width, height) {
  const ctx = await b.newContext({ viewport: { width, height }, serviceWorkers: 'block', isMobile: width < 800, hasTouch: width < 800, deviceScaleFactor: 1 });
  await ctx.route(/fonts\.googleapis|cdnjs|tile\.openstreetmap/, r => r.abort());
  await ctx.route('**/js/firebase-config.js', r => r.fulfill({ contentType: 'application/javascript', body: "export const firebaseConfig = { apiKey: '' }; export const useEmulators = false;" }));
  await ctx.route('**/js/cloudinary-config.js', r => r.fulfill({ contentType: 'application/javascript', body: "export const cloudinaryConfig = { cloudName: '', uploadPreset: '' };" }));
  return ctx;
}
const overflow = (p) => p.evaluate(() => {
  const w = document.documentElement.clientWidth;
  const bad = [...document.querySelectorAll('body *')].filter((el) => {
    if (el.closest('.table-wrap, .cats, .tabs, .sections-nav, .drawer, .mobile-cart-bar, .messages, .leaflet-container')) return false;
    const r = el.getBoundingClientRect(); return r.width > 0 && (r.right > w + 1 || r.left < -1);
  }).slice(0, 3).map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`);
  return { scroll: document.documentElement.scrollWidth - w, bad };
});
const login = async (p, email) => { await p.waitForSelector('.auth-card'); await p.click(`[data-demo="${email}"]`); await p.click('#authForm button[type=submit]'); };
for (const [w, h] of [[360, 740], [390, 844], [768, 1024], [1280, 860]]) {
  const ctx = await ctxFor(w, h); const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(`${w}: ${e.message}`)); p.on('dialog', d => d.accept());
  const shot = async (name) => { const o = await overflow(p); console.log(`${w}px ${name.padEnd(14)} overflow=${o.scroll}px ${o.bad.join(' ')}`); await p.screenshot({ path: `${SP}/${w}-${name}.png`, fullPage: false }); };
  await p.goto(B); await p.waitForSelector('.card'); await shot('home');
  await p.goto(B + '#/login'); await login(p, 'customer@demo.com'); await p.waitForSelector('.card');
  await p.goto(B + '#/restaurant/burger-house'); await p.waitForSelector('[data-add="bh3"]'); await p.click('[data-add="bh3"]'); await p.click('[data-add="bh2"]'); await p.waitForTimeout(350); await shot('restaurant');
  if (w < 800) { await p.click('#menuBtn'); await p.waitForTimeout(400); await shot('drawer'); await p.click('.drawer-backdrop', { position: { x: 10, y: 300 } }); await p.waitForTimeout(300); }
  await p.goto(B + '#/cart'); await p.waitForSelector('#zoneSelect'); await p.selectOption('#zoneSelect', 'nasr_city'); await shot('cart');
  await p.goto(B + '#/checkout'); await p.waitForSelector('#checkoutForm'); await p.fill('textarea[name=address]', 'مدينة نصر'); await p.click('#placeBtn'); await p.waitForSelector('.track'); await p.waitForTimeout(300); await shot('order');
  await p.goto(B + '#/account'); await p.waitForSelector('#passwordForm'); await shot('account');
  const o = await ctx.newPage(); o.on('pageerror', e => errs.push(`${w} owner: ${e.message}`)); o.on('dialog', d => d.accept());
  await o.goto(B + 'restaurant.html'); await login(o, 'owner@demo.com'); await o.waitForSelector('.order-card');
  { const x = await overflow(o); console.log(`${w}px restaurant-dash  overflow=${x.scroll}px ${x.bad.join(' ')}`); await o.screenshot({ path: `${SP}/${w}-rdash.png` }); }
  console.log('menu badge:', await o.$eval('.menu-badge', (e) => e.hidden ? 'hidden' : e.textContent)); await o.click('[data-status="preparing"]');
  const d = await ctx.newPage(); d.on('pageerror', e => errs.push(`${w} driver: ${e.message}`));
  await d.goto(B + 'delivery.html'); await login(d, 'driver@demo.com'); await d.waitForSelector('[data-claim]');
  { const x = await overflow(d); console.log(`${w}px driver         overflow=${x.scroll}px ${x.bad.join(' ')}`); await d.screenshot({ path: `${SP}/${w}-driver.png` }); }
  const a = await ctx.newPage(); a.on('pageerror', e => errs.push(`${w} admin: ${e.message}`)); a.on('dialog', d => d.accept());
  await a.goto(B + 'admin.html'); await login(a, 'admin@demo.com'); await a.waitForSelector('.stats');
  { const x = await overflow(a); console.log(`${w}px admin          overflow=${x.scroll}px ${x.bad.join(' ')}`); await a.screenshot({ path: `${SP}/${w}-admin.png` }); }
  if (w < 800) { await a.click('#menuBtn'); await a.waitForTimeout(400); await a.screenshot({ path: `${SP}/${w}-admin-drawer.png` }); await a.click('.drawer-item >> text=الحسابات'); await a.waitForSelector('.formula'); console.log(`${w}px drawer -> finance tab ✔`); }
  await a.$eval('[data-tab="zones"]', (e) => e.click()); await a.waitForSelector('#settingsForm');
  { const x = await overflow(a); console.log(`${w}px admin-zones    overflow=${x.scroll}px ${x.bad.join(' ')}`); }
  await ctx.close();
}
// --- كل واحد في لوحته ---
{
  const ctx = await ctxFor(390, 844);
  const go = async (email, start) => { const p = await ctx.newPage(); p.on('pageerror', e => errs.push('redir: ' + e.message)); await p.goto(B + start); await login(p, email); await p.waitForTimeout(1500); return p; };
  let p = await go('owner@demo.com', '#/login'); console.log('owner logs in on main site ->', new URL(p.url()).pathname);
  await p.goto(B); await p.waitForTimeout(1200); console.log('owner opens main site again ->', new URL(p.url()).pathname);
  await p.click('#menuBtn'); await p.waitForTimeout(300); console.log('owner drawer items:', (await p.$$eval('.drawer-item', (x) => x.map((e) => e.textContent.trim()))).join(' | '));
  await p.click('.drawer-item >> text=حسابي'); await p.waitForSelector('#passwordForm'); console.log('owner account page inside panel ✔', new URL(p.url()).pathname);
  await p.screenshot({ path: `${SP}/390-owner-account.png` });
  p = await go('driver@demo.com', 'restaurant.html'); console.log('driver opens restaurant page ->', new URL(p.url()).pathname);
  p = await go('staff@demo.com', '#/login'); console.log('staff logs in on main site ->', new URL(p.url()).pathname, '| tabs:', (await p.textContent('#tabs')).replace(/\s+/g, ' ').trim());
  p = await go('admin@demo.com', '#/login'); await p.goto(B + '#/'); await p.waitForTimeout(800); console.log('admin can still browse main site ->', new URL(p.url()).pathname + new URL(p.url()).hash);
  await ctx.close();
}
console.log('errors', errs);
await b.close();
