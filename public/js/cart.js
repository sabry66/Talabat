// السلة: محفوظة في المتصفح. الأسعار بتتحسب من المنيو الحالي للمطعم عشان لو السعر اتغير.
import { isAvailable } from './ui.js';
import { orderTotals } from './finance.js';
import { priceOf } from './offers.js';
import { couponProblem } from './coupons.js';

const KEY = 'talabaty_cart_v2';
const ZONE_KEY = 'arrivo_zone'; // منطقة التوصيل اللي العميل اختارها آخر مرة
const empty = () => ({ restaurantId: null, items: {}, coupons: [] });

function load() {
  try {
    const c = { ...empty(), ...JSON.parse(localStorage.getItem(KEY)) };
    delete c.promo; // الأكواد القديمة كانت ثابتة في الكود
    if (!Array.isArray(c.coupons)) c.coupons = [];
    return c;
  } catch { return empty(); }
}

let cart = load();
const listeners = [];

function save() {
  if (!Object.keys(cart.items).length) cart = empty();
  try { localStorage.setItem(KEY, JSON.stringify(cart)); } catch { /* التخزين غير متاح */ }
  listeners.forEach((fn) => fn());
}

export const Cart = {
  subscribe: (fn) => listeners.push(fn),
  get restaurantId() { return cart.restaurantId; },
  // الكوبونات المطبّقة (نسخة من بيانات الكوبون، وبتتراجع تاني قبل الطلب)
  get coupons() { return cart.coupons; },
  get zoneId() { try { return localStorage.getItem(ZONE_KEY); } catch { return null; } },
  setZone(id) {
    try { localStorage.setItem(ZONE_KEY, id); } catch { /* التخزين غير متاح */ }
    listeners.forEach((fn) => fn());
  },
  qty: (itemId) => cart.items[itemId] || 0,
  count: () => Object.values(cart.items).reduce((a, b) => a + b, 0),

  // يرجّع false لو السلة فيها أصناف من مطعم تاني (مطعم واحد لكل طلب)
  add(restaurantId, itemId, force = false) {
    if (cart.restaurantId && cart.restaurantId !== restaurantId) {
      if (!force) return false;
      cart = empty();
    }
    cart.restaurantId = restaurantId;
    cart.items[itemId] = (cart.items[itemId] || 0) + 1;
    save();
    return true;
  },

  setQty(itemId, qty) {
    if (qty <= 0) delete cart.items[itemId];
    else cart.items[itemId] = qty;
    save();
  },

  clear() {
    cart = empty();
    save();
  },

  addCoupon(coupon) {
    cart.coupons = [...cart.coupons.filter((c) => c.code !== coupon.code), coupon];
    save();
  },

  removeCoupon(code) {
    cart.coupons = cart.coupons.filter((c) => c.code !== code);
    save();
  },

  setCoupons(list) {
    cart.coupons = list;
    save();
  },

  // الأصناف الموجودة ومتاحة في منيو المطعم دلوقتي (بالسعر بعد الخصم لو فيه)
  lines(restaurant) {
    if (!restaurant || restaurant.id !== cart.restaurantId) return [];
    const all = restaurant.menu.flatMap((s) => s.items);
    return Object.entries(cart.items)
      .map(([id, qty]) => ({ item: all.find((i) => i.id === id), qty }))
      .filter((l) => l.item && isAvailable(l.item))
      .map((l) => ({ ...l, item: { ...l.item, price: priceOf(l.item), fullPrice: Number(l.item.price) } }));
  },

  // settings = إعدادات المنصة (المناطق والنسب)
  subtotal(restaurant) {
    return this.lines(restaurant).reduce((s, l) => s + l.item.price * l.qty, 0);
  },

  // الكوبونات اللي هتتحسب فعلًا (في حدود العدد المسموح، وشروطها متحققة زي الحد الأدنى)
  usableCoupons(restaurant, settings) {
    const subtotal = this.subtotal(restaurant);
    return cart.coupons.slice(0, settings.couponsPerOrder ?? 1).filter((c) => !couponProblem(c, { subtotal }));
  },

  totals(restaurant, settings) {
    const zone = settings.zones[this.zoneId];
    return orderTotals(this.subtotal(restaurant), { zone: zone && zone.active !== false ? zone : null, rates: settings.rates,
      coupons: this.usableCoupons(restaurant, settings) });
  },
};
