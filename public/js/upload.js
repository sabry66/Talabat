// رفع الصور (لوجو المطعم وصور الأصناف) على Cloudinary بعد تصغيرها في المتصفح
import { cloudinaryConfig } from './cloudinary-config.js';
import { isDemo } from './backend/index.js';

const configured = () => Boolean(cloudinaryConfig.cloudName && cloudinaryConfig.uploadPreset);

export const uploadsEnabled = () => configured() || isDemo;

async function resize(file, max, quality) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; // خلفية بيضا للصور الشفافة
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas;
}

// بيرجّع لينك الصورة
export async function uploadImage(file) {
  if (!file || !file.type.startsWith('image/')) throw new Error('الملف لازم يكون صورة');
  if (!configured()) {
    if (!isDemo) throw new Error('رفع الصور مش متظبط لسه. حط بيانات Cloudinary في cloudinary-config.js');
    // الوضع التجريبي: صورة صغيرة محفوظة في المتصفح
    return (await resize(file, 360, 0.7)).toDataURL('image/jpeg', 0.7);
  }
  const canvas = await resize(file, 1200);
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
  const body = new FormData();
  body.append('file', blob, 'image.jpg');
  body.append('upload_preset', cloudinaryConfig.uploadPreset);
  body.append('folder', 'arrivo');
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudinaryConfig.cloudName}/image/upload`, { method: 'POST', body });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error?.message || 'فشل رفع الصورة');
  return json.secure_url;
}

// نسخة مصغرة ومربعة من صورة Cloudinary (أسرع في التحميل)
export function thumb(url, size = 300) {
  if (!url) return '';
  if (url.includes('res.cloudinary.com') && url.includes('/upload/')) {
    return url.replace('/upload/', `/upload/c_fill,w_${size},h_${size},f_auto,q_auto/`);
  }
  return url;
}
