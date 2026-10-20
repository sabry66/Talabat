// اسم المستخدم ورقم الموبايل: كل واحد فيهم لحساب واحد بس في المنصة
export const USERNAME_RE = /^[a-z0-9_.]{3,20}$/;
export const PHONE_RE = /^01[0-9]{9}$/;
const RESERVED = ['admin', 'arrivo', 'support', 'root', 'system'];

export const normalizeUsername = (u) => String(u || '').trim().replace(/^@/, '').toLowerCase();

// أرقام عربي (٠١٢) ← إنجليزي، ونشيل المسافات والشرط
export const normalizePhone = (p) => String(p || '')
  .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
  .replace(/[\s-]/g, '')
  .replace(/^\+?20(?=1)/, '0');

export const idError = (code) => Object.assign(new Error(code), { code });

export function checkUsername(u) {
  if (!USERNAME_RE.test(u)) throw idError('username-invalid');
  if (RESERVED.includes(u)) throw idError('username-taken');
}

export function checkPhone(p) {
  if (!PHONE_RE.test(p)) throw idError('phone-invalid');
}

export const at = (u) => (u ? `@${u}` : '');
