// كوبونات الخصم: الأدمن بيعملها من لوحته، والعميل بيكتب الكود في السلة.
// coupon = { code, type: 'percent' | 'fixed' | 'delivery', value, maxDiscount, minOrder,
//            expiresAt (ms أو null), limit (0 = مفتوح), used, onePerCustomer, active }
// مش بنستورد ui.js هنا: finance.js بيستورد الملف ده، والباك إند بيستورد finance.js،
// و ui.js بيوصل للباك إند (عن طريق upload.js) فيبقى استيراد دايري ويهنّج التحميل.
const fmt = (n) => `${Number(n || 0).toLocaleString('ar-EG')} ج.م`;

export const COUPON_TYPES = {
  percent: 'نسبة مئوية %',
  fixed: 'مبلغ ثابت (ج.م)',
  delivery: 'توصيل مجاني',
};

// أقصى عدد كوبونات في الطلب الواحد (قواعد الأمان في Firestore بتتحقق من كل كوبون، وليها حد)
export const MAX_COUPONS_PER_ORDER = 2;

export const CODE_RE = /^[A-Z0-9_-]{3,20}$/;
export const normalizeCode = (s) => String(s || '').trim().toUpperCase()
  .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/\s+/g, '');

const round = (n) => Math.round((Number(n) || 0) * 100) / 100;

// قيمة خصم كوبون واحد على طلب
export function couponDiscount(c, subtotal, delivery) {
  if (!c) return 0;
  if (c.type === 'delivery') return round(delivery);
  if (c.type === 'fixed') return round(Math.min(Number(c.value) || 0, subtotal));
  let d = subtotal * (Number(c.value) || 0) / 100;
  if (Number(c.maxDiscount) > 0) d = Math.min(d, Number(c.maxDiscount));
  return round(d);
}

export function couponLabel(c) {
  if (c.type === 'delivery') return 'توصيل مجاني';
  if (c.type === 'fixed') return `خصم ${fmt(c.value)}`;
  return `خصم ${c.value}%${Number(c.maxDiscount) > 0 ? ` (لحد ${fmt(c.maxDiscount)})` : ''}`;
}

export const couponConditions = (c) => [
  Number(c.minOrder) > 0 ? `لطلب من ${fmt(c.minOrder)}` : '',
  c.expiresAt ? `لحد ${new Date(c.expiresAt).toLocaleDateString('ar-EG', { day: 'numeric', month: 'long' })}` : '',
  Number(c.limit) > 0 ? `لأول ${c.limit} طلب` : '',
  c.onePerCustomer ? 'مرة واحدة لكل عميل' : '',
].filter(Boolean).join(' • ');

// ليه الكوبون مينفعش دلوقتي (أو null لو تمام)
export function couponProblem(c, { subtotal = 0 } = {}) {
  if (!c || c.active !== true) return 'الكود ده مش صحيح';
  if (c.expiresAt && Date.now() > c.expiresAt) return 'الكود ده انتهت صلاحيته';
  if (Number(c.limit) > 0 && (c.used || 0) >= Number(c.limit)) return 'الكود ده خلص، اتستخدم العدد المسموح بيه';
  if (Number(c.minOrder) > 0 && subtotal < Number(c.minOrder)) return `الكود ده محتاج طلب بـ ${fmt(c.minOrder)} على الأقل (من غير التوصيل)`;
  return null;
}
