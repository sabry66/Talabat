// ⚙️ إعدادات رفع الصور على Cloudinary (مجاني ومش محتاج فيزا)
// الخطوات في SETUP.md: اعمل حساب ← Settings ← Upload ← Add upload preset (Signing mode: Unsigned)
// طول ما القيم فاضية، رفع الصور بيكون مقفول (وفي الوضع التجريبي الصور بتتحفظ في المتصفح).
export const cloudinaryConfig = {
  cloudName: 'qrp8inik',
  uploadPreset: 'Arrivo',
};
