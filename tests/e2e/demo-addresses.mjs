// العناوين المحفوظة: الحفظ من الطلب، الاختيار السريع في الدفع، وإدارتها من حسابي
import { chromium } from 'playwright';
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const SP = ROOT + '/out';
const B = 'http://127.0.0.1:8765/';
const b = await chromium.launch(); const errs = []; const fails = [];
const ok = (cond, msg) => { console.log(cond ? '✔' : '✘', msg); if (!cond) fails.push(msg); };
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', isMobile: true, hasTouch: true });
await ctx.route(/fonts\.googleapis|tile\.openstreetmap|cdnjs|nominatim/, r => r.abort());
await ctx.route('**/js/firebase-config.js', r => r.fulfill({ contentType: 'application/javascript', body: "export const firebaseConfig = { apiKey: '' }; export const useEmulators = false;" }));
const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
const me = () => p.evaluate(() => { const d = JSON.parse(localStorage.getItem('arrivo_demo_db_v3')); return Object.values(d.users).find(u => u.email === 'customer@demo.com'); });
const addrs = async () => (await me()).addresses || [];
const zoneIds = await (async () => { await p.goto(B + '#/login'); await p.waitForSelector('.auth-card'); await p.click('[data-demo="customer@demo.com"]'); await p.click('#authForm button[type=submit]'); await p.waitForSelector('.card');
  await p.goto(B + '#/restaurant/burger-house'); await p.waitForSelector('[data-add="bh3"]'); await p.click('[data-add="bh3"]');
  await p.goto(B + '#/cart'); await p.waitForSelector('#zoneSelect');
  return p.$$eval('#zoneSelect option', o => o.map(x => x.value).filter(Boolean)); })();

const toCheckout = async (zoneIndex) => {
  await p.goto(B + '#/restaurant/burger-house'); await p.waitForSelector('[data-add="bh3"], [data-inc="bh3"]');
  if (!(await p.$('[data-inc="bh3"]'))) await p.click('[data-add="bh3"]');
  await p.click('[data-inc="bh3"]');
  await p.goto(B + '#/cart'); await p.waitForSelector('#zoneSelect');
  if (zoneIndex) await p.selectOption('#zoneSelect', { index: zoneIndex });
  await p.goto(B + '#/checkout'); await p.waitForSelector('#placeBtn');
};
const place = async () => { await p.click('#placeBtn'); await p.waitForSelector('.track'); await p.waitForTimeout(300); };

// 1) أول طلب: مفيش عناوين، والحفظ متعلّم على "البيت"
await toCheckout(1);
ok(!(await p.$('.addr-pick')), 'no saved-address chooser on first order');
ok(await p.$eval('[name=saveAddr]', e => e.checked) && await p.$eval('[name=addrKind][value=home]', e => e.checked), 'save box defaults to "home"');
await p.fill('textarea[name=address]', 'مدينة نصر، شارع مكرم عبيد، عمارة ٥، الدور ٣');
await place();
let list = await addrs();
ok(list.length === 1 && list[0].kind === 'home' && list[0].address.includes('مكرم عبيد') && list[0].zoneId === zoneIds[0], 'home address saved with its zone');

// 2) الطلب التاني: البيت متختار والعنوان والمنطقة متملين. نضيف الشغل في منطقة تانية
await toCheckout(0);
ok(await p.$eval('[data-addr].active', e => e.textContent.includes('البيت')), 'home chip selected');
ok((await p.inputValue('textarea[name=address]')).includes('مكرم عبيد'), 'address filled from home');
ok(await p.inputValue('#zoneSelect') === zoneIds[0], 'zone filled from home');
await p.screenshot({ path: `${SP}/addresses-checkout.png`, fullPage: true });
await p.click('[data-addr="new"]');
ok(await p.inputValue('textarea[name=address]') === '', 'new address clears the text');
ok(await p.$eval('[name=addrKind][value=work]', e => e.checked), 'second address defaults to "work"');
await p.fill('textarea[name=address]', 'التجمع الخامس، مبنى ٢٠، مكتب ٤');
if (zoneIds[1]) await p.selectOption('#zoneSelect', zoneIds[1]);
await place();
list = await addrs();
ok(list.length === 2 && list.some(a => a.kind === 'work' && a.address.includes('التجمع')), 'work address saved');

