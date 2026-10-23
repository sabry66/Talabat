// تقييمات المطاعم: متوسط تقييمات العملاء الحقيقية (ratingSum / ratingCount على المطعم).
// لو لسه مفيش تقييمات حقيقية بنعرض "جديد". الأرقام القديمة (rating/reviews) اللي كانت في البيانات التجريبية
// مش بتظهر خالص، عشان عرض تقييمات مش حقيقية للعملاء بيضللهم.

export function ratingOf(r) {
  const count = Number(r?.ratingCount) || 0;
  if (count > 0) return { avg: Math.round((Number(r.ratingSum) / count) * 10) / 10, count, real: true };
  return { avg: 0, count: 0, real: false };
}

export const ratingValue = (r) => ratingOf(r).avg;

export function ratingBadge(r) {
  const { avg, count } = ratingOf(r);
  return avg ? `⭐ ${avg.toLocaleString('ar-EG')}${count ? ` <span class="muted">(${count.toLocaleString('ar-EG')})</span>` : ''}` : '🆕 جديد';
}

export const stars = (n) => '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n);
