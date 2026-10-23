// كل معادلات الفلوس: حالات محسوبة بالإيد + 2000 طلب عشوائي بيتأكد فيهم إن الفلوس متوازنة
import { orderTotals, orderSplit, paidTotal, missingRefund, missingValue, applyRate } from '../../public/js/finance.js';
import { couponDiscount } from '../../public/js/coupons.js';
import { resolveOptions, parseKey } from '../../public/js/options.js';
import { priceProblems } from '../../public/js/price-check.js';
import { SEED_RESTAURANTS } from '../../public/js/data.js';

const fails = [];
const near = (a, b) => Math.abs(a - b) < 0.011;
const ok = (cond, msg) => { console.log(cond ? '✔' : '✘', msg); if (!cond) fails.push(msg); };
const eq = (got, want, msg) => ok(near(got, want), `${msg}: ${got} (المتوقع ${want})`);
const pct = (value) => ({ type: 'percent', value });
const fixed = (value) => ({ type: 'fixed', value });
const C = {
  ARRIVO20: { code: 'ARRIVO20', type: 'percent', value: 20, maxDiscount: 100 },
  WELCOME50: { code: 'WELCOME50', type: 'fixed', value: 50 },
  FREEDEL: { code: 'FREEDEL', type: 'delivery', value: 0 },
};
const order = (subtotal, fee, rates, coupons = [], extra = {}) => {
  const totals = orderTotals(subtotal, { zone: { fee }, rates, coupons });
  return { payment: 'cash', lines: [{ name: 'أ', price: subtotal, qty: 1 }], totals, rates, ...extra };
};

console.log('— الكوبونات');
eq(couponDiscount(C.ARRIVO20, 300, 30), 60, '20% من 300');
eq(couponDiscount(C.ARRIVO20, 1000, 30), 100, '20% من 1000 بحد أقصى 100');
eq(couponDiscount(C.WELCOME50, 30, 20), 30, 'خصم ثابت 50 على أكل بـ 30 بيقف عند 30');
eq(couponDiscount(C.FREEDEL, 300, 35), 35, 'توصيل مجاني = سعر التوصيل');
let t = orderTotals(30, { zone: { fee: 20 }, rates: { serviceFee: pct(0) }, coupons: [C.WELCOME50, C.FREEDEL] });
eq(t.discount, 50, 'كوبونين: الخصم مايعديش الأكل + التوصيل');
eq(t.total, 0, 'والإجمالي مايبقاش بالسالب');
eq(t.foodDiscount, 30, 'الجزء من الخصم اللي على الأكل');

console.log('— الحالة 1: كاش + كوبون 20% + رسوم خدمة 5% + عمولة 10% + المندوب 30% من التوصيل');
let o = order(300, 30, { driverShare: pct(30), commission: pct(10), serviceFee: pct(5), driverPaysRestaurant: true }, [C.ARRIVO20]);
eq(o.totals.service, 15, 'رسوم الخدمة 5% من 300');
eq(o.totals.discount, 60, 'الخصم');
eq(o.totals.total, 285, 'العميل يدفع = 300 + 30 + 15 − 60');
let s = orderSplit(o);
eq(s.commission, 30, 'عمولة المنصة 10% من الأكل');
eq(s.restaurant, 270, 'حق المطعم = 300 − 30');
eq(s.driver, 9, 'المندوب = 30% من 30');
eq(s.platform, 6, 'المنصة = 30 عمولة + 15 خدمة + (30 − 9) توصيل − 60 خصم');
eq(s.payRestaurant, 270, 'المندوب بيدفع للمطعم وقت الاستلام');
eq(s.driverOwes, 6, 'المندوب يسلّم للمنصة = 285 − 270 − 9');
eq(s.restaurantDue, 0, 'المطعم خد حقه');

