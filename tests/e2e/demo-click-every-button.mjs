// يدوس على كل زرار ظاهر في كل صفحة وتبويب، ويسجل أي خطأ JavaScript
import { chromium } from 'playwright';
const B = 'http://127.0.0.1:8765/';
const W = Number(process.argv[2] || 390);
const b = await chromium.launch(); const errs = []; let clicks = 0;
const ctx = await b.newContext({ viewport: { width: W, height: 844 }, serviceWorkers: 'block', isMobile: W < 800, hasTouch: W < 800 });
await ctx.route(/fonts\.googleapis|tile\.openstreetmap|cdnjs|nominatim/, r => r.abort());
await ctx.route('**/js/firebase-config.js', r => r.fulfill({ contentType: 'application/javascript', body: "export const firebaseConfig = { apiKey: '' }; export const useEmulators = false;" }));
const SKIP = /موظف|خروج|حذف|تسجيل الخروج|تفضية|رفض|حظر|إيقاف المطعم|seed|إضافة المطاعم التجريبية|مش هقدر/;
async function sweep(p, label, setup) {
  await setup();
  await p.waitForTimeout(500);
  const n = await p.$$eval('button, a.btn, [data-tab], .chip, .cat', (els) => els.filter((e) => e.offsetParent && !e.disabled).length);
  for (let i = 0; i < n; i++) {
    try {
      await setup(); await p.waitForTimeout(250);
      const els = await p.$$('button, a.btn, [data-tab], .chip, .cat');
      const vis = []; for (const e of els) if (await e.isVisible() && await e.isEnabled()) vis.push(e);
      const el = vis[i]; if (!el) continue;
      const txt = ((await el.textContent()) || '').trim().replace(/\s+/g, ' ').slice(0, 30);
      if (SKIP.test(txt) || (await el.getAttribute('href') || '').startsWith('http') || (await el.getAttribute('target')) === '_blank') continue;
      await el.click({ timeout: 2000 }); clicks++; await p.waitForTimeout(250);
    } catch (e) { if (!/Timeout|detached|not attached|outside of the viewport|intercepts/.test(e.message)) errs.push(`${label} #${i}: ${e.message.split('\n')[0]}`); }
  }
  console.log(`${label}: ${n} عنصر`);
}
const login = async (p, email) => { await p.waitForSelector('.auth-card'); await p.click(`[data-demo="${email}"]`); await p.click('#authForm button[type=submit]'); };
const page = async (who) => { const p = await ctx.newPage(); p.on('pageerror', e => errs.push(`${who}: ${e.message}`)); p.on('dialog', d => d.accept()); return p; };

try {
// عميل
const c = await page('customer');
await c.goto(B + '#/login'); await login(c, 'customer@demo.com'); await c.waitForSelector('.card');
for (const h of ['#/', '#/offers', '#/restaurant/burger-house', '#/cart', '#/orders', '#/account', '#/support', '#/join']) {
  await sweep(c, 'عميل ' + h, async () => { await c.goto(B + h); await c.waitForTimeout(400); });
}
// السلة والدفع
await c.evaluate(() => localStorage.removeItem('talabaty_cart_v2')); await c.goto(B + '#/'); await c.goto(B + '#/restaurant/burger-house'); await c.waitForSelector('[data-add="bh1"]'); await c.click('[data-add="bh1"]'); await c.click('[data-inc="bh1"]');
await sweep(c, 'عميل السلة بأصناف', async () => { await c.goto(B + '#/cart'); });
await c.goto(B + '#/cart'); await c.waitForSelector('#zoneSelect'); await c.selectOption('#zoneSelect', { index: 1 });
await c.goto(B + '#/checkout'); await c.waitForSelector('#placeBtn'); await c.fill('textarea[name=address]', 'عنوان'); await c.click('#placeBtn'); await c.waitForSelector('.track');
const orderUrl = c.url();
await sweep(c, 'عميل تتبع الطلب', async () => { await c.goto(orderUrl); });
// بحث وفلاتر
await c.goto(B); await c.waitForSelector('#search');
for (const q of ['برجر', 'بيتزا', 'كشري', 'zzz', 'فرا']) { await c.fill('#search', q); await c.waitForTimeout(250); console.log('بحث', q, '→', (await c.textContent('#results .list-head')).trim().replace(/\s+/g, ' ')); }
await c.fill('#search', '');
// لوحات
for (const [file, email, tabs] of [['restaurant.html', 'owner@demo.com', null], ['delivery.html', 'driver@demo.com', null], ['admin.html', 'admin@demo.com', null], ['admin.html', 'staff@demo.com', null]]) {
  const p = await page(email);
  await p.goto(B + file); await login(p, email); await p.waitForSelector('#tabs', { state: 'attached' });
  const keys = await p.$$eval('#tabs [data-tab]', x => x.map(e => e.dataset.tab));
  for (const k of [...keys, 'account']) {
    await sweep(p, `${email.split('@')[0]} ${k}`, async () => {
      await p.goto(B + file); await p.waitForSelector('#tabs', { state: 'attached' }); await p.waitForTimeout(300);
      if (k === 'account') await p.$eval('#accountBtn', e => e.click()); else await p.$eval(`#tabs [data-tab="${k}"]`, e => e.click());
    });
  }
}
} catch (e) { errs.push('STOPPED: ' + e.message.split('\n')[0]); }
console.log(`\n${W}px — ضغطات: ${clicks} — أخطاء: ${errs.length}`);
errs.forEach(e => console.log('❌', e));
await b.close();
