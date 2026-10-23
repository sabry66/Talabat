import { chromium } from 'playwright';
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const SP = ROOT + '/out';
const B = 'http://127.0.0.1:8765/';
const b = await chromium.launch(); const errs = [];
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', isMobile: true, hasTouch: true });
await ctx.route(/fonts\.googleapis|tile\.openstreetmap|cdnjs/, r => r.abort());
await ctx.route('**/js/firebase-config.js', r => r.fulfill({ contentType: 'application/javascript', body: "export const firebaseConfig = { apiKey: '' }; export const useEmulators = false;" }));
const mk = async () => { const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); return p; };
let p = await mk();
await p.goto(B); await p.waitForSelector('.join-section');
await p.$eval('.join-section', e => e.scrollIntoView()); await p.waitForTimeout(300);
await p.screenshot({ path: SP + '/join-home.png' });
console.log('home join links:', await p.$$eval('.join-card', x => x.map(a => a.getAttribute('href'))));
await p.click('#menuBtn'); await p.waitForTimeout(400);
console.log('drawer:', (await p.$$eval('.drawer-body > *', x => x.map(e => e.textContent.trim()))).join(' | '));
await p.screenshot({ path: SP + '/join-drawer.png' });
await p.click('.drawer-item >> text=سجّل مطعمك'); await p.waitForSelector('.auth-card');
console.log('restaurant.html?join=1 ->', await p.$eval('.auth-tabs .active', e => e.textContent), '| has name field:', !!(await p.$('[name=name]')));
await p.goto(B + 'delivery.html?join=1'); await p.waitForSelector('.auth-card');
console.log('delivery.html?join=1 ->', await p.$eval('.auth-tabs .active', e => e.textContent));
await p.goto(B + '#/join'); await p.waitForSelector('.join-section'); console.log('#/join ok');
// تسجيل جديد كمندوب من الموقع الرئيسي
await p.goto(B + '#/register'); await p.waitForSelector('.role-pick');
await p.waitForTimeout(600); await p.screenshot({ path: SP + '/join-register.png' });
await p.click('.role-opt:has([value=driver])');
await p.fill('[name=name]', 'مندوب جديد'); await p.fill('[name=handle]', 'new_driver1'); await p.fill('[name=phone]', '01012345678');
await p.fill('[name=email]', 'newdriver@test.com'); await p.fill('[name=password]', '123456'); await p.check('[name=agree]'); await p.check('[name=agreeTransfer]');
await p.click('#authForm button[type=submit]'); await p.waitForURL(/delivery\.html/); await p.waitForTimeout(1200);
console.log('after driver signup ->', new URL(p.url()).pathname, '| join form:', (await p.textContent('#app')).replace(/\s+/g, ' ').slice(90, 220));
// تسجيل كعميل عادي يفضل في الرئيسية
p = await mk(); await p.goto(B + '#/register'); await p.waitForSelector('.role-pick');
await p.fill('[name=name]', 'عميل جديد'); await p.fill('[name=handle]', 'new_cust1'); await p.fill('[name=phone]', '01112345678');
await p.fill('[name=email]', 'newcust@test.com'); await p.fill('[name=password]', '123456'); await p.check('[name=agree]'); await p.check('[name=agreeTransfer]');
await p.click('#authForm button[type=submit]'); await p.waitForTimeout(1500);
console.log('after customer signup ->', new URL(p.url()).pathname + new URL(p.url()).hash);
// من صفحة الطلب: من غير سؤال
await p.goto(B + '#/login/checkout'); await p.waitForTimeout(300);
console.log('errors:', errs); await b.close();
