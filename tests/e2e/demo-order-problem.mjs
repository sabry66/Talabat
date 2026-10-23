// "مشكلة في الطلب؟": زرار في صفحة الطلب، أسباب جاهزة، صورة مرفقة، والإدارة/الموظف يشوفوا الصورة
import { chromium } from 'playwright';
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const SP = ROOT + '/out';
const B = 'http://127.0.0.1:8765/';
const b = await chromium.launch(); const errs = []; const fails = [];
const ok = (cond, msg) => { console.log(cond ? '✔' : '✘', msg); if (!cond) fails.push(msg); };
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', isMobile: true, hasTouch: true });
await ctx.route(/fonts\.googleapis|tile\.openstreetmap|cdnjs|nominatim/, r => r.abort());
await ctx.route('**/js/firebase-config.js', r => r.fulfill({ contentType: 'application/javascript', body: "export const firebaseConfig = { apiKey: '' }; export const useEmulators = false;" }));
await ctx.route('**/js/cloudinary-config.js', r => r.fulfill({ contentType: 'application/javascript', body: "export const cloudinaryConfig = { cloudName: '', uploadPreset: '' };" }));
const login = async (p, email) => { await p.waitForSelector('.auth-card'); await p.click(`[data-demo="${email}"]`); await p.click('#authForm button[type=submit]'); };
const mk = async () => { const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept()); return p; };
// صورة حقيقية من المشروع
const png = ROOT + '/../public/img/favicon.png';

const c = await mk();
await c.goto(B + '#/login'); await login(c, 'customer@demo.com'); await c.waitForSelector('.card');
await c.goto(B + '#/restaurant/burger-house'); await c.waitForSelector('[data-add="bh3"], [data-add]');
await c.click('[data-add]:not([disabled])'); await c.click('[data-add]:not([disabled])').catch(() => {});
await c.goto(B + '#/cart'); await c.waitForSelector('#zoneSelect'); await c.selectOption('#zoneSelect', { index: 1 });
for (let i = 0; i < 5 && await c.$('.warn'); i++) { await c.click('[data-inc]'); await c.waitForTimeout(150); }
await c.goto(B + '#/checkout'); await c.waitForSelector('#placeBtn'); await c.fill('textarea[name=address]', 'عنوان'); await c.click('#placeBtn'); await c.waitForSelector('.track');
const orderId = c.url().split('/').pop();
ok(!!(await c.$('.problem-btn')), 'order page has "مشكلة في الطلب؟" button');
await c.click('.problem-btn'); await c.waitForSelector('#ticketForm');
ok((await c.textContent('#ticketForm')).includes('موظف حقيقي'), 'form promises a real human');
await c.click('[data-issue="صنف ناقص"]');
ok(await c.inputValue('[name=subject]') === 'صنف ناقص', 'issue chip fills the subject');
await c.fill('[name=text]', 'الطلب جه من غير البطاطس');
await c.setInputFiles('#ticketForm [data-photo]', png);
await c.waitForTimeout(300);
ok(!(await c.$eval('.photo-preview', e => e.hidden)), 'photo preview shown');
await c.screenshot({ path: `${SP}/order-problem-form.png`, fullPage: true });
await c.click('#ticketForm button[type=submit]'); await c.waitForSelector('[data-thread]', { timeout: 8000 }).catch(async () => console.log('TOAST:', await c.textContent('#toast'), errs));
const t = await c.evaluate(() => Object.values(JSON.parse(localStorage.getItem('arrivo_demo_db_v3')).tickets).at(-1));
ok(t.orderId === orderId && t.topic === 'order' && t.subject === 'صنف ناقص', 'ticket linked to the order with topic + subject');
ok(/^data:image\/jpeg;base64,/.test(t.messages[0].image || ''), 'photo saved with the message');
ok(!!(await c.$('.msg-img img')), 'customer sees the photo in the thread');
// رد بصورة تانية
await c.fill('#replyForm textarea', 'ودي صورة تانية'); await c.setInputFiles('#replyForm [data-photo]', png);
await c.click('#replyForm button[type=submit]'); await c.waitForTimeout(800);
ok(await c.$$eval('.msg-img img', x => x.length) === 2, 'reply with photo');
// الموظف يشوف الصورة
const s = await mk();
await s.goto(B + 'admin.html'); await login(s, 'staff@demo.com'); await s.waitForSelector('#tabs', { state: 'attached' });
await s.$eval('[data-tab="support"]', e => e.click()); await s.waitForTimeout(500);
await s.click('.ticket-row >> nth=0').catch(async () => { await s.$eval('[data-open], .ticket-row', e => e.click()); });
await s.waitForTimeout(800);
ok(await s.$$eval('.msg-img img', x => x.length) >= 1, 'staff sees the customer photo');
await s.screenshot({ path: `${SP}/order-problem-staff.png`, fullPage: true });
console.log('errors', errs); if (errs.length) fails.push('page errors');
console.log(fails.length ? `FAILED: ${fails.length}` : 'ALL PASSED');
await b.close();
