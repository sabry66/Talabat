// الدخول بالموبايل: الرقم بيتربط من "حسابي" بكود، وبعدها الدخول بكود من غير كلمة السر (الوضع التجريبي: الكود 123456)
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
const mk = async () => { const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept()); return p; };
const phoneStep = async (p, root, phone) => { await p.fill(`${root} [name=phone]`, phone); await p.click(`${root} .phone-form button[type=submit]`); await p.waitForSelector(`${root} [name=code]`); };
const codeStep = async (p, root, code) => { await p.fill(`${root} [name=code]`, code); await p.click(`${root} .phone-form button[type=submit]`); await p.waitForTimeout(300); };

const c = await mk();
await c.goto(B + '#/login'); await c.waitForSelector('.auth-card');
ok(Boolean(await c.$('[data-mode="phone"]')), 'login has a "by mobile" tab');
await c.click('[data-mode="phone"]'); await c.waitForSelector('#phoneLogin .phone-form');
await phoneStep(c, '#phoneLogin', '01000000003');
await codeStep(c, '#phoneLogin', '123456');
ok((await c.textContent('#phoneLogin .form-error')).includes('مش متفعّل'), 'unlinked number is refused with a hint');
await c.screenshot({ path: `${SP}/phone-login.png` });

// يدخل بالإيميل ويفعّل
await c.click('[data-mode="login"]'); await login(c, 'customer@demo.com'); await c.waitForSelector('.card');
await c.goto(B + '#/account'); await c.waitForSelector('#phoneLinkBox [data-start-link]');
await c.click('#phoneLinkBox [data-start-link]');
ok(await c.inputValue('#phoneLinkBox [name=phone]') === '01000000003', 'account phone prefilled');
await c.click('#phoneLinkBox .phone-form button[type=submit]'); await c.waitForSelector('#phoneLinkBox [name=code]');
await codeStep(c, '#phoneLinkBox', '000000');
ok((await c.textContent('#phoneLinkBox .form-error')).includes('الكود غلط'), 'wrong code refused');
await codeStep(c, '#phoneLinkBox', '123456');
await c.waitForSelector('#phoneLinkBox .ok-text');
ok((await c.textContent('#phoneLinkBox')).includes('01000000003'), 'linked: shows the number');

// خروج ودخول بالموبايل
await c.click('#logout'); await c.goto(B + '#/login'); await c.waitForSelector('[data-mode="phone"]');
await c.click('[data-mode="phone"]'); await c.waitForSelector('#phoneLogin .phone-form');
await phoneStep(c, '#phoneLogin', '٠١٠٠٠٠٠٠٠٠٣'); // أرقام عربي
await codeStep(c, '#phoneLogin', '123456');
await c.waitForFunction(() => !location.hash.startsWith('#/login'), null, { timeout: 5000 });
ok((await c.textContent('#userNav')).includes('عميل'), 'logged in with the code (Arabic digits work)');

// مندوب يحاول يربط نفس الرقم
const d = await mk();
await d.goto(B + 'delivery.html'); await login(d, 'driver@demo.com'); await d.waitForSelector('#tabs', { state: 'attached' });
await d.$eval('#accountBtn', e => e.click()); await d.waitForSelector('#phoneLinkBox [data-start-link]');
ok(true, 'driver account panel has the mobile login box');
await d.click('#phoneLinkBox [data-start-link]');
await d.fill('#phoneLinkBox [name=phone]', '01000000003'); await d.click('#phoneLinkBox .phone-form button[type=submit]');
await d.waitForSelector('#phoneLinkBox .form-error:not([hidden])');
ok((await d.textContent('#phoneLinkBox .form-error')).includes('مربوط بحساب تاني'), 'same number cannot be linked to another account');
console.log('errors', errs);
await b.close();
if (fails.length || errs.length) { console.log('FAILED'); process.exit(1); }
console.log('ALL PASSED');
