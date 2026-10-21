// حسابات الفلوس: إجمالي الطلب، وتقسيمه بين المطعم والمندوب والمنصة.
// كل طلب بيتحفظ معاه النسب اللي كانت شغالة وقت ما اتعمل (order.rates)،
// فلو الأدمن غيّر النسب بعدين، حسابات الطلبات القديمة متتغيرش.
import { DEFAULT_SETTINGS } from './data.js';
import { couponDiscount, MAX_COUPONS_PER_ORDER } from './coupons.js';

export const round = (n) => Math.round((Number(n) || 0) * 100) / 100;

// rate = { type: 'percent' | 'fixed', value }
export function applyRate(rate, base) {
  if (!rate) return 0;
  const v = Number(rate.value) || 0;
  return round(rate.type === 'fixed' ? v : base * v / 100);
}

export const rateLabel = (rate) => (rate.type === 'fixed' ? `${rate.value} ج.م ثابت` : `${rate.value}%`);

export function withDefaults(settings) {
  const s = settings || {};
  return {
    zones: s.zones || {},
    rates: { ...DEFAULT_SETTINGS.rates, ...(s.rates || {}) },
    supportPhone: s.supportPhone || '',
    couponsPerOrder: Math.min(MAX_COUPONS_PER_ORDER, Math.max(0, Number(s.couponsPerOrder ?? DEFAULT_SETTINGS.couponsPerOrder) || 0)),
  };
}

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
  return { subtotal: round(subtotal), delivery, service, discount, total: round(subtotal + delivery + service - discount) };
}

// تقسيم فلوس طلب واحد. الخصم ورسوم الخدمة بيتحملهم/بيروحوا للمنصة.
export function orderSplit(o) {
  const t = o.totals;
  const r = { ...DEFAULT_SETTINGS.rates, ...(o.rates || {}) };
  const commission = Math.min(applyRate(r.commission, t.subtotal), t.subtotal);
  const restaurant = round(t.subtotal - commission);
  const driver = applyRate(r.driverShare, t.delivery);
  const platform = round(t.total - restaurant - driver);
  const cash = o.payment === 'cash' ? t.total : 0; // الكاش اللي المندوب بيحصّله من العميل
  const payRestaurant = r.driverPaysRestaurant ? restaurant : 0; // اللي المندوب بيدفعه للمطعم وقت الاستلام
  return {
    restaurant, driver, platform, commission, cash, payRestaurant,
    // الفلوس اللي مع المندوب ولازم يسلمها للمنصة (لو بالسالب يبقى المنصة عليها فلوس للمندوب)
    driverOwes: round(cash - payRestaurant - driver),
    // الفلوس اللي المنصة لسه عليها للمطعم
    restaurantDue: r.driverPaysRestaurant ? 0 : restaurant,
  };
}

export const sum = (list, fn) => round(list.reduce((s, x) => s + fn(x), 0));
