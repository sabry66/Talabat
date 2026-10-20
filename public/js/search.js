// البحث: بيوحّد الحروف العربية عشان "فراخ" و"فرّاخ" و"اسكندراني" و"إسكندراني" يطلعوا نفس النتيجة
import { isAvailable } from './ui.js';

export function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[ً-ْـ]/g, '') // التشكيل والتطويل
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim();
}

// كل كلمة في البحث لازم تكون موجودة في النص (بأي ترتيب)
export function matches(query, ...fields) {
  const words = normalize(query).split(' ').filter(Boolean);
  if (!words.length) return true;
  const hay = normalize(fields.flat().join(' '));
  return words.every((w) => hay.includes(w));
}

export const minPrice = (r) => Math.min(...r.menu.flatMap((s) => s.items).filter(isAvailable).map((i) => i.price));

export const inPriceRange = (price, { priceMin, priceMax }) =>
  (!priceMin || price >= Number(priceMin)) && (!priceMax || price <= Number(priceMax));

export const SORTS = {
  recommended: 'المقترح',
  rating: 'الأعلى تقييمًا',
  time: 'الأسرع توصيلًا',
  price_low: 'الأرخص',
  price_high: 'الأغلى',
};
