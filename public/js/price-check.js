// المطعم بيراجع أسعار الطلب على المنيو بتاعه: قواعد Firestore بتتأكد إن الفاتورة متسقة (الأكل + التوصيل − الخصم)،
// بس مقدرش تلف على كل صنف وتقارنه بالمنيو، فالمطعم هو اللي بيشوف لو حد عدّل الأسعار قبل ما يقبل
import { parseKey, resolveOptions } from './options.js';

const round = (n) => Math.round((Number(n) || 0) * 100) / 100;

// أقل سعر ممكن للصنف (من غير ما نبص على تاريخ الخصم، عشان لو الخصم خلص بعد ما العميل طلب)
function lowestPrice(it, base = Number(it.price) || 0) {
  const o = it.offer;
  if (!o || !(Number(o.value) > 0)) return base;
  const full = Number(it.price) || 0;
  const off = o.type === 'percent' ? round(full * (1 - Math.min(Number(o.value), 95) / 100)) : Number(o.value);
  // الحجم المختار: بنفس نسبة الخصم على سعر الصنف
  return off > 0 && off < full ? round(base * (off / full)) : base;
}

// بيرجّع لستة بالمشاكل (فاضية = الأسعار مظبوطة)
export function priceProblems(o, restaurant) {
  const out = [];
  const lines = Array.isArray(o.lines) ? o.lines : [];
  const sum = round(lines.reduce((s, l) => s + (Number(l.price) || 0) * (Number(l.qty) || 0), 0));
  if (Math.abs(sum - (Number(o.totals?.subtotal) || 0)) > 0.5) out.push(`مجموع الأصناف ${sum} مش زي تمن الأكل في الفاتورة ${o.totals?.subtotal}`);
  const items = (restaurant?.menu || []).flatMap((s) => s.items || []);
  lines.forEach((l) => {
    if (!(Number(l.qty) > 0) || !Number.isInteger(Number(l.qty))) { out.push(`عدد غلط في "${l.name}"`); return; }
    const it = items.find((x) => x.id === l.id);
    if (!it) return; // صنف اتشال من المنيو بعد الطلب
    const opt = resolveOptions(it, parseKey(l.key || l.id).sel);
    const floor = round(lowestPrice(it, opt.ok && opt.base != null ? opt.base : undefined) + (opt.ok ? opt.extra : 0));
    if (Number(l.price) < floor - 0.5) out.push(`"${l.name}" متسجل بـ ${l.price} والمنيو بـ ${floor}`);
  });
  return out;
}
