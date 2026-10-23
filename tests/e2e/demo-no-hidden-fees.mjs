// "مفيش رسوم مخفية" في الرئيسية والسلة والدفع، وسياسة الاسترجاع بنفس طريقة الدفع
import { chromium } from 'playwright';
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const SP = ROOT + '/out';
const B = 'http://127.0.0.1:8765/';
const b = await chromium.launch(); const errs = []; const fails = [];
const ok = (cond, msg) => { console.log(cond ? '✔' : '✘', msg); if (!cond) fails.push(msg); };
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', isMobile: true, hasTouch: true });
await ctx.route(/fonts\.googleapis|tile\.openstreetmap|cdnjs|nominatim/, r => r.abort());
await ctx.route('**/js/firebase-config.js', r => r.fulfill({ contentType: 'application/javascript', body: "export const firebaseConfig = { apiKey: '' }; export const useEmulators = false;" }));
const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
await p.goto(B + '#/'); await p.waitForSelector('.trust-strip');
ok((await p.textContent('.trust-strip')).includes('مفيش رسوم مخفية'), 'home trust strip');
ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal page scroll at 390px');
await p.screenshot({ path: `${SP}/no-hidden-home.png` });
await p.goto(B + '#/restaurant/burger-house'); await p.waitForSelector('[data-add="bh3"]'); await p.click('[data-add="bh3"]'); await p.click('[data-inc="bh3"]');
await p.goto(B + '#/cart'); await p.waitForSelector('#zoneSelect');
ok(!(await p.$('.no-hidden')), 'no "final total" promise before a zone is picked');
await p.selectOption('#zoneSelect', { index: 1 }); await p.waitForSelector('.no-hidden');
ok((await p.textContent('.no-hidden')).includes('الإجمالي النهائي'), 'cart: final total promise after zone');
ok((await p.textContent('.refund-note')).includes('بنفس طريقة الدفع') && await p.getAttribute('.refund-note a', 'href') === 'terms.html#t6', 'cart: refund note links to terms');
await p.goto(B + 'terms.html#t6'); await p.waitForSelector('#t6');
ok((await p.textContent('body')).includes('7 أيام عمل') && (await p.textContent('body')).includes('نفس البطاقة'), 'terms: refund to the same method within 7 working days');
console.log('errors', errs);
await b.close();
if (fails.length || errs.length) { console.log('FAILED'); process.exit(1); }
console.log('ALL PASSED');
