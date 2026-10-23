// السلة: محفوظة في المتصفح. الأسعار بتتحسب من المنيو الحالي للمطعم عشان لو السعر اتغير.
import { isAvailable } from './ui.js';
import { orderTotals, deliversTo } from './finance.js';
import { linePrice } from './offers.js';
import { couponProblem } from './coupons.js';
import { parseKey, resolveOptions } from './options.js';

const KEY = 'talabaty_cart_v2';
const ZONE_KEY = 'arrivo_zone'; // منطقة التوصيل اللي العميل اختارها آخر مرة
const empty = () => ({ restaurantId: null, items: {}, coupons: [], notes: {} });
export const MAX_LINE_NOTE = 100;

function load() {
  try {
    const c = { ...empty(), ...JSON.parse(localStorage.getItem(KEY)) };
    delete c.promo; // الأكواد القديمة كانت ثابتة في الكود
    if (!Array.isArray(c.coupons)) c.coupons = [];
    if (!c.notes || typeof c.notes !== 'object') c.notes = {};
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
  // عدد الصنف في السلة (كل الاختيارات بتاعته مع بعض)
  qty: (itemId) => Object.entries(cart.items).reduce((n, [k, q]) => n + (parseKey(k).itemId === itemId ? q : 0), 0),
  lineQty: (key) => cart.items[key] || 0,
  count: () => Object.values(cart.items).reduce((a, b) => a + b, 0),

  // key = مفتاح السطر (الصنف + اختياراته). يرجّع false لو السلة فيها أصناف من مطعم تاني (مطعم واحد لكل طلب)
  add(restaurantId, key, force = false, count = 1) {
    if (cart.restaurantId && cart.restaurantId !== restaurantId) {
      if (!force) return false;
      cart = empty();
    }
    cart.restaurantId = restaurantId;
    cart.items[key] = (cart.items[key] || 0) + count;
    save();
    return true;
  },

  setQty(key, qty) {
    if (qty <= 0) {
      delete cart.items[key];
      delete cart.notes[key];
    } else cart.items[key] = qty;
    save();
  },

  // ملاحظة للصنف ده بس (مثلًا: من غير بصل)
  note: (key) => cart.notes[key] || '',
  setNote(key, text) {
    const t = String(text || '').trim().slice(0, MAX_LINE_NOTE);
    if (t) cart.notes[key] = t;
    else delete cart.notes[key];
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
    return Object.entries(cart.items).map(([key, qty]) => {
      const { itemId, sel } = parseKey(key);
      const item = all.find((i) => i.id === itemId);
      if (!item || !isAvailable(item)) return null;
      const opt = resolveOptions(item, sel);
      if (!opt.ok) return null; // المطعم غيّر الاختيارات: السطر ده مبقاش صالح
      return {
        key, qty, options: opt.labels, note: cart.notes[key] || '',
        item: { ...item, ...linePrice(item, opt) },
      };
    }).filter(Boolean);
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
    const zone = deliversTo(restaurant, this.zoneId) ? settings.zones[this.zoneId] : null;
    return orderTotals(this.subtotal(restaurant), { zone: zone && zone.active !== false ? zone : null, rates: settings.rates,
      coupons: this.usableCoupons(restaurant, settings) });
  },
};
