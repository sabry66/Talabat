// الخصومات على الأصناف: المطعم بيحط خصم (نسبة أو سعر جديد) وممكن ينتهي في تاريخ معين.
// it.offer = { type: 'percent' | 'price', value, until: 'YYYY-MM-DD' | null }
import { fmt, esc, isAvailable } from './ui.js';
import { basePrice, priceGroup } from './options.js';

const today = () => new Date().toISOString().slice(0, 10);

// الخصم الشغال دلوقتي على الصنف (أو null)
export function activeOffer(it) {
  const o = it && it.offer;
  if (!o || !(Number(o.value) > 0)) return null;
  if (o.until && o.until < today()) return null;
  const base = Number(it.price);
  const price = o.type === 'percent'
    ? Math.round(base * (1 - Math.min(Number(o.value), 95) / 100) * 100) / 100
    : Number(o.value);
  if (!(price > 0 && price < base)) return null;
  return { price, pct: Math.round((1 - price / base) * 100), until: o.until || null };
}

// الخصم على سعر معيّن (الحجم المختار): بنفس نسبة الخصم على سعر الصنف
export function discounted(it, price) {
  const o = activeOffer(it);
  return o ? Math.round(price * (o.price / Number(it.price)) * 100) / 100 : price;
}

// السعر اللي العميل هيدفعه (للصنف اللي ليه أحجام: أرخص حجم)
export const priceOf = (it) => (priceGroup(it) ? discounted(it, basePrice(it)) : activeOffer(it)?.price ?? Number(it.price));

// سعر سطر في السلة: opt = resolveOptions(...)؛ الحجم بيحل محل سعر الصنف، والإضافات بتتزود (من غير خصم)
export function linePrice(it, opt) {
  const full = opt.base ?? Number(it.price);
  return { price: Math.round((discounted(it, full) + opt.extra) * 100) / 100, fullPrice: full + opt.extra };
}

export function priceHtml(it) {
  const o = activeOffer(it);
  const from = priceGroup(it) ? '<span class="muted small">من</span> ' : '';
  const full = priceGroup(it) ? basePrice(it) : Number(it.price);
  return o
    ? `<span class="price-line">${from}<strong class="sale-price">${fmt(priceOf(it))}</strong> <s class="old-price">${fmt(full)}</s> <span class="off-tag">-${o.pct}%</span></span>`
    : `${from}<strong>${fmt(full)}</strong>`;
}

export const untilLabel = (until) => (until ? `لحد ${new Date(`${until}T00:00`).toLocaleDateString('ar-EG', { day: 'numeric', month: 'long' })}` : '');

// الأصناف المتاحة اللي عليها خصم في مطعم
export const offerItems = (r) => r.menu.flatMap((sec) => sec.items.filter((it) => isAvailable(it) && activeOffer(it)));

export const hasOffers = (r) => Boolean(r.promo) || offerItems(r).length > 0;

export const offerSummary = (r) => {
  const best = Math.max(0, ...offerItems(r).map((it) => activeOffer(it).pct));
  return best ? `خصم لحد ${best}%` : '';
};

export const promoText = (r) => esc(r.promo || offerSummary(r));
