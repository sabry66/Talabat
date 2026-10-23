// المفضلة: القلب على المطعم، صفحة المفضلة، شريط الرئيسية، والحفظ في الحساب
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
const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
const favs = () => p.evaluate(() => { const d = JSON.parse(localStorage.getItem('arrivo_demo_db_v3')); return Object.values(d.users).find(u => u.email === 'customer@demo.com').favorites || []; });

// زائر من غير حساب: القلب بيوديه للدخول
await p.goto(B + '#/'); await p.waitForSelector('.grid .card .fav-btn');
await p.click('.grid .card .fav-btn');
await p.waitForTimeout(300);
ok(p.url().includes('#/login/favorites'), 'guest heart -> login page');

await login(p, 'customer@demo.com');
await p.waitForSelector('h1.page-title');
ok(await p.textContent('h1.page-title') === '❤️ المفضلة', 'after login lands on favorites page');
ok(Boolean(await p.$('.empty-state')), 'empty state shown when no favorites');

await p.goto(B + '#/'); await p.waitForSelector('.grid .card .fav-btn');
ok(!(await p.$('.fav-strip')), 'no favorites strip yet');
const first = await p.$eval('.grid .card', a => a.getAttribute('href').split('/').pop());
const url0 = p.url();
await p.click(`.grid .card [data-fav="${first}"]`);
await p.waitForTimeout(400);
ok(p.url() === url0, 'heart click does not open the restaurant');
ok(await p.$eval(`.grid .card [data-fav="${first}"]`, b => b.classList.contains('on') && b.getAttribute('aria-pressed') === 'true'), 'heart turns on');
ok((await favs()).includes(first), 'saved in the account');
ok(Boolean(await p.$(`.fav-strip a[href="#/restaurant/${first}"]`)), 'home strip shows the favorite');
await p.screenshot({ path: `${SP}/favorites-home.png` });

// من صفحة المطعم
await p.goto(B + '#/restaurant/pizza-roma'); await p.waitForSelector('.rest-header .fav-btn');
await p.click('.rest-header .fav-btn'); await p.waitForTimeout(400);
ok((await favs()).includes('pizza-roma'), 'heart on restaurant page saves too');

await p.reload(); await p.waitForSelector('.rest-header .fav-btn');
ok(await p.$eval('.rest-header .fav-btn', b => b.classList.contains('on')), 'heart stays on after reload');

await p.goto(B + '#/favorites'); await p.waitForSelector('.grid .card');
const shown = await p.$$eval('.grid .card', a => a.map(x => x.getAttribute('href').split('/').pop()));
ok(shown.length === 2 && shown.includes(first) && shown.includes('pizza-roma'), 'favorites page lists both: ' + shown.join(','));
await p.screenshot({ path: `${SP}/favorites-page.png`, fullPage: true });

await p.click(`.grid .card [data-fav="${first}"]`); await p.waitForTimeout(400);
ok((await p.$$('.grid .card')).length === 1 && !(await favs()).includes(first), 'removing from favorites page updates list and account');

// الأدمن يقفل المطعم: يختفي من المفضلة
await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('arrivo_demo_db_v3')); d.restaurants['pizza-roma'].blocked = true; localStorage.setItem('arrivo_demo_db_v3', JSON.stringify(d)); });
await p.reload(); await p.waitForSelector('h1.page-title');
ok(Boolean(await p.$('.empty-state')), 'blocked restaurant hidden from favorites');

ok(await p.evaluate(() => [...document.querySelectorAll('#userNav a')].some(a => a.getAttribute('href') === '#/favorites')), 'favorites link in the header/drawer');
console.log('errors', errs);
await b.close();
if (fails.length || errs.length) { console.log('FAILED'); process.exit(1); }
console.log('ALL PASSED');
