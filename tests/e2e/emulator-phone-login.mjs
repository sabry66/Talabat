// الدخول بالموبايل على Firebase Auth Emulator (كود حقيقي من الـ Emulator): ربط الرقم من "حسابي"، والدخول بيه، ورقم مش مربوط بيترفض من غير ما يعمل حساب
import { chromium } from 'playwright';
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const SP = ROOT + '/out';
const B = 'http://127.0.0.1:8765/', PROJECT = 'demo-talabaty', FB = 'https://www.gstatic.com/firebasejs/10.12.2/';
const cfg = `export const firebaseConfig = { apiKey: 'demo-key', authDomain: '${PROJECT}.firebaseapp.com', projectId: '${PROJECT}', appId: 'demo' }; export const useEmulators = true; export const phoneLogin = true;`;
const b = await chromium.launch(); const errs = []; const fails = [];
const ok = (cond, msg) => { console.log(cond ? '✔' : '✘', msg); if (!cond) fails.push(msg); };
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
await ctx.route(/fonts\.googleapis|cdnjs|tile\.openstreetmap|www\.google\.com\/recaptcha/, r => r.abort());
await ctx.route(FB + '*', r => r.fulfill({ path: `${ROOT}/node_modules/firebase/${r.request().url().split('/').pop()}`, contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' } }));
await ctx.route('**/js/firebase-config.js', r => r.fulfill({ body: cfg, contentType: 'application/javascript' }));
const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
const lastCode = async () => {
  const r = await (await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${PROJECT}/verificationCodes`)).json();
  return r.verificationCodes.at(-1)?.code;
};
const accounts = async () => (await (await fetch(`http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:query`, { method: 'POST', headers: { Authorization: 'Bearer owner', 'content-type': 'application/json' }, body: '{}' })).json()).userInfo || [];

// حساب جديد بالإيميل
await p.goto(B + '#/register'); await p.waitForSelector('[name=name]');
await p.fill('[name=name]', 'سارة'); await p.fill('[name=handle]', 'sara_phone'); await p.fill('[name=phone]', '01122223333');
await p.fill('[name=email]', 'sara@test.com'); await p.fill('[name=password]', 'secret123');
await p.check('[name=agree]'); await p.check('[name=agreeTransfer]'); await p.click('#authForm button[type=submit]');
await p.waitForSelector('.card, .empty', { timeout: 20000 });

// رقم مش مربوط: يترفض ومايفضلش حساب جديد
await p.goto(B + '#/account'); await p.waitForSelector('#logout'); await p.click('#logout'); await p.waitForSelector('#userNav a[href="#/login"]', { timeout: 15000, state: 'attached' });
await p.goto(B + '#/login');
await p.waitForSelector('[data-mode="phone"]'); await p.click('[data-mode="phone"]');
const before = (await accounts()).length;
await p.fill('#phoneLogin [name=phone]', '01122223333'); await p.click('#phoneLogin button[type=submit]'); await p.waitForSelector('#phoneLogin [name=code]', { timeout: 15000 });
await p.fill('#phoneLogin [name=code]', await lastCode()); await p.click('#phoneLogin button[type=submit]');
await p.waitForFunction(() => document.getElementById('toast')?.textContent.includes('مش متفعّل'), null, { timeout: 15000 });
ok(true, 'unlinked number refused');
await p.waitForTimeout(800);
ok((await accounts()).length === before, 'no stray account left behind');

// يدخل بالإيميل ويربط الرقم
await p.click('[data-mode="login"]'); await p.fill('[name=email]', 'sara@test.com'); await p.fill('[name=password]', 'secret123'); await p.click('#authForm button[type=submit]');
await p.waitForFunction(() => !location.hash.startsWith('#/login'), null, { timeout: 15000 });
await p.goto(B + '#/account'); await p.waitForSelector('#phoneLinkBox [data-start-link]', { timeout: 15000 });
await p.click('#phoneLinkBox [data-start-link]'); await p.click('#phoneLinkBox button[type=submit]');
await p.waitForSelector('#phoneLinkBox [name=code]', { timeout: 15000 });
await p.fill('#phoneLinkBox [name=code]', await lastCode()); await p.click('#phoneLinkBox button[type=submit]');
await p.waitForSelector('#phoneLinkBox .ok-text', { timeout: 15000 });
ok((await p.textContent('#phoneLinkBox')).includes('01122223333'), 'number linked to the account');

// خروج ودخول بالكود
await p.click('#logout'); await p.waitForSelector('#userNav a[href="#/login"]', { timeout: 15000, state: 'attached' }); await p.goto(B + '#/login'); await p.waitForSelector('[data-mode="phone"]'); await p.click('[data-mode="phone"]');
await p.fill('#phoneLogin [name=phone]', '01122223333'); await p.click('#phoneLogin button[type=submit]'); await p.waitForSelector('#phoneLogin [name=code]', { timeout: 15000 });
await p.fill('#phoneLogin [name=code]', '000000'); await p.click('#phoneLogin button[type=submit]');
await p.waitForSelector('#phoneLogin .form-error:not([hidden])', { timeout: 15000 });
ok((await p.textContent('#phoneLogin .form-error')).includes('الكود غلط'), 'wrong code refused');
await p.fill('#phoneLogin [name=code]', await lastCode()); await p.click('#phoneLogin button[type=submit]');
await p.waitForFunction(() => !location.hash.startsWith('#/login'), null, { timeout: 15000 });
await p.waitForSelector('#userNav a[href="#/account"]', { timeout: 15000, state: 'attached' });
ok((await p.textContent('#userNav')).includes('سارة'), 'logged into the same account with the SMS code');
console.log('errors', errs);
await b.close();
if (fails.length || errs.length) { console.log('FAILED'); process.exit(1); }
console.log('ALL PASSED');