console.log('— الحالة 2: نفس الكلام + صنف بـ 100 وصل ناقص والمندوب أكد');
o = order(300, 30, { driverShare: pct(30), commission: pct(10), serviceFee: pct(0), driverPaysRestaurant: true }, [C.ARRIVO20], {
  lines: [{ name: 'برجر', price: 100, qty: 2 }, { name: 'بطاطس', price: 100, qty: 1 }], missing: [{ i: 1, qty: 1 }], missingDecision: 'confirmed',
});
eq(o.totals.total, 270, 'الفاتورة الأصلية = 300 + 30 − 60');
eq(missingValue(o), 100, 'قيمة الناقص (على المطعم)');
eq(missingRefund(o), 80, 'اللي بيرجع للعميل = 100 − نصيبه من الخصم (20%)');
eq(paidTotal(o), 190, 'العميل دفع فعلًا');
s = orderSplit(o);
eq(s.restaurant, 180, 'حق المطعم = (300 − 100) − 10% عمولة');
eq(s.platform, 1, 'المنصة = 190 − 180 − 9');
eq(s.payRestaurant, 270, 'المندوب دفع للمطعم 270 وقت الاستلام (قبل ما يعرف بالناقص)');
eq(s.driverOwes, -89, 'المنصة عليها للمندوب 89 = (270 دفعها − 190 حصّلها) + 9 مكسبه');
eq(s.restaurantDue, -90, 'المطعم يرجّع 90 للمنصة (قبض تمن أكل موصلش)');

console.log('— الحالة 3: بطاقة + توصيل مجاني + كل النسب مبالغ ثابتة');
o = order(200, 25, { driverShare: fixed(15), commission: fixed(20), serviceFee: fixed(5), driverPaysRestaurant: true }, [C.FREEDEL], { payment: 'card' });
eq(o.totals.total, 205, 'العميل يدفع = 200 + 25 + 5 − 25');
eq(o.totals.foodDiscount, 0, 'التوصيل المجاني مش خصم على الأكل');
s = orderSplit(o);
eq(s.restaurant, 180, 'حق المطعم = 200 − 20');
eq(s.driver, 15, 'المندوب 15 ثابت');
eq(s.platform, 10, 'المنصة = 205 − 180 − 15');
eq(s.cash, 0, 'مفيش كاش (بطاقة)');
eq(s.driverOwes, -195, 'المنصة عليها للمندوب: 180 دفعها للمطعم + 15 مكسبه');

console.log('— الحالة 4: المنصة بتحاسب المطاعم (المندوب مش بيدفع للمطعم)');
o = order(100, 20, { driverShare: pct(50), commission: pct(0), serviceFee: pct(0), driverPaysRestaurant: false });
s = orderSplit(o);
eq(s.payRestaurant, 0, 'المندوب مبيدفعش للمطعم');
eq(s.driverOwes, 110, 'المندوب يسلّم 120 − 10 مكسبه');
eq(s.restaurantDue, 100, 'المنصة عليها 100 للمطعم');
eq(s.platform, 10, 'المنصة = نص التوصيل');

console.log('— الحالة 5: الطلب كله ناقص (مايبقاش فيه فلوس بالسالب)');
o = order(100, 20, { driverShare: pct(30), commission: pct(10), serviceFee: pct(0), driverPaysRestaurant: true }, [C.WELCOME50], {
  lines: [{ name: 'أ', price: 100, qty: 1 }], missing: [{ i: 0, qty: 1 }], missingDecision: 'confirmed',
});
eq(paidTotal(o), 20, 'العميل يدفع التوصيل بس = 70 − (100 − 50)');
s = orderSplit(o);
eq(s.restaurant, 0, 'المطعم مالوش حاجة');
eq(s.restaurantDue, -90, 'ويرجّع اللي قبضه (90)');
ok(paidTotal(o) >= 0, 'المدفوع مش بالسالب');

