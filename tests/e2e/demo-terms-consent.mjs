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
await p.goto(B + '#/register'); await p.waitForSelector('[name=agree]');
await p.fill('[name=name]', 'تجربة'); await p.fill('[name=handle]', 'terms_test'); await p.fill('[name=phone]', '01099998888');
await p.fill('[name=email]', 'terms@test.com'); await p.fill('[name=password]', '123456');
await p.click('#authForm button[type=submit]'); await p.waitForTimeout(600);
console.log('without agree -> still on register:', !!(await p.$('[name=agree]')), '| valid?', await p.$eval('[name=agree]', e => e.validationMessage ? 'browser blocked' : 'ok'));
await p.screenshot({ path: SP + '/terms-register.png', fullPage: true });
await p.check('[name=agree]'); await p.click('#authForm button[type=submit]'); await p.waitForTimeout(600);
console.log('agree only, no transfer -> still on register:', !!(await p.$('[name=agreeTransfer]')));
await p.check('[name=agreeTransfer]'); await p.click('#authForm button[type=submit]'); await p.waitForTimeout(1500);
const u = await p.evaluate(() => Object.values(JSON.parse(localStorage.getItem('arrivo_demo_db_v3')).users).find(x => x.email === 'terms@test.com'));
console.log('after both -> terms saved:', JSON.stringify(u.terms && { version: u.terms.version, transfer: u.terms.transfer }));
// حساب قديم من غير موافقة → شاشة الموافقة
await p.evaluate(() => { const db = JSON.parse(localStorage.getItem('arrivo_demo_db_v3')); const x = Object.values(db.users).find(x => x.email === 'terms@test.com'); delete x.terms; localStorage.setItem('arrivo_demo_db_v3', JSON.stringify(db)); });
await p.reload(); await p.waitForSelector('#termsForm');
console.log('old account -> gate shown ✔');
await p.screenshot({ path: SP + '/terms-gate.png' });
await p.click('#termsForm button[type=submit]'); await p.waitForTimeout(300);
console.log('gate without check stays:', !!(await p.$('#termsForm')));
await p.check('#termsForm [name=agree]'); await p.click('#termsForm button[type=submit]'); await p.waitForTimeout(400);
console.log('gate with only terms -> stays:', !!(await p.$('#termsForm')), '|', await p.textContent('#termsError'));
await p.check('#termsForm [name=agreeTransfer]'); await p.click('#termsForm button[type=submit]'); await p.waitForSelector('.hero', { timeout: 5000 });
console.log('gate accepted -> home ✔');
// صفحة الشروط والخصوصية
for (const pg of ['terms.html', 'privacy.html']) {
  const q = await mk(); await q.goto(B + pg); await q.waitForSelector('.legal');
  console.log(pg, 'sections:', await q.$$eval('.legal h2', x => x.length), '| overflow:', await q.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth));
  await q.screenshot({ path: `${SP}/${pg}.png` });
}
// فورم الانضمام فيه الموافقة
const d = p; await d.goto(B + 'delivery.html'); await d.waitForSelector('#joinForm');
console.log('join form agree link:', await d.$eval('#joinForm .agree', e => e.textContent.replace(/\s+/g, ' ').trim()));
await d.selectOption('[name=vehicle]', { index: 1 }).catch(() => {});
await d.fill('[name=area]', 'مدينة نصر'); await d.check('#joinForm [name=agree]'); await d.click('#joinForm button[type=submit]'); await d.waitForTimeout(800);
const app = await d.evaluate(() => Object.values(JSON.parse(localStorage.getItem('arrivo_demo_db_v3')).applications)[0]);
console.log('application termsVersion:', app?.termsVersion, '| has agree field:', app && 'agree' in app);
console.log('errors', errs); await b.close();
