import { chromium } from 'playwright';
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const SP = ROOT + '/out';
const B = 'http://127.0.0.1:8765/', PROJECT = 'demo-talabaty', FB = 'https://www.gstatic.com/firebasejs/10.12.2/';
const cfg = `export const firebaseConfig = { apiKey: 'demo-key', authDomain: '${PROJECT}.firebaseapp.com', projectId: '${PROJECT}', appId: 'demo' }; export const useEmulators = true;`;
const b = await chromium.launch(); const errs = [];
async function newCtx(name) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  await ctx.route(/fonts\.googleapis|cdnjs|tile\.openstreetmap/, r => r.abort());
  await ctx.route(FB + '*', r => r.fulfill({ path: `${ROOT}/node_modules/firebase/${r.request().url().split('/').pop()}`, contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' } }));
  await ctx.route('**/js/firebase-config.js', r => r.fulfill({ body: cfg, contentType: 'application/javascript' }));
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(name + ': ' + e.message));
  p.on('console', m => m.type() === 'error' && !/ERR_FAILED|net::|permission|400/i.test(m.text()) && errs.push(name + ': ' + m.text()));
  p.on('dialog', d => d.type() === 'prompt' ? d.accept(p._prompt ?? '') : d.accept());
  return p;
}
let n = 0;
async function register(p, name, email, username) {
  n++;
  await p.waitForSelector('.auth-card').catch(async (e) => { console.log('ERRS', errs, p.url(), (await p.content()).slice(0, 1500)); throw e; }); await p.click('[data-mode="register"]');
  await p.fill('[name=name]', name); await p.fill('[name=handle]', username); await p.fill('[name=phone]', '0101111222' + n);
  await p.fill('[name=email]', email); await p.fill('[name=password]', 'secret123'); await p.check('[name=agree]'); await p.check('[name=agreeTransfer]'); await p.click('#authForm button[type=submit]');
}
const H = { Authorization: 'Bearer owner', 'content-type': 'application/json' };
const docUrl = (path) => `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents/${path}`;
const api = (p, fnSrc, arg) => p.evaluate(async ({ fnSrc, arg }) => {
  const { getApp } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js');
  const { getAuth } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js');
  const F = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
  const db = F.getFirestore(getApp()); const me = getAuth(getApp()).currentUser.uid;
  const tests = eval(fnSrc)(F, db, me, arg); const out = [];
  for (const [k, fn] of Object.entries(tests)) { try { await fn(); out.push(k.startsWith('valid') ? `${k}: ALLOWED ✅ (expected)` : `${k}: ALLOWED ❌`); } catch (e) { out.push(`${k}: ${e.code}`); } }
  return out.join('\n');
}, { fnSrc, arg });

const a = await newCtx('admin');
await a.goto(B + 'admin.html'); await register(a, 'سابري', 'admin@test.com', 'sabry'); await a.waitForSelector('text=الصفحة دي للأدمن بس');
const all = await (await fetch(`http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:query`, { method: 'POST', headers: H, body: '{}' })).json();
const adminUid = all.userInfo[0].localId;
for (let i = 0; i < 50; i++) { const d = await (await fetch(docUrl(`users/${adminUid}`), { headers: H })).json(); if (d.fields?.username) break; await new Promise(r => setTimeout(r, 200)); }
await fetch(docUrl(`users/${adminUid}?updateMask.fieldPaths=role`), { method: 'PATCH', headers: H, body: JSON.stringify({ fields: { role: { stringValue: 'admin' } } }) });
await a.waitForSelector('.stats');
await a.click('[data-tab="zones"]'); await a.click('#sampleZones'); await a.click('#settingsForm button[type=submit]'); await a.waitForSelector('text=تم حفظ الإعدادات');
await a.click('[data-tab="restaurants"]'); await a.click('#seedBtn'); await a.waitForSelector('[data-owner] >> nth=7'); console.log('restaurants seeded ✔');

// ---- الأدمن يعمل كوبونات
await a.click('[data-tab="coupons"]'); await a.waitForSelector('#couponForm');
await a.selectOption('#perOrder', '2'); await a.click('#perOrderForm button[type=submit]'); await a.waitForSelector('text=تم الحفظ');
const addCoupon = async (c) => {
  await a.waitForFunction(() => document.querySelector('[name=code]') && !document.querySelector('[name=code]').value && !document.querySelector('#couponForm button[type=submit]').disabled);
  await a.fill('[name=code]', c.code); await a.selectOption('[name=type]', c.type); await a.waitForTimeout(100);
  if (c.value != null) await a.fill('[name=value]', String(c.value));
  if (c.max != null) await a.fill('[name=maxDiscount]', String(c.max));
  if (c.min != null) await a.fill('[name=minOrder]', String(c.min));
  if (c.limit != null) await a.fill('[name=limit]', String(c.limit));
  if (c.once) await a.check('[name=onePerCustomer]');
  if (c.off) await a.uncheck('[name=active]');
  await a.click('#couponForm button[type=submit]'); await a.waitForSelector(`.coupon-code >> text=${c.code}`, { timeout: 5000 }).catch(async (e) => { console.log('TOAST', await a.textContent('#toast'), await a.$eval('#couponForm', f => JSON.stringify(Object.fromEntries(new FormData(f))))); throw e; });
};
await addCoupon({ code: 'save10', type: 'percent', value: 10, max: 30 });
await addCoupon({ code: 'ONCE50', type: 'fixed', value: 50, once: true });
await addCoupon({ code: 'FREE1', type: 'delivery', limit: 1 });
await addCoupon({ code: 'BIG', type: 'fixed', value: 40, min: 1000 });
await addCoupon({ code: 'OFF', type: 'percent', value: 50, off: true });
// كود مكرر
await a.waitForFunction(() => !document.querySelector('[name=code]').value && !document.querySelector('#couponForm button[type=submit]').disabled);
await a.fill('[name=code]', 'SAVE10'); await a.fill('[name=value]', '5'); await a.click('#couponForm button[type=submit]'); await a.waitForTimeout(500);
console.log('duplicate code toast:', await a.textContent('#toast'));
await a.screenshot({ path: `${SP}/coupons-admin.png`, fullPage: true });
console.log('coupons list:', await a.$$eval('.coupon-code', x => x.map(e => e.textContent)));

// ---- العميل
const c = await newCtx('customer');
await c.goto(B + '#/register'); await register(c, 'عميل', 'cust@test.com', 'cust1'); await c.waitForTimeout(1500);
await c.goto(B + '#/restaurant/burger-house'); await c.waitForSelector('[data-add="bh2"]'); await c.click('[data-add="bh2"]'); await c.click('[data-inc="bh2"]'); await c.click('[data-inc="bh2"]');
await c.goto(B + '#/cart'); await c.waitForSelector('#zoneSelect'); await c.selectOption('#zoneSelect', 'maadi'); await c.waitForSelector('#promoInput');
console.log('cart has example hint?', (await c.textContent('#app')).includes('جرّب'), '| placeholder:', await c.getAttribute('#promoInput', 'placeholder'));
const apply = async (code) => { await c.fill('#promoInput', code); await c.click('#promoForm button'); await c.waitForTimeout(700); return (await c.textContent('#toast')).trim(); };
console.log('wrong code ->', await apply('NOPE'));
console.log('inactive ->', await apply('OFF'));
console.log('min order ->', await apply('BIG'));
console.log('save10 (lowercase input) ->', await apply('save10'));
console.log('once50 ->', await apply('ONCE50'));
console.log('3rd coupon field shown?', !!(await c.$('#promoInput')));
console.log('summary:', (await c.textContent('.summary')).replace(/\s+/g, ' '));
await c.screenshot({ path: `${SP}/coupons-cart.png`, fullPage: true });
await c.goto(B + '#/checkout'); await c.waitForSelector('#placeBtn'); await c.fill('textarea[name=address]', 'المعادي'); await c.click('#placeBtn'); await c.waitForSelector('.track', { timeout: 15000 });
console.log('order with 2 coupons placed ✔', (await c.textContent('.summary')).replace(/\s+/g, ' '));

// once50 تاني لنفس العميل
await c.goto(B + '#/restaurant/burger-house'); await c.waitForSelector('[data-add="bh2"]'); await c.click('[data-add="bh2"]'); await c.click('[data-inc="bh2"]');
await c.goto(B + '#/cart'); await c.waitForSelector('#promoInput');
console.log('once50 again ->', await apply('ONCE50'));
console.log('free1 ->', await apply('FREE1'));
await c.goto(B + '#/checkout'); await c.waitForSelector('#placeBtn'); await c.fill('textarea[name=address]', 'المعادي'); await c.click('#placeBtn'); await c.waitForSelector('.track', { timeout: 15000 });
console.log('order with FREE1 placed ✔');

// ---- محاولات تحايل مباشرة على Firestore
const res = await api(c, `(F, db, me, arg) => {
  const base = (st, promos, extra = {}) => ({ customerUid: me, status: 'placed', createdAt: F.serverTimestamp(), lines: [{ id: 'bh1', name: 'x', price: 100, qty: 1 }],
    restaurantId: 'burger-house', ownerUid: null, driverUid: null, rates: st.rates, zoneId: 'maadi', totals: { subtotal: 200, delivery: st.zones.maadi.fee, service: 0, discount: 0, total: 200 }, promos, ...extra });
  const order = async (promos, bump = [], uses = [], extra) => {
    const st = (await F.getDoc(F.doc(db, 'settings', 'app'))).data();
    const ref = F.doc(F.collection(db, 'orders')); const b = F.writeBatch(db);
    b.set(ref, base(st, promos, extra));
    bump.forEach((code) => b.update(F.doc(db, 'coupons', code), { used: F.increment(1), lastOrder: ref.id }));
    uses.forEach((code) => b.set(F.doc(db, 'couponUses', me, 'codes', code), { orderId: ref.id, at: 1 }));
    await b.commit();
  };
  return {
    listCoupons: () => F.getDocs(F.collection(db, 'coupons')),
    createCoupon: () => F.setDoc(F.doc(db, 'coupons', 'HACK'), { active: true, type: 'percent', value: 100, used: 0 }),
    editCoupon: () => F.updateDoc(F.doc(db, 'coupons', 'SAVE10'), { value: 100 }),
    resetUsed: () => F.updateDoc(F.doc(db, 'coupons', 'FREE1'), { used: 0 }),
    bumpWithoutOrder: () => F.updateDoc(F.doc(db, 'coupons', 'SAVE10'), { used: F.increment(1), lastOrder: 'nope' }),
    fakeCode: () => order(['HACK'], ['HACK']),
    noCounter: () => order(['SAVE10']),
    inactive: () => order(['OFF'], ['OFF']),
    limitReached: () => order(['FREE1'], ['FREE1']),
    belowMin: () => order(['BIG'], ['BIG']),
    oncePerCustomerAgain: () => order(['ONCE50'], ['ONCE50'], ['ONCE50']),
    duplicateCode: () => order(['SAVE10', 'SAVE10'], ['SAVE10']),
    tooMany: () => order(['SAVE10', 'FREE1', 'ONCE50'], ['SAVE10']),
    deleteMyUse: () => F.deleteDoc(F.doc(db, 'couponUses', me, 'codes', 'ONCE50')),
    validControl: () => order(['SAVE10'], ['SAVE10']),
  };
}`);
console.log(res);
// السليم: كوبون صالح بالـ API (للتأكد إن الاختبار نفسه مضبوط)
const ok = await c.evaluate(async () => {
  const { getApp } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js');
  const F = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
  const db = F.getFirestore(getApp());
  const s = (await F.getDoc(F.doc(db, 'coupons', 'SAVE10'))).data();
  return s.used;
});
console.log('SAVE10 used count:', ok);
const ad = await api(a, `(F, db) => ({ adminList: async () => { const n = (await F.getDocs(F.collection(db, 'coupons'))).size; throw Object.assign(new Error(), { code: 'OK list=' + n }); } })`);
console.log(ad);

// ---- صور الشكاوى: Cloudinary بس
console.log(await api(c, `(F, db, me) => {
  const t = (image, extra = {}) => F.addDoc(F.collection(db, 'tickets'), { uid: me, name: 'x', topic: 'order', subject: 'صنف ناقص', status: 'open', lastBy: 'user', createdAt: 1, updatedAt: 1,
    messages: [{ by: me, name: 'x', text: 'ناقص', at: 1, ...(image ? { image } : {}), ...extra }] });
  return {
    validTicketCloudinaryImage: () => t('https://res.cloudinary.com/qrp8inik/image/upload/c_limit,w_1200/v1/arrivo/x.jpg'),
    ticketEvilImage: () => t('https://evil.example.com/x.jpg'),
    ticketOtherCloudinaryAccount: () => t('https://res.cloudinary.com/someoneelse/image/upload/x.jpg'),
    ticketLongName: () => F.addDoc(F.collection(db, 'tickets'), { uid: me, name: 'x', topic: 'order', subject: 's', status: 'open', lastBy: 'user', createdAt: 1, updatedAt: 1, messages: [{ by: me, name: 'خدمة العملاء'.repeat(10), text: 'x', at: 1 }] }),
    ticketJsImage: () => t('javascript:alert(1)'),
    ticketHtmlInjectExtraKey: () => t(null, { html: '<img src=x onerror=alert(1)>' }),
  };
}`));

// ---- قايمة الكوبونات اللي خلصت
await a.click('[data-tab="overview"]'); await a.click('[data-tab="coupons"]'); await a.waitForSelector('.coupon-group');
console.log('coupon groups:', await a.$$eval('.coupon-group', x => x.map(e => e.textContent.trim())));
console.log('finished group has FREE1:', await a.evaluate(() => { const h = [...document.querySelectorAll('.coupon-group')].find(e => e.textContent.includes('خلصت')); let n = h.nextElementSibling; const out = []; while (n && !n.matches('.coupon-group')) { out.push(n.querySelector?.('.coupon-code')?.textContent); n = n.nextElementSibling; } return out; }));
await a.screenshot({ path: `${SP}/coupons-groups.png`, fullPage: true });

// ---- حد أوردرات المندوب = 2
await a.click('[data-tab="zones"]'); await a.waitForSelector('#maxDriverOrders'); await a.fill('#maxDriverOrders', '2'); await a.click('#settingsForm button[type=submit]'); await a.waitForSelector('text=تم حفظ الإعدادات');
const d = await newCtx('driver');
await d.goto(B + 'delivery.html'); await register(d, 'مندوب', 'drv@test.com', 'drv1'); await d.waitForTimeout(1500);
const all2 = await (await fetch(`http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:query`, { method: 'POST', headers: H, body: '{}' })).json();
const drvUid = all2.userInfo.find(u => u.email === 'drv@test.com').localId;
await fetch(docUrl(`users/${drvUid}?updateMask.fieldPaths=role`), { method: 'PATCH', headers: H, body: JSON.stringify({ fields: { role: { stringValue: 'driver' } } }) });
// 3 طلبات جديدة من العميل، والأدمن يخليها "بتتجهز"
for (let i = 0; i < 3; i++) {
  await c.goto(B + '#/restaurant/burger-house'); await c.waitForSelector('[data-add="bh2"]'); await c.click('[data-add="bh2"]'); await c.click('[data-inc="bh2"]');
  await c.goto(B + '#/checkout'); await c.waitForSelector('#placeBtn'); await c.fill('textarea[name=address]', 'المعادي'); await c.click('#placeBtn'); await c.waitForSelector('.track', { timeout: 15000 });
}
const ordersList = (await (await fetch(docUrl('orders?pageSize=50'), { headers: H })).json()).documents;
const placed = ordersList.filter(o => o.fields.status.stringValue === 'placed').map(o => o.name.split('/').pop());
for (const id of placed) await fetch(docUrl(`orders/${id}?updateMask.fieldPaths=status`), { method: 'PATCH', headers: H, body: JSON.stringify({ fields: { status: { stringValue: 'preparing' } } }) });
console.log('preparing orders:', placed.length);
await d.reload(); await d.waitForSelector('[data-claim]', { timeout: 20000 }); await d.waitForTimeout(800);
console.log('load bar:', (await d.textContent('.load-bar')).replace(/\s+/g, ' '));
await d.click('[data-claim] >> nth=0'); await d.waitForTimeout(1500);
await d.$eval('[data-tab="available"]', e => e.click()); await d.waitForSelector('[data-claim]'); await d.click('[data-claim] >> nth=0'); await d.waitForTimeout(1500);
await d.$eval('[data-tab="available"]', e => e.click()); await d.waitForSelector('.load-bar');
console.log('after 2 claims:', (await d.textContent('.load-bar')).replace(/\s+/g, ' '), '| button:', await d.textContent('[data-claim]'), 'disabled:', await d.$eval('[data-claim]', e => e.disabled));
await d.screenshot({ path: `${SP}/driver-limit.png` });
const third = await d.$eval('[data-claim]', e => e.dataset.claim);
const mineIds = (await (await fetch(docUrl('driverLoads/' + drvUid), { headers: H })).json()).fields.orders.arrayValue.values.map(v => v.stringValue);
console.log('load doc:', mineIds.length);
console.log(await api(d, `(F, db, me, arg) => {
  const claim = (withLoad) => { const b = F.writeBatch(db); b.update(F.doc(db, 'orders', arg.third), { driverUid: me, driverName: 'x', driverPhone: 'x', driverUsername: null, claimedAt: 1 });
    if (withLoad) b.set(F.doc(db, 'driverLoads', me), { orders: [...arg.mine, arg.third] }); return b.commit(); };
  return {
    claimWithoutLoad: () => claim(false),
    claimOverLimit: () => claim(true),
    dropActiveFromLoad: () => F.updateDoc(F.doc(db, 'driverLoads', me), { orders: F.arrayRemove(arg.mine[0]) }),
    clearLoad: () => F.setDoc(F.doc(db, 'driverLoads', me), { orders: [] }),
    addFakeOrder: () => F.updateDoc(F.doc(db, 'driverLoads', me), { orders: F.arrayUnion(arg.third) }),
    otherDriverLoad: () => F.setDoc(F.doc(db, 'driverLoads', 'someoneElse'), { orders: [] }),
  };
}`, { third, mine: mineIds }));
// الأدمن يلغي واحد من أوردراته → المندوب يقدر ياخد غيره
await fetch(docUrl(`orders/${mineIds[0]}?updateMask.fieldPaths=status`), { method: 'PATCH', headers: H, body: JSON.stringify({ fields: { status: { stringValue: 'cancelled' } } }) });
await d.waitForTimeout(4000);
const after = (await (await fetch(docUrl('driverLoads/' + drvUid), { headers: H })).json()).fields.orders.arrayValue.values || [];
console.log('load after admin cancel (self-heal):', after.length);
await d.$eval('[data-tab="available"]', e => e.click()); await d.waitForSelector('[data-claim]');
console.log('button now:', await d.textContent('[data-claim]'));
await d.click('[data-claim]'); await d.waitForTimeout(1500);
console.log('3rd claimed ->', await d.textContent('#toast'));
// تسليم: المندوب يستلم ويوصّل → الأوردر يتشال من لستته
const second = mineIds[1];
await fetch(docUrl(`orders/${second}?updateMask.fieldPaths=status`), { method: 'PATCH', headers: H, body: JSON.stringify({ fields: { status: { stringValue: 'ready' } } }) });
await d.$eval('[data-tab="active"]', e => e.click()); await d.waitForSelector(`[data-id="${second}"][data-status="on_way"]`); await d.click(`[data-id="${second}"][data-status="on_way"]`);
await d.waitForSelector(`[data-id="${second}"][data-status="delivered"]`);
// ---- المندوب مياخدش طلب هو اللي عامله
const selfId = await d.evaluate(async () => {
  const { getApp } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js');
  const { getAuth } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js');
  const F = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
  const db = F.getFirestore(getApp()); const me = getAuth(getApp()).currentUser.uid;
  const st = (await F.getDoc(F.doc(db, 'settings', 'app'))).data();
  const ref = await F.addDoc(F.collection(db, 'orders'), { customerUid: me, status: 'placed', createdAt: F.serverTimestamp(), lines: [{ id: 'bh2', name: 'x', price: 100, qty: 1 }],
    restaurantId: 'burger-house', ownerUid: null, driverUid: null, rates: st.rates, zoneId: 'maadi', totals: { subtotal: 100, delivery: st.zones.maadi.fee, service: 0, discount: 0, total: 100 }, promos: [] });
  return ref.id;
});
await fetch(docUrl(`orders/${selfId}?updateMask.fieldPaths=status`), { method: 'PATCH', headers: H, body: JSON.stringify({ fields: { status: { stringValue: 'preparing' } } }) });
console.log(await api(d, `(F, db, me, id) => ({
  driverClaimsOwnOrder: async () => { const b = F.writeBatch(db); b.update(F.doc(db, 'orders', id), { driverUid: me, driverName: 'x', driverPhone: 'x', driverUsername: null, claimedAt: 1 }); b.set(F.doc(db, 'driverLoads', me), { orders: F.arrayUnion(id) }, { merge: true }); await b.commit(); },
})`, selfId));
await fetch(docUrl(`orders/${selfId}?updateMask.fieldPaths=status`), { method: 'PATCH', headers: H, body: JSON.stringify({ fields: { status: { stringValue: 'cancelled' } } }) });

// ---- راجع طلبك قبل ما تدفع: محاولات تلاعب من العميل والمندوب
console.log(await api(c, `(F, db, me, id) => ({
  missingTooMuch: () => F.updateDoc(F.doc(db, 'orders', id), { missing: [{ i: 0, name: 'x', qty: 1, amount: 99999 }], missingAmount: 99999, updatedAt: 1 }),
  missingPlusStatus: () => F.updateDoc(F.doc(db, 'orders', id), { missing: [{ i: 0, name: 'x', qty: 1, amount: 1 }], missingAmount: 1, status: 'delivered' }),
  missingZero: () => F.updateDoc(F.doc(db, 'orders', id), { missing: [{ i: 0, name: 'x', qty: 1, amount: 0 }], missingAmount: 0 }),
  customerConfirmsOwnClaim: () => F.updateDoc(F.doc(db, 'orders', id), { missingDecision: 'confirmed' }),
  validReportMissing: () => F.updateDoc(F.doc(db, 'orders', id), { missing: [{ i: 0, name: 'x', qty: 1, amount: 10 }], missingAmount: 10, updatedAt: 1 }),
  reportMissingTwice: () => F.updateDoc(F.doc(db, 'orders', id), { missing: [{ i: 0, name: 'x', qty: 1, amount: 20 }], missingAmount: 20, updatedAt: 2 }),
})`, second));
console.log(await api(d, `(F, db, me, id) => ({
  deliverBeforeAnswer: () => F.updateDoc(F.doc(db, 'orders', id), { status: 'delivered', statusHistory: F.arrayUnion({ status: 'delivered', at: 1 }), updatedAt: 1 }),
  driverBadDecision: () => F.updateDoc(F.doc(db, 'orders', id), { missingDecision: 'paid-me' }),
  driverChangesAmount: () => F.updateDoc(F.doc(db, 'orders', id), { missingDecision: 'confirmed', missingAmount: 1 }),
  validDriverConfirms: () => F.updateDoc(F.doc(db, 'orders', id), { missingDecision: 'confirmed', updatedAt: 1 }),
  driverDecidesTwice: () => F.updateDoc(F.doc(db, 'orders', id), { missingDecision: 'disputed', updatedAt: 2 }),
})`, second));
await d.waitForTimeout(800); await d.click(`[data-id="${second}"][data-status="delivered"]`); await d.waitForTimeout(1500);
// ---- التقييمات: محاولات تلاعب
const reviewTests = (who) => `(F, db, me, arg) => {
  const rv = (id, extra = {}) => ({ orderId: id, restaurantId: 'burger-house', name: 'x', food: 4, delivery: null, comment: '', createdAt: F.serverTimestamp(), ...extra });
  const write = async (id, review, sum, count = 1) => { const b = F.writeBatch(db); b.set(F.doc(db, 'reviews', id), review);
    const r = (await F.getDoc(F.doc(db, 'restaurants', 'burger-house'))).data();
    b.update(F.doc(db, 'restaurants', 'burger-house'), { ratingSum: (r.ratingSum || 0) + sum, ratingCount: (r.ratingCount || 0) + count, lastReview: id }); await b.commit(); };
  return ${who === 'c' ? `{
    reviewNotDelivered: () => write(arg.notDelivered, rv(arg.notDelivered), 4),
    reviewInflatedSum: () => write(arg.done, rv(arg.done, { food: 1 }), 5),
    reviewFood6: () => write(arg.done, rv(arg.done, { food: 6 }), 6),
    reviewExtraKey: () => write(arg.done, rv(arg.done, { verified: true }), 4),
    reviewWithCustomerId: () => write(arg.done, rv(arg.done, { customerUid: me }), 4),
    reviewDoubleBumpSameBatch: async () => { const b = F.writeBatch(db); b.set(F.doc(db, 'reviews', arg.done), rv(arg.done));
      b.update(F.doc(db, 'restaurants', 'burger-house'), { ratingSum: F.increment(4), ratingCount: F.increment(1), lastReview: arg.done });
      b.update(F.doc(db, 'restaurants', 'burger-house'), { ratingSum: F.increment(4), ratingCount: F.increment(1), lastReview: arg.done }); await b.commit(); },
    bumpRatingWithoutReview: async () => { const r = (await F.getDoc(F.doc(db, 'restaurants', 'burger-house'))).data(); await F.updateDoc(F.doc(db, 'restaurants', 'burger-house'), { ratingSum: (r.ratingSum || 0) + 5, ratingCount: (r.ratingCount || 0) + 1, lastReview: 'nope' }); },
    validReview: () => write(arg.done, rv(arg.done), 4),
    reviewTwice: () => write(arg.done, rv(arg.done, { food: 5 }), 5),
    deleteMyReview: () => F.deleteDoc(F.doc(db, 'reviews', arg.done)),
  }` : `{
    reviewSomeoneElsesOrder: () => write(arg.done, rv(arg.done), 4),
  }`};
}`;
const notDelivered = mineIds.find((x) => x !== second) || third;
console.log(await api(d, reviewTests('d'), { done: second, notDelivered, drv: drvUid }));
console.log(await api(c, reviewTests('c'), { done: second, notDelivered, drv: drvUid }));
const after2 = (await (await fetch(docUrl('driverLoads/' + drvUid), { headers: H })).json()).fields.orders.arrayValue.values || [];
console.log('load after delivering one:', after2.length);

// ---- الموافقة على الشروط في قاعدة البيانات
const su = await (await fetch(`http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'raw@test.com', password: 'secret123', returnSecureToken: true }) })).json();
const asUser = { Authorization: 'Bearer ' + su.idToken, 'content-type': 'application/json' };
const base = { email: { stringValue: 'raw@test.com' }, name: { stringValue: 'x' }, role: { stringValue: 'customer' }, restaurantId: { nullValue: null }, phone: { stringValue: '' } };
let r1 = await fetch(docUrl(`users?documentId=${su.localId}`), { method: 'POST', headers: asUser, body: JSON.stringify({ fields: base }) });
console.log('create user WITHOUT terms ->', r1.status);
let r1b = await fetch(docUrl(`users?documentId=${su.localId}`), { method: 'POST', headers: asUser, body: JSON.stringify({ fields: { ...base, terms: { mapValue: { fields: { version: { stringValue: '2026-10-21' }, at: { integerValue: '1' } } } } } }) });
console.log('create user WITH terms but NO transfer consent ->', r1b.status);
let r2 = await fetch(docUrl(`users?documentId=${su.localId}`), { method: 'POST', headers: asUser, body: JSON.stringify({ fields: { ...base, terms: { mapValue: { fields: { version: { stringValue: '2026-10-21' }, at: { integerValue: '1' }, transfer: { booleanValue: true } } } } } }) });
console.log('create user WITH terms + transfer ->', r2.status);
let r2b = await fetch(docUrl(`users/${su.localId}?updateMask.fieldPaths=terms`), { method: 'PATCH', headers: asUser, body: JSON.stringify({ fields: { terms: { mapValue: { fields: { version: { stringValue: '2027-01-01' }, at: { integerValue: '2' } } } } } }) });
console.log('update terms dropping transfer ->', r2b.status);
let r3 = await fetch(docUrl(`users/${su.localId}?updateMask.fieldPaths=terms`), { method: 'PATCH', headers: asUser, body: JSON.stringify({ fields: { terms: { mapValue: { fields: { version: { stringValue: '2027-01-01' }, at: { integerValue: '2' }, transfer: { booleanValue: true } } } } } }) });
console.log('update own terms ->', r3.status);

// ---- المفضلة: لستة بحد أقصى 50، ومينفعش تتلزق في تعديل دور أو حاجة تانية
const favPatch = (fields, mask) => fetch(docUrl(`users/${su.localId}?${mask.map(m => 'updateMask.fieldPaths=' + m).join('&')}`), { method: 'PATCH', headers: asUser, body: JSON.stringify({ fields }) });
const ids = (n) => ({ arrayValue: { values: Array.from({ length: n }, (_, i) => ({ stringValue: 'r' + i })) } });
const favChecks = [
  ['validFavorites', await favPatch({ favorites: ids(3) }, ['favorites']), 200],
  ['favorites50', await favPatch({ favorites: ids(50) }, ['favorites']), 200],
  ['favorites51', await favPatch({ favorites: ids(51) }, ['favorites']), 403],
  ['favoritesNotList', await favPatch({ favorites: { stringValue: 'x' } }, ['favorites']), 403],
  ['favoritesPlusRole', await favPatch({ favorites: ids(1), role: { stringValue: 'admin' } }, ['favorites', 'role']), 403],
];
const favBad = favChecks.filter(([, r, want]) => r.status !== want);
favChecks.forEach(([n, r, want]) => console.log(`${n} -> ${r.status} (want ${want})`));
if (favBad.length) errs.push('favorites rules: ' + favBad.map(x => x[0]).join(','));
const custDoc = (await (await fetch(docUrl('users?pageSize=50'), { headers: H })).json()).documents.find(d => d.fields.email?.stringValue === 'cust@test.com');
console.log('UI signup stored terms:', custDoc.fields.terms?.mapValue.fields.version.stringValue, '| transfer:', custDoc.fields.terms?.mapValue.fields.transfer?.booleanValue);
console.log('errors:', errs); await b.close();
