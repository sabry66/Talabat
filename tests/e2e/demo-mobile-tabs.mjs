import { chromium } from 'playwright';
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const SP = ROOT + '/out';
const B = 'http://127.0.0.1:8765/';
const b = await chromium.launch(); const errs = [];
for (const w of [390, 1280]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 844 }, serviceWorkers: 'block', isMobile: w < 800, hasTouch: w < 800 });
  await ctx.route(/fonts\.googleapis|cdnjs|tile\.openstreetmap/, r => r.abort());
  await ctx.route('**/js/firebase-config.js', r => r.fulfill({ contentType: 'application/javascript', body: "export const firebaseConfig = { apiKey: '' }; export const useEmulators = false;" }));
  for (const [page, email, target, sel] of [['admin.html','admin@demo.com','الحسابات','.formula'],['restaurant.html','owner@demo.com','المنيو','#menuForm, .menu-editor, form'],['delivery.html','driver@demo.com','الدعم','main']]) {
    const p = await ctx.newPage(); p.on('pageerror', e => errs.push(page + ': ' + e.message)); p.on('dialog', d => d.accept());
    await p.goto(B + page); await p.waitForSelector('.auth-card'); await p.click(`[data-demo="${email}"]`); await p.click('#authForm button[type=submit]');
    await p.waitForSelector('#tabs', { state: 'attached' }); await p.waitForTimeout(500);
    const info = await p.evaluate(() => ({ tabsVisible: getComputedStyle(document.getElementById('tabs')).display !== 'none', title: document.getElementById('sectionTitle')?.offsetParent ? document.getElementById('sectionTitle').textContent.trim() : null, badge: document.querySelector('.menu-badge')?.hidden === false ? document.querySelector('.menu-badge').textContent : null }));
    console.log(w, page, JSON.stringify(info));
    await p.screenshot({ path: `${SP}/tabs-${w}-${page}.png` });
    if (w < 800) {
      await p.click('#sectionTitle'); await p.waitForTimeout(400);
      await p.click(`.drawer-item >> text=${target}`); await p.waitForTimeout(500);
      console.log('  after drawer ->', await p.textContent('#sectionTitle'));
    }
  }
  await ctx.close();
}
console.log('errors:', errs); await b.close();