console.log('— أسعار الأصناف: الخصومات والاختيارات');
const bh = SEED_RESTAURANTS.find((r) => r.id === 'burger-house');
const bh1 = bh.menu[0].items.find((i) => i.id === 'bh1');
const opt = resolveOptions(bh1, parseKey('bh1|gsize:double|gext:cheese,bacon').sel);
eq(opt.extra, 85, 'دبل (45) + جبنة (15) + بيكون (25)');
const menu = { menu: [{ items: [{ ...bh1, offer: { type: 'percent', value: 25 } }] }] };
const goodLine = { id: 'bh1', key: 'bh1|gsize:double|gext:cheese,bacon', name: 'كلاسيك', price: 90 + 85, qty: 1 };
ok(priceProblems({ lines: [goodLine], totals: { subtotal: 175 } }, menu).length === 0, 'سعر بعد خصم 25% + الإضافات (175) مقبول');
ok(priceProblems({ lines: [{ ...goodLine, price: 50 }], totals: { subtotal: 50 } }, menu).length === 1, 'سعر أقل من المنيو بيتكشف');
ok(priceProblems({ lines: [goodLine], totals: { subtotal: 100 } }, menu).length === 1, 'تمن أكل مش زي مجموع الأصناف بيتكشف');

console.log('— 2000 طلب عشوائي: الفلوس لازم تتوازن');
let bad = 0;
const rnd = (n) => Math.floor(Math.random() * n);
const rate = () => (Math.random() < 0.5 ? pct(rnd(40)) : fixed(rnd(30)));
for (let k = 0; k < 2000; k++) {
  const lines = Array.from({ length: 1 + rnd(4) }, (_, i) => ({ name: `ص${i}`, price: 10 + rnd(200) + rnd(100) / 100, qty: 1 + rnd(3) }));
  const sub = Math.round(lines.reduce((a, l) => a + l.price * l.qty, 0) * 100) / 100;
  const rates = { driverShare: rate(), commission: rate(), serviceFee: rate(), driverPaysRestaurant: Math.random() < 0.6 };
  const coupons = [C.ARRIVO20, C.WELCOME50, C.FREEDEL].filter(() => Math.random() < 0.3).slice(0, 2);
  const fee = rnd(60);
  const x = { payment: ['cash', 'card', 'wallet'][rnd(3)], lines, rates, totals: orderTotals(sub, { zone: { fee }, rates, coupons }) };
  if (Math.random() < 0.3) { x.missing = [{ i: rnd(lines.length), qty: 1 + rnd(3) }]; x.missingDecision = Math.random() < 0.7 ? 'confirmed' : 'disputed'; }
  const sp = orderSplit(x);
  const paid = paidTotal(x);
  // 1) اللي العميل دفعه = حق المطعم + المندوب + المنصة
  const balanced = near(paid, sp.restaurant + sp.driver + sp.platform);
  // 2) حركة الفلوس الحقيقية: المنصة بتستلم من المندوب (أو بتدفعله)، وبتدفع للمطعم (أو بتستلم منه)، وفي البطاقة/المحفظة الفلوس جاتلها هي
  const net = (x.payment === 'cash' ? 0 : paid) + sp.driverOwes - sp.restaurantDue;
  const settles = near(net, sp.platform);
  // 3) المندوب بيدفع للمطعم وقت الاستلام، قبل ما حد يعرف بالناقص: يعني نفس المبلغ كأن مفيش ناقص
  const pickupOk = !rates.driverPaysRestaurant || near(sp.payRestaurant, orderSplit({ ...x, missing: undefined, missingDecision: undefined }).restaurant);
  const sane = pickupOk && paid >= 0 && paid <= x.totals.total + 0.001 && x.totals.discount <= sub + fee + 0.001 && sp.restaurant >= 0 && missingRefund(x) <= x.totals.total + 0.001;
  if (!balanced || !settles || !sane) {
    if (bad++ < 3) console.log('✘ طلب مش متوازن', JSON.stringify({ paid, sp, net, totals: x.totals, rates, payment: x.payment, missing: x.missing, d: x.missingDecision }));
  }
}
ok(bad === 0, `كل الـ 2000 طلب متوازنين (${bad} غلط)`);

if (fails.length) { console.log('FAILED'); process.exit(1); }
console.log('ALL PASSED');
