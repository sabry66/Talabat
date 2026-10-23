---
name: arrivo-conventions
description: Project conventions for Arrivo (أريفو), the Egyptian food-delivery web app in this repo. Load whenever editing public/, firestore.rules, android/, or answering the owner. Covers language, UI, architecture, security rules, deploy, and what never to commit.
user-invocable: false
---

# أريفو — قواعد المشروع

## الكلام مع صاحب المشروع
- بالعامية المصرية، بسيط ومن غير مصطلحات من غير شرح. هو بيعمل deploy من ويندوز:
  `cd /d D:\Arrivo\Talabat-claude-web-orders-app-design-1utclh\Talabat-claude-web-orders-app-design-1utclh` ثم `firebase deploy`.
- بعد أي تعديل: commit + push على `claude/web-orders-app-design-1utclh`، وقوله ينزّل الـ ZIP ويعمل deploy.

## الشكل
- عربي، `dir="rtl"`، خط Cairo محلي (`public/fonts`)، الألوان من `:root` في `public/css/style.css` (`--brand #2d245b`، `--accent #e39b34`).
- الموبايل أولًا: 360px من غير أي حاجة طالعة برّه الشاشة، الخانات 16px (الآيفون مبيعملش زووم)، القايمة الجانبية (`drawer.js`) بتنقل روابط الهيدر وتبويبات `#tabs` لوحدها.
- النصوص اللي بتظهر للناس بالمصري الواضح ("دوّر"، "اطلب"، "مفيش").

## الكود
- HTML/CSS/JS عادي، ES modules، من غير build. `public/js/backend/index.js` بيختار `firebase.js` أو `local.js` (الوضع التجريبي) — **أي دالة جديدة في الباك إند لازم تتعمل في الاتنين بنفس الشكل**.
- ⚠️ ممنوع استيراد دايري يوصل لـ `backend/index.js` (فيه top-level await): مثلًا `finance.js` و`coupons.js` ميستوردوش `ui.js`. ده وقّع الموقع قبل كده في وضع Firebase بس.
- الصفحات اللي فيها فورم متتعادش رسمها مع التحديث اللحظي (الكتابة بتتمسح).
- كل طلب بيحفظ النسب وقت ما اتعمل (`order.rates`)، والحسابات في `finance.js`.

## الحماية
- كل صلاحية لازم تبقى في `firestore.rules` مش في الواجهة بس. أي تعديل فيها يتجرب على المحاكي (`/arrivo-test rules`) مع محاولة تلاعب جديدة.
- قواعد Firestore: حد 10 قراءات لكل عملية — خلي بالك في `orders` create (عشان كده الكوبونات أقصاها 2).
- البيانات الشخصية: قانون حماية البيانات المصري 151/2020. أي بيانات جديدة بتتجمع لازم تتذكر في `privacy.html`. لو الشروط اتعدلت تعديل مهم: غيّر `LEGAL_VERSION` في `public/js/data.js`.

## ممنوع يترفع أو يتقري أو يتبعت
- ملف التوقيع `android/keystore/*.jks` وكلمة السر بتاعته — المستودع عام.
- أي باسورد أو بيانات دخول بعتها صاحب المشروع في الشات.
- الـ API Secret بتاع Cloudinary (بنستخدم preset unsigned بس).
- نصوص التقييمات الخام في `replica/` (متعملها ignore).
