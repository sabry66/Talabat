// الوضع الليلي: بيمشي مع إعداد الموبايل، والاختيار من القايمة بيتحفظ، ومفيش نص صعب يتقرا أو خلفيات بيضا
import { chromium } from 'playwright';
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const SP = ROOT + '/out';
const B = 'http://127.0.0.1:8765/';
const b = await chromium.launch(); const errs = []; const fails = [];
const ok = (cond, msg) => { console.log(cond ? '✔' : '✘', msg); if (!cond) fails.push(msg); };
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', isMobile: true, hasTouch: true, colorScheme: 'dark' });
await ctx.route(/fonts\.googleapis|tile\.openstreetmap|cdnjs|nominatim/, r => r.abort());
await ctx.route('**/js/firebase-config.js', r => r.fulfill({ contentType: 'application/javascript', body: "export const firebaseConfig = { apiKey: '' }; export const useEmulators = false;" }));
const login = async (p, email) => { await p.waitForSelector('.auth-card'); await p.click(`[data-demo="${email}"]`); await p.click('#authForm button[type=submit]'); };
const mk = async () => { const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept()); return p; };

// بيلف على كل النصوص الظاهرة ويحسب التباين مع أقرب خلفية مش شفافة
const audit = (p) => p.evaluate(() => {
  const rgb = (s) => (s.match(/[\d.]+/g) || []).map(Number);
  const lum = ([r, g, bb]) => [r, g, bb].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
  const ratio = (a, c) => { const [x, y] = [lum(a), lum(c)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  const bgOf = (el) => {
    for (let e = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.backgroundImage !== 'none') return null; // تدرج أو صورة: منقدرش نحسب
      const c = rgb(cs.backgroundColor);
      if (c.length >= 3 && (c[3] === undefined || c[3] > 0.5)) {
        // طبقة غامقة فوق لون المطعم (::before): ناخد أفتح نقطة فيها
        const ov = rgb(getComputedStyle(e, '::before').backgroundImage);
        if (ov.length >= 4) { const a = ov[3]; return [0, 1, 2].map((i) => c[i] * (1 - a) + ov[i] * a); }
        return c;
      }
    }
    return rgb(getComputedStyle(document.body).backgroundColor);
  };
  const bad = []; let white = 0;
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || getComputedStyle(el).visibility === 'hidden') continue;
    const cs = getComputedStyle(el);
    const big = r.width > 200 && r.height > 40;
    if (big && cs.backgroundColor === 'rgb(255, 255, 255)' && !el.closest('.card-cover, .rest-header, .item-img, .leaflet-container')) white++;
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && /[\p{L}\p{N}]/u.test(n.textContent)); // الإيموجي لوحده ملوش لون
    if (!own) continue;
    const bg = bgOf(el);
    if (!bg || el.closest('.hero, .offers-hero, .leaflet-container')) continue; // التدرجات والخريطة
    const c = ratio(rgb(cs.color), bg);
    if (c < 3) bad.push(`${el.tagName.toLowerCase()}.${[...el.classList].join('.')} "${el.textContent.trim().slice(0, 25)}" ${c.toFixed(2)}`);
  }
  return { bad: [...new Set(bad)].slice(0, 12), white, bodyBg: getComputedStyle(document.body).backgroundColor };
});

const c = await mk();
await c.goto(B + '#/'); await c.waitForSelector('.card');
let a = await audit(c);
ok(a.bodyBg === 'rgb(15, 14, 23)', 'follows the phone setting (dark) by default');
ok(!a.bad.length, 'home: readable text ' + a.bad.join(' | '));
ok(!a.white, 'home: no big white panels');
await c.screenshot({ path: `${SP}/dark-home.png` });

await c.goto(B + '#/login'); await login(c, 'customer@demo.com'); await c.waitForSelector('.card');
const pages = [['#/restaurant/burger-house', '[data-add="bh3"]'], ['#/offers', '.page-title, h1'], ['#/account', '#addrBook'], ['#/favorites', 'h1'], ['#/support', '#supportBox']];
for (const [h, sel] of pages) {
  await c.goto(B + h); await c.waitForSelector(sel);
  await c.waitForTimeout(200);
  a = await audit(c);
  ok(!a.bad.length && !a.white, `${h}: readable, no white panels ${a.bad.join(' | ')}${a.white ? ' white=' + a.white : ''}`);
}
await c.goto(B + '#/restaurant/burger-house'); await c.waitForSelector('[data-add="bh3"]'); await c.click('[data-add="bh3"]'); await c.click('[data-inc="bh3"]');
await c.goto(B + '#/cart'); await c.waitForSelector('#zoneSelect'); await c.selectOption('#zoneSelect', { index: 1 });
a = await audit(c); ok(!a.bad.length && !a.white, 'cart: readable ' + a.bad.join(' | '));
await c.screenshot({ path: `${SP}/dark-cart.png`, fullPage: true });
await c.goto(B + '#/checkout'); await c.waitForSelector('#placeBtn');
a = await audit(c); ok(!a.bad.length && !a.white, 'checkout: readable ' + a.bad.join(' | '));
await c.fill('textarea[name=address]', 'عنوان'); await c.click('#placeBtn'); await c.waitForSelector('.track');
a = await audit(c); ok(!a.bad.length && !a.white, 'order page: readable ' + a.bad.join(' | '));

for (const [file, email, sel] of [['restaurant.html', 'owner@demo.com', '#tabs'], ['delivery.html', 'driver@demo.com', '#tabs'], ['admin.html', 'admin@demo.com', '#tabs']]) {
  const p = await mk();
  await p.goto(B + file); await login(p, email); await p.waitForSelector(sel, { state: 'attached' }); await p.waitForTimeout(400);
  a = await audit(p); ok(!a.bad.length && !a.white, `${file}: readable ${a.bad.join(' | ')}${a.white ? ' white=' + a.white : ''}`);
  await p.screenshot({ path: `${SP}/dark-${file.replace('.html', '')}.png` });
  await p.close();
}

// الاختيار من القايمة: غامق ← فاتح، وبيتحفظ
await c.goto(B + '#/'); await c.waitForSelector('.card');
await c.click('.drawer-btn, [aria-label="القايمة"]'); await c.waitForSelector('[data-theme-switch]');
ok((await c.textContent('[data-theme-switch]')).includes('تلقائي'), 'drawer shows theme switch (auto)');
await c.click('[data-theme-switch]'); await c.click('[data-theme-switch]');
ok((await c.textContent('[data-theme-switch]')).includes('فاتح') && await c.evaluate(() => document.documentElement.dataset.theme) === 'light', 'switch to light');
await c.reload(); await c.waitForSelector('.card');
ok(await c.evaluate(() => getComputedStyle(document.body).backgroundColor) === 'rgb(247, 247, 247)', 'light choice kept after reload even with a dark phone');
console.log('errors', errs);
await b.close();
if (fails.length || errs.length) { console.log('FAILED'); process.exit(1); }
console.log('ALL PASSED');
