// ⚙️ إعدادات Firebase
// انسخ الإعدادات من: Firebase Console ← Project settings ← Your apps ← Web app ← SDK setup and configuration
// والصقها مكان القيم الفاضية تحت.
//
// طول ما apiKey فاضي، التطبيق بيشتغل في "الوضع التجريبي": كل البيانات بتتحفظ في المتصفح بس.
// القيم دي مش سرية، عادي تتحط في الكود؛ الحماية الحقيقية في ملف firestore.rules.
export const firebaseConfig = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: '',
};

// للمطورين: true لتشغيل التطبيق على Firebase Emulators على جهازك
export const useEmulators = false;
