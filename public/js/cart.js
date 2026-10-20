// السلة: محفوظة في المتصفح. الأسعار بتتحسب من المنيو الحالي للمطعم عشان لو السعر اتغير.
import { PROMO_CODES } from './data.js';
import { isAvailable } from './ui.js';
import { orderTotals } from './finance.js';

const KEY = 'talabaty_cart_v2';
const ZONE_KEY = 'arrivo_zone'; // منطقة التوصيل اللي العميل اختارها آخر مرة
const empty = () => ({ restaurantId: null, items: {}, promo: null });

function load() {
  try { return { ...empty(), ...JSON.parse(localStorage.getItem(KEY)) }; } catch { return empty(); }
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
  get promo() { return cart.promo; },
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

  applyPromo(code) {
    const c = code.trim().toUpperCase();
    if (!PROMO_CODES[c]) return false;
    cart.promo = c;
    save();
    return true;
  },

  removePromo() {
    cart.promo = null;
    save();
  },

  // الأصناف الموجودة ومتاحة في منيو المطعم دلوقتي
  lines(restaurant) {
    if (!restaurant || restaurant.id !== cart.restaurantId) return [];
    const all = restaurant.menu.flatMap((s) => s.items);
    return Object.entries(cart.items)
      .map(([id, qty]) => ({ item: all.find((i) => i.id === id), qty }))
      .filter((l) => l.item && isAvailable(l.item));
  },

  // settings = إعدادات المنصة (المناطق والنسب)
  totals(restaurant, settings) {
    const subtotal = this.lines(restaurant).reduce((s, l) => s + l.item.price * l.qty, 0);
    const zone = settings.zones[this.zoneId];
    return orderTotals(subtotal, { zone: zone && zone.active !== false ? zone : null, rates: settings.rates, promo: cart.promo });
  },
};
