// الخصومات على الأصناف: المطعم بيحط خصم (نسبة أو سعر جديد) وممكن ينتهي في تاريخ معين.
// it.offer = { type: 'percent' | 'price', value, until: 'YYYY-MM-DD' | null }
import { fmt, esc, isAvailable } from './ui.js';

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

// السعر اللي العميل هيدفعه
export const priceOf = (it) => activeOffer(it)?.price ?? Number(it.price);

export function priceHtml(it) {
  const o = activeOffer(it);
  return o
    ? `<span class="price-line"><strong class="sale-price">${fmt(o.price)}</strong> <s class="old-price">${fmt(it.price)}</s> <span class="off-tag">-${o.pct}%</span></span>`
    : `<strong>${fmt(it.price)}</strong>`;
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
