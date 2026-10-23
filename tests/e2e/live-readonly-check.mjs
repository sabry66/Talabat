import { chromium } from 'playwright';
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const SP = ROOT + '/out/live';
const B = 'https://arrivo-932e4.web.app/';
const b = await chromium.launch({ proxy: { server: 'http://127.0.0.1:36509' } });
const issues = []; const log = (...a) => console.log(...a);
for (const W of [390, 1280]) {
  const ctx = await b.newContext({ viewport: { width: W, height: 844 }, isMobile: W < 800, hasTouch: W < 800, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  p.on('pageerror', e => issues.push(`${W} pageerror: ${e.message}`));
  p.on('console', m => m.type() === 'error' && issues.push(`${W} console: ${m.text().slice(0, 200)}`));
  p.on('requestfailed', r => !/tile\.openstreetmap|favicon/.test(r.url()) && issues.push(`${W} failed: ${r.url().slice(0, 120)} ${r.failure()?.errorText}`));
  p.on('response', r => r.status() >= 400 && issues.push(`${W} HTTP ${r.status()}: ${r.url().slice(0, 120)}`));
  const ov = async (name) => { const o = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); if (o > 0) issues.push(`${W} overflow ${o}px on ${name}`); };
  const t0 = Date.now(); await p.goto(B); await p.waitForSelector('.card, .empty', { timeout: 30000 });
  log(`\n===== ${W}px =====`); log('home loaded in', Date.now() - t0, 'ms');
  await p.waitForTimeout(1500);
  const info = await p.evaluate(() => ({
    demo: !!document.querySelector('.demo-banner, .demo'), restaurants: document.querySelectorAll('.grid .card').length,
    deals: document.querySelectorAll('.deals-strip .item-card').length, join: !!document.querySelector('.join-section'),
    footer: document.querySelector('.footer')?.textContent.replace(/\s+/g, ' ').trim(), cats: document.querySelectorAll('.cat').length,
    names: [...document.querySelectorAll('.grid .card h3')].map(e => e.textContent),
  }));
  log(JSON.stringify(info, null, 1));
  await p.screenshot({ path: `${SP}/${W}-home.png` }); await ov('home');
  // التصنيفات
  for (const c of await p.$$eval('.cat', x => x.map(e => e.dataset.cat))) { await p.click(`.cat[data-cat="${c}"]`); await p.waitForTimeout(200); log('cat', c, '→', (await p.textContent('#results .list-head:last-of-type, #results')).match(/(\d+) مطعم/)?.[1]); }
  await p.click('.cat[data-cat="all"]');
  // البحث
  for (const q of ['برجر', 'بيتزا', 'شاورما', 'فراخ', 'xyz123']) { await p.fill('#search', q); await p.waitForTimeout(300); log('search', q, '→', (await p.textContent('#results')).match(/(\d+) صنف/)?.[0] || '-', '|', (await p.textContent('#results')).match(/(\d+) مطعم/)?.[0]); }
  await p.fill('#search', '');
  // الفلاتر
  await p.click('#toggleFilters'); await p.waitForTimeout(200);
  for (const f of ['openOnly', 'promoOnly', 'topRated']) { await p.check(`[data-filter="${f}"]`); await p.waitForTimeout(200); log('filter', f, '→', (await p.textContent('#results')).match(/(\d+) مطعم/)?.[0]); await p.uncheck(`[data-filter="${f}"]`); }
  await p.fill('[data-filter="priceMax"]', '50'); await p.waitForTimeout(300); log('price ≤50 →', (await p.textContent('#results')).match(/(\d+) صنف/)?.[0]);
  await p.click('#clearFilters');
  // المطاعم
  const links = await p.$$eval('.grid .card', x => x.map(a => a.getAttribute('href')));
  for (const h of links) {
    await p.goto(B + h); await p.waitForSelector('.rest-header'); await p.waitForTimeout(300);
    const r = await p.evaluate(() => ({ name: document.querySelector('.rest-header h1')?.textContent, items: document.querySelectorAll('.item').length, closed: !!document.querySelector('.warn'), imgs: [...document.querySelectorAll('.item img, .rest-emoji img')].filter(i => i.complete && i.naturalWidth === 0).length }));
    log('restaurant', JSON.stringify(r)); if (r.imgs) issues.push(`${W} broken images on ${r.name}: ${r.imgs}`);
    await ov(h);
  }
  if (links[0]) {
    await p.goto(B + links[0]); await p.waitForSelector('.rest-header');
    await p.fill('#menuSearch', 'a'); await p.selectOption('#menuSort', 'price_low'); await p.waitForTimeout(300); await p.selectOption('#menuSort', 'default'); await p.fill('#menuSearch', '');
    const add = await p.$('[data-add]:not([disabled])');
    if (add) {
      await add.click(); await p.waitForTimeout(300);
      await p.goto(B + '#/cart'); await p.waitForSelector('.page-title'); await p.waitForTimeout(800);
      const cart = await p.evaluate(() => ({ lines: document.querySelectorAll('.cart-line').length, zones: [...document.querySelectorAll('#zoneSelect option')].map(o => o.textContent).filter(Boolean), coupon: !!document.querySelector('#promoInput'), hint: document.body.textContent.includes('جرّب') }));
      log('cart', JSON.stringify(cart)); await p.screenshot({ path: `${SP}/${W}-cart.png`, fullPage: true }); await ov('cart');
      if (cart.coupon) { await p.fill('#promoInput', 'NOTAREALCODE'); await p.click('#promoForm button'); await p.waitForTimeout(1500); log('fake coupon →', await p.textContent('#toast')); }
      await p.goto(B + '#/checkout'); await p.waitForTimeout(1000); log('guest checkout →', p.url().replace(B, ''));
      await p.evaluate(() => localStorage.removeItem('talabaty_cart_v2'));
    } else log('no open restaurant to add from');
  }
  for (const h of ['#/offers', '#/join', '#/register', '#/login']) { await p.goto(B + h); await p.waitForTimeout(800); await ov(h); log(h, 'ok', (await p.textContent('#app')).replace(/\s+/g, ' ').slice(0, 70)); }
  await p.goto(B + '#/register'); await p.waitForSelector('[name=agree]'); log('register consent boxes:', await p.$$eval('.check.agree', x => x.length), '| role pick:', !!(await p.$('.role-pick')));
  await p.screenshot({ path: `${SP}/${W}-register.png`, fullPage: true });
  for (const f of ['terms.html', 'privacy.html', 'restaurant.html', 'delivery.html', 'admin.html', 'restaurant.html?join=1', 'join/restaurant', 'join/driver', 'join']) {
    await p.goto(B + f); await p.waitForTimeout(1200); await ov(f);
    log(f.padEnd(22), '→', p.url().replace(B, '').padEnd(24), (await p.textContent('h1, h2, .auth-tabs .active').catch(() => '')).trim().slice(0, 40));
  }
  if (W < 800) { await p.goto(B); await p.waitForSelector('#menuBtn'); await p.click('#menuBtn'); await p.waitForTimeout(400); log('drawer:', (await p.$$eval('.drawer-item', x => x.map(e => e.textContent.trim()))).join(' | ')); await p.screenshot({ path: `${SP}/${W}-drawer.png` }); }
  await ctx.close();
}
// نسخة الموقع المرفوعة: هل آخر التعديلات موجودة؟
const ctx = await b.newContext(); const p = await ctx.newPage();
for (const [f, needle] of [['privacy.html', 'بلجيكا'], ['js/admin-coupons.js', 'خلصت أو انتهت'], ['js/ui.js', 'agreeTransfer'], ['js/delivery.js', 'maxOrders']]) {
  const r = await p.goto(B + f); const txt = await r.text(); log('deployed', f, txt.includes(needle) ? '✅ latest' : '❌ OLD VERSION');
}
log('\nISSUES:', issues.length); [...new Set(issues)].forEach(i => log(' -', i));
await b.close();
