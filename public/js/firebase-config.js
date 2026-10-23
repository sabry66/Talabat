// ⚙️ إعدادات Firebase
// انسخ الإعدادات من: Firebase Console ← Project settings ← Your apps ← Web app ← SDK setup and configuration
// والصقها مكان القيم الفاضية تحت.
//
// طول ما apiKey فاضي، التطبيق بيشتغل في "الوضع التجريبي": كل البيانات بتتحفظ في المتصفح بس.
// القيم دي مش سرية، عادي تتحط في الكود؛ الحماية الحقيقية في ملف firestore.rules.
export const firebaseConfig = {
  apiKey: 'AIzaSyBnQ1Bgug3kQw6pScivzgD85oar3Z5C-Bs',
  authDomain: 'arrivo-932e4.firebaseapp.com',
  projectId: 'arrivo-932e4',
  storageBucket: 'arrivo-932e4.firebasestorage.app',
  messagingSenderId: '827504796401',
  appId: '1:827504796401:web:3f3dfbc6e0f64dc4893f50',
};

// 🔔 الإشعارات والتطبيق مقفول (Push). سيبه فاضي لحد ما تعمل الخطوات اللي في SETUP.md (محتاجة خطة Blaze):
// Firebase Console ← Project settings ← Cloud Messaging ← Web Push certificates ← Generate key pair، وانسخ المفتاح هنا.
export const pushVapidKey = '';

// 📱 الدخول برقم الموبايل بكود SMS. خليها false لحد ما تفعّل Phone في Firebase (الرسايل بفلوس، شوف SETUP.md)
export const phoneLogin = false;

// للمطورين: true لتشغيل التطبيق على Firebase Emulators على جهازك
export const useEmulators = false;
