// حسابات الفلوس: إجمالي الطلب، وتقسيمه بين المطعم والمندوب والمنصة.
// كل طلب بيتحفظ معاه النسب اللي كانت شغالة وقت ما اتعمل (order.rates)،
// فلو الأدمن غيّر النسب بعدين، حسابات الطلبات القديمة متتغيرش.
import { DEFAULT_SETTINGS, PAYMENT_METHODS, PAYMENT_LABELS } from './data.js';
import { couponDiscount, MAX_COUPONS_PER_ORDER } from './coupons.js';

export const round = (n) => Math.round((Number(n) || 0) * 100) / 100;

// rate = { type: 'percent' | 'fixed', value }
export function applyRate(rate, base) {
  if (!rate) return 0;
  const v = Number(rate.value) || 0;
  return round(rate.type === 'fixed' ? v : base * v / 100);
}

export const rateLabel = (rate) => (rate.type === 'fixed' ? `${rate.value} ج.م ثابت` : `${rate.value}%`);

// إعدادات طرق الدفع (الكاش والبطاقة شغالين لو الأدمن لسه مظبطش حاجة، زي قواعد Firestore)
export function paymentSettings(settings) {
  const saved = settings?.payments || {};
  return Object.fromEntries(Object.entries(PAYMENT_METHODS).map(([id, m]) => [id, {
    on: typeof saved[id]?.on === 'boolean' ? saved[id].on : m.on,
    note: String(saved[id]?.note || ''),
  }]));
}

// الطرق المتاحة للعميل دلوقتي
export const enabledPayments = (settings) => Object.entries(paymentSettings(settings))
  .filter(([, p]) => p.on)
  .map(([id, p]) => ({ id, label: PAYMENT_LABELS[id], hint: PAYMENT_METHODS[id].hint, note: p.note }));

export function withDefaults(settings) {
  const s = settings || {};
  return {
    zones: s.zones || {},
    rates: { ...DEFAULT_SETTINGS.rates, ...(s.rates || {}) },
    supportPhone: s.supportPhone || '',
    maxDriverOrders: Math.max(0, Math.floor(Number(s.maxDriverOrders ?? DEFAULT_SETTINGS.maxDriverOrders) || 0)),
    payments: paymentSettings(s),
    couponsPerOrder: Math.min(MAX_COUPONS_PER_ORDER, Math.max(0, Number(s.couponsPerOrder ?? DEFAULT_SETTINGS.couponsPerOrder) || 0)),
  };
}

// المطعم بيوصّل للمنطقة دي؟ (من غير لستة = بيوصّل لكل المناطق)
export const deliversTo = (r, zoneId) => !zoneId || !Array.isArray(r?.zones) || r.zones.includes(zoneId);

export const activeZones = (settings) => Object.entries(settings.zones)
  .filter(([, z]) => z.active !== false)
  .map(([id, z]) => ({ id, ...z }))
  .sort((a, b) => a.name.localeCompare(b.name, 'ar'));

// إجمالي طلب العميل (coupons = الكوبونات المطبّقة)
export function orderTotals(subtotal, { zone, rates, coupons = [] }) {
  const delivery = zone ? Number(zone.fee) || 0 : 0;
  const service = applyRate(rates.serviceFee, subtotal);
  const discount = round(Math.min(
    coupons.reduce((s, c) => s + couponDiscount(c, subtotal, delivery), 0),
    subtotal + delivery,
  ));
  // الجزء من الخصم اللي على الأكل نفسه (مش التوصيل) — بنحتاجه لو صنف وصل ناقص
  const foodDiscount = round(Math.min(
    coupons.filter((c) => c.type !== 'delivery').reduce((s, c) => s + couponDiscount(c, subtotal, delivery), 0),
    subtotal,
  ));
  return { subtotal: round(subtotal), delivery, service, discount, foodDiscount, total: round(subtotal + delivery + service - discount) };
}

// ---------- أصناف وصلت ناقصة ----------
// العميل بيبعت أرقام الأصناف والعدد بس؛ الاسم والسعر بناخدهم من الطلب نفسه (مش من اللي اتبعت)
export function missingItems(o) {
  if (!Array.isArray(o?.missing)) return [];
  const seen = new Set();
  const out = [];
  for (const x of o.missing) {
    const i = Number(x?.i);
    const l = o.lines?.[i];
    if (!Number.isInteger(i) || !l || seen.has(i)) continue;
    seen.add(i);
    const qty = Math.min(Math.max(1, Math.floor(Number(x.qty) || 1)), Number(l.qty) || 1);
    out.push({ i, name: l.name, qty, amount: round(l.price * qty) });
  }
  return out;
}

// قيمة الأكل الناقص (بيتحملها المطعم)
export const missingValue = (o) => round(Math.min(missingItems(o).reduce((s, x) => s + x.amount, 0), o.totals.subtotal));

// اللي بيترجع للعميل: قيمة الناقص بعد نصيبها من خصم الكوبون (عشان مياخدش الخصم مرتين، والفلوس متبقاش بالسالب)
export function missingRefund(o) {
  const t = o.totals;
  const food = Math.min(t.foodDiscount ?? t.discount ?? 0, t.subtotal);
  const ratio = t.subtotal ? 1 - food / t.subtotal : 1;
  return round(Math.min(missingValue(o) * ratio, t.total));
}

// بيتخصم بس لو المندوب أكد قدام العميل
export const missingDeduction = (o) => (o.missingDecision === 'confirmed' ? missingRefund(o) : 0);

// اللي العميل دفعه فعلًا (بعد خصم الناقص)
export const paidTotal = (o) => round(Math.max(0, o.totals.total - missingDeduction(o)));

// تقسيم فلوس طلب واحد. الخصم ورسوم الخدمة بيتحملهم/بيروحوا للمنصة، والناقص بيتحمله المطعم.
export function orderSplit(o) {
  const t = o.totals;
  const r = { ...DEFAULT_SETTINGS.rates, ...(o.rates || {}) };
  const confirmed = o.missingDecision === 'confirmed';
  const missing = confirmed ? missingValue(o) : 0; // قيمة الأكل اللي موصلش (على المطعم)
  const food = round(t.subtotal - missing); // الأكل اللي اتسلّم فعلًا
  const commission = Math.min(applyRate(r.commission, food), food);
  const restaurant = round(food - commission);
  const driver = applyRate(r.driverShare, t.delivery);
  const paid = paidTotal(o);
  const platform = round(paid - restaurant - driver);
  const cash = o.payment === 'cash' ? paid : 0; // الكاش اللي المندوب بيحصّله من العميل
  const payRestaurant = r.driverPaysRestaurant ? restaurant : 0; // اللي المندوب بيدفعه للمطعم وقت الاستلام
  return {
    restaurant, driver, platform, commission, cash, payRestaurant, missing,
    // الفلوس اللي مع المندوب ولازم يسلمها للمنصة (لو بالسالب يبقى المنصة عليها فلوس للمندوب)
    driverOwes: round(cash - payRestaurant - driver),
    // الفلوس اللي المنصة لسه عليها للمطعم
    restaurantDue: r.driverPaysRestaurant ? 0 : restaurant,
  };
}

export const sum = (list, fn) => round(list.reduce((s, x) => s + fn(x), 0));