// 3) آخر عنوان مستخدم بيتختار الأول، والتبديل بيغير المنطقة
await toCheckout(0);
ok(await p.$eval('[data-addr].active', e => e.textContent.includes('الشغل')), 'last used (work) selected first');
const homeId = list.find(a => a.kind === 'home').id;
await p.click(`[data-addr="${homeId}"]`);
ok((await p.inputValue('textarea[name=address]')).includes('مكرم عبيد') && await p.inputValue('#zoneSelect') === zoneIds[0], 'switching to home refills address and zone');
await p.fill('textarea[name=address]', 'مدينة نصر، شارع مكرم عبيد، عمارة ٥، الدور ٤');
await place();
list = await addrs();
ok(list.length === 2 && list.find(a => a.id === homeId).address.includes('الدور ٤'), 'editing at checkout updates the saved home (no duplicate)');

// 4) حسابي: تعديل وإضافة ومسح
await p.goto(B + '#/account'); await p.waitForSelector('#addrBook .addr-row');
ok((await p.$$('#addrBook .addr-row')).length === 2, 'account lists 2 addresses');
await p.click('#addAddr'); await p.waitForSelector('#addrForm');
await p.check('#addrForm [name=kind][value=other]');
ok(await p.isVisible('#addrNameLbl'), 'name field shows for "other"');
await p.fill('#addrForm [name=name]', 'بيت ماما');
await p.fill('#addrForm textarea[name=address]', 'المعادي، شارع ٩');
await p.click('#addrForm [type=submit]'); await p.waitForTimeout(300);
ok((await p.$$('#addrBook .addr-row')).length === 3 && (await p.textContent('#addrBook')).includes('بيت ماما'), 'added "بيت ماما" from account');
await p.screenshot({ path: `${SP}/addresses-account.png`, fullPage: true });
await p.click(`[data-edit-addr="${homeId}"]`); await p.waitForSelector('#addrForm');
ok((await p.inputValue('#addrForm textarea[name=address]')).includes('الدور ٤'), 'edit form prefilled');
await p.fill('#addrForm textarea[name=address]', 'مدينة نصر، عمارة ٧');
await p.click('#addrForm [type=submit]'); await p.waitForTimeout(300);
list = await addrs();
ok(list.find(a => a.id === homeId).address === 'مدينة نصر، عمارة ٧', 'edit saved');
const workId = list.find(a => a.kind === 'work').id;
await p.click(`[data-del-addr="${workId}"]`); await p.waitForTimeout(300);
ok((await addrs()).length === 2 && !(await addrs()).some(a => a.id === workId), 'delete works');

// 5) الحد الأقصى 10
await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('arrivo_demo_db_v3')); const u = Object.values(d.users).find(x => x.email === 'customer@demo.com');
  u.addresses = Array.from({ length: 10 }, (_, i) => ({ id: 'x' + i, kind: 'other', name: 'ع' + i, address: 'عنوان ' + i, location: null, zoneId: null, usedAt: i })); localStorage.setItem('arrivo_demo_db_v3', JSON.stringify(d)); });
await p.reload(); await p.waitForSelector('#addrBook .addr-row');
ok(!(await p.$('#addAddr')), 'no add button at 10 addresses');
await toCheckout(1); await p.click('[data-addr="new"]');
ok(!(await p.$('[name=saveAddr]')) && (await p.textContent('#addrSave')).includes('الحد الأقصى'), 'checkout explains the 10 limit');
await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('arrivo_demo_db_v3')); Object.values(d.users).find(x => x.email === 'customer@demo.com').addresses = [{ id: 'evil', kind: 'other', name: '<img src=x onerror=alert(1)>', address: '<b>x</b>', usedAt: 1 }]; localStorage.setItem('arrivo_demo_db_v3', JSON.stringify(d)); });
await p.goto(B + '#/account'); await p.reload(); await p.waitForSelector('#addrBook .addr-row');
ok(!(await p.$('#addrBook img')) && (await p.textContent('#addrBook')).includes('<img'), 'address names are escaped');

console.log('errors', errs);
await b.close();
if (fails.length || errs.length) { console.log('FAILED'); process.exit(1); }
console.log('ALL PASSED');
